// Portal-side endpoint for the Payments tab. Single file, four actions
// routed by ?action= to keep this repo under Vercel's Hobby plan
// 12-function ceiling (currently at 11 of 12 after this lands).
//
//   GET  /api/portal-payments?action=create-connect-link
//        → Build the Stripe Connect OAuth authorize URL and return it.
//          The dashboard redirects Kenny there; Stripe redirects him
//          back to the portal with ?code=… on success.
//
//   POST /api/portal-payments?action=complete-connect
//        Body: { code }
//        → Exchange the OAuth code for the connected stripe_user_id,
//          upsert into public.stripe_connect_accounts, hydrate
//          charges_enabled / payouts_enabled from the Account object.
//
//   GET  /api/portal-payments?action=get-orders&page=1&status=paid
//        → Paginated orders list (10/page), optional status filter,
//          newest first.
//
//   GET  /api/portal-payments?action=get-revenue-summary&month=YYYY-MM
//        → { revenue, platform_fee_paid, net_to_you, order_count }
//          aggregated over `status = 'paid'` rows for the month.
//          Defaults to current month if month omitted.
//
// client_id is HARDCODED server-side to 'flex-facility' — never trusted
// from the client. This portal is single-tenant by design; routing by
// session client_id is a Phase-N enhancement.
//
// Auth: same JWT-cookie pattern as the rest of this repo (purchases.js,
// dashboard.js, etc.). Mismatch → 401.

import jwt from 'jsonwebtoken';
import supabase from '../lib/supabase.js';
import { PLATFORM_FEE_PCT } from '../lib/platform-config.js';

const CLIENT_ID = 'flex-facility';

function requireAuth(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/flex_session=([^;]+)/);
  if (!match) return null;
  try {
    return jwt.verify(match[1], process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

function originFromReq(req) {
  // Prefer an explicit env var if the operator has set one, otherwise
  // derive from the inbound request. Either works as long as the value
  // is whitelisted in the Stripe Connect dashboard under OAuth settings.
  if (process.env.STRIPE_CONNECT_REDIRECT_ORIGIN) {
    return process.env.STRIPE_CONNECT_REDIRECT_ORIGIN.replace(/\/$/, '');
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

// Tiny fetch wrapper for Stripe's REST API. Avoids pulling in the
// official SDK just for OAuth + a single Account retrieval.
async function stripeFetch(path, { method = 'GET', body = null, asAccount = null } = {}) {
  const headers = {
    'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
    'Stripe-Version': '2024-06-20',
  };
  if (asAccount) headers['Stripe-Account'] = asAccount;
  let fetchOpts = { method, headers };
  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    fetchOpts.body = new URLSearchParams(body).toString();
  }
  const r = await fetch(`https://api.stripe.com${path}`, fetchOpts);
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(json.error?.message || `stripe ${r.status}`);
    e.stripe = json.error;
    e.status = r.status;
    throw e;
  }
  return json;
}

function csvRow(values) {
  return values.map((v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  }).join(',');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = requireAuth(req);
  if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const action = req.query?.action;

  try {
    if (action === 'create-connect-link' && req.method === 'GET') {
      return handleCreateConnectLink(req, res);
    }
    if (action === 'complete-connect' && req.method === 'POST') {
      return handleCompleteConnect(req, res);
    }
    if (action === 'get-orders' && req.method === 'GET') {
      return handleGetOrders(req, res);
    }
    if (action === 'get-revenue-summary' && req.method === 'GET') {
      return handleGetRevenueSummary(req, res);
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({
      success: false,
      error: 'unknown_action',
      hint: 'Use ?action=create-connect-link|complete-connect|get-orders|get-revenue-summary',
    });
  } catch (e) {
    console.error('[portal-payments] uncaught:', e);
    return res.status(500).json({ success: false, error: 'unhandled', detail: e?.message || String(e) });
  }
}

// ─── create-connect-link ─────────────────────────────────────────────

async function handleCreateConnectLink(req, res) {
  if (!process.env.STRIPE_CONNECT_CLIENT_ID) {
    return res.status(500).json({
      success: false,
      error: 'stripe_connect_client_id_missing',
      detail: 'Set STRIPE_CONNECT_CLIENT_ID env var (ca_…) from the Stripe Connect dashboard.',
    });
  }

  const redirectUri = `${originFromReq(req)}/dashboard.html?stripe_connect=callback`;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.STRIPE_CONNECT_CLIENT_ID,
    scope: 'read_write',
    redirect_uri: redirectUri,
    'stripe_user[email]': process.env.KENNY_EMAIL || '',
  });

  const authorizeUrl = `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
  return res.status(200).json({ success: true, url: authorizeUrl });
}

// ─── complete-connect ────────────────────────────────────────────────

async function handleCompleteConnect(req, res) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ success: false, error: 'stripe_env_missing' });
  }

  const { code } = req.body || {};
  if (!code) return res.status(400).json({ success: false, error: 'missing_code' });

  // Exchange the OAuth code for the connected account ID.
  let tokenResp;
  try {
    tokenResp = await stripeFetch('/v1/oauth/token', {
      method: 'POST',
      body: { grant_type: 'authorization_code', code },
    });
  } catch (e) {
    console.error('[portal-payments] oauth/token failed:', e?.stripe || e?.message);
    return res.status(400).json({ success: false, error: 'oauth_exchange_failed', detail: e.message });
  }

  const stripeAccountId = tokenResp.stripe_user_id;
  if (!stripeAccountId) {
    return res.status(400).json({ success: false, error: 'no_account_id_from_stripe' });
  }

  // Fetch live capabilities so we know whether Kenny can actually
  // accept charges & receive payouts. New accounts often complete OAuth
  // before identity verification finishes.
  let account = { charges_enabled: false, payouts_enabled: false };
  try {
    account = await stripeFetch(`/v1/accounts/${stripeAccountId}`);
  } catch (e) {
    console.warn('[portal-payments] account fetch warning:', e?.message);
  }

  // Upsert into stripe_connect_accounts.
  const { data: existing } = await supabase
    .from('stripe_connect_accounts')
    .select('id')
    .eq('client_id', CLIENT_ID)
    .maybeSingle();

  const row = {
    client_id: CLIENT_ID,
    stripe_account_id: stripeAccountId,
    account_status: 'active',
    onboarding_complete: true,
    charges_enabled: !!account.charges_enabled,
    payouts_enabled: !!account.payouts_enabled,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabase
      .from('stripe_connect_accounts')
      .update(row)
      .eq('id', existing.id);
    if (error) {
      console.error('[portal-payments] update failed:', error);
      return res.status(500).json({ success: false, error: 'db_update_failed', detail: error.message });
    }
  } else {
    const { error } = await supabase.from('stripe_connect_accounts').insert(row);
    if (error) {
      console.error('[portal-payments] insert failed:', error);
      return res.status(500).json({ success: false, error: 'db_insert_failed', detail: error.message });
    }
  }

  return res.status(200).json({
    success: true,
    account_id: stripeAccountId,
    charges_enabled: row.charges_enabled,
    payouts_enabled: row.payouts_enabled,
  });
}

// ─── get-orders ──────────────────────────────────────────────────────

async function handleGetOrders(req, res) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = 10;
  const status = (req.query.status || '').trim();
  const wantCsv = req.query.format === 'csv';

  let q = supabase
    .from('orders')
    .select('*', { count: 'exact' })
    .eq('client_id', CLIENT_ID)
    .order('created_at', { ascending: false });

  if (status && status !== 'all') q = q.eq('status', status);

  if (wantCsv) {
    const { data, error } = await q.limit(5000);
    if (error) return res.status(500).json({ success: false, error: error.message });

    const header = csvRow([
      'created_at', 'product_name', 'product_type', 'customer_name',
      'customer_email', 'customer_phone', 'size', 'color',
      'list_price', 'transaction_fee', 'customer_total',
      'platform_fee', 'net_to_you', 'status', 'stripe_payment_intent_id',
    ]);
    const rows = (data || []).map((o) => csvRow([
      o.created_at,
      o.product_name,
      o.product_type,
      o.customer_name,
      o.customer_email,
      o.customer_phone,
      o.size,
      o.color,
      (o.list_price_cents / 100).toFixed(2),
      (o.transaction_fee_cents / 100).toFixed(2),
      (o.customer_total_cents / 100).toFixed(2),
      (o.platform_fee_cents / 100).toFixed(2),
      ((o.list_price_cents - o.platform_fee_cents) / 100).toFixed(2),
      o.status,
      o.stripe_payment_intent_id || '',
    ]));
    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="flex-orders-${new Date().toISOString().slice(0,10)}.csv"`);
    return res.status(200).send(csv);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await q.range(from, to);
  if (error) return res.status(500).json({ success: false, error: error.message });

  return res.status(200).json({
    success: true,
    orders: data || [],
    page,
    page_size: pageSize,
    total: count || 0,
    total_pages: Math.max(1, Math.ceil((count || 0) / pageSize)),
  });
}

// ─── get-revenue-summary ─────────────────────────────────────────────

async function handleGetRevenueSummary(req, res) {
  // First the connect status — tells the frontend whether to render
  // State A (disconnected) or State B (connected w/ dashboard). Bundled
  // here so the dashboard only needs one fetch on tab open.
  const { data: account } = await supabase
    .from('stripe_connect_accounts')
    .select('stripe_account_id, charges_enabled, payouts_enabled, onboarding_complete')
    .eq('client_id', CLIENT_ID)
    .maybeSingle();

  const connected = !!account?.onboarding_complete;

  if (!connected) {
    return res.status(200).json({
      success: true,
      connected: false,
    });
  }

  // Default to the current month. month=YYYY-MM scopes to that calendar
  // month in UTC — Kenny is in CT but cross-timezone reporting is
  // negligible at this volume and avoids a tzdata dependency.
  const monthArg = (req.query.month || '').trim();
  const monthMatch = monthArg.match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const year = monthMatch ? parseInt(monthMatch[1], 10) : now.getUTCFullYear();
  const month = monthMatch ? parseInt(monthMatch[2], 10) - 1 : now.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1)).toISOString();
  const end = new Date(Date.UTC(year, month + 1, 1)).toISOString();

  const { data, error } = await supabase
    .from('orders')
    .select('customer_total_cents, platform_fee_cents, list_price_cents')
    .eq('client_id', CLIENT_ID)
    .eq('status', 'paid')
    .gte('created_at', start)
    .lt('created_at', end);

  if (error) return res.status(500).json({ success: false, error: error.message });

  let revenue = 0, platformFeePaid = 0, netToYou = 0, orderCount = 0;
  for (const o of (data || [])) {
    revenue         += o.customer_total_cents || 0;
    platformFeePaid += o.platform_fee_cents || 0;
    // Kenny's net per order = list_price - platform_fee. The customer's
    // transaction fee stays on the platform side (covers Stripe). See
    // /api/payments.js handleCreateCheckout for the matching app_fee math.
    netToYou        += (o.list_price_cents || 0) - (o.platform_fee_cents || 0);
    orderCount++;
  }

  return res.status(200).json({
    success: true,
    connected: true,
    account_id: account.stripe_account_id,
    charges_enabled: !!account.charges_enabled,
    payouts_enabled: !!account.payouts_enabled,
    month: `${year}-${String(month + 1).padStart(2, '0')}`,
    platform_fee_pct: PLATFORM_FEE_PCT,
    revenue_cents: revenue,
    platform_fee_paid_cents: platformFeePaid,
    net_to_you_cents: netToYou,
    order_count: orderCount,
  });
}
