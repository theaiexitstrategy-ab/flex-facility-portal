import jwt from 'jsonwebtoken';
import supabase from '../lib/supabase.js';

export const config = { api: { bodyParser: false } };

function requireAuth(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/flex_session=([^;]+)/);
  if (!match) return false;
  try { jwt.verify(match[1], process.env.JWT_SECRET); return true; } catch { return false; }
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) { chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk); }
  return Buffer.concat(chunks);
}

async function parseJsonBody(req) {
  try { return JSON.parse((await readBody(req)).toString()); } catch { return {}; }
}

const PACKAGE_AMOUNTS = { '25': 2500, '50': 5000, '100': 10000 };
const PACKAGE_CREDITS = { '25': 250, '50': 625, '100': 2000 };

async function processCredits(paymentIntentId, pkg) {
  const creditsToAdd = PACKAGE_CREDITS[pkg];
  if (!creditsToAdd) return null;
  const { data: existing } = await supabase.from('sms_credit_transactions').select('id').eq('stripe_payment_intent_id', paymentIntentId).limit(1);
  if (existing?.length > 0) {
    const { data: c } = await supabase.from('sms_credits').select('balance').limit(1).single();
    return { newBalance: c?.balance || 0, duplicate: true };
  }
  const { data: credits } = await supabase.from('sms_credits').select('*').limit(1).single();
  if (!credits) return null;
  const newBalance = credits.balance + creditsToAdd;
  await supabase.from('sms_credits').update({ balance: newBalance, lifetime_purchased: credits.lifetime_purchased + creditsToAdd, updated_at: new Date().toISOString() }).eq('id', credits.id);
  await supabase.from('sms_credit_transactions').insert({ type: 'purchase', amount: creditsToAdd, balance_after: newBalance, package: pkg, stripe_payment_intent_id: paymentIntentId });
  return { newBalance, duplicate: false };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  const action = req.query.action;

  // Stripe webhook — no auth
  if (action === 'stripe-webhook') {
    if (req.method !== 'POST') return res.status(405).end();
    try {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const buf = await readBody(req);
      const sig = req.headers['stripe-signature'];
      let event;
      try { event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET); }
      catch (err) { return res.status(400).send('Webhook Error: ' + err.message); }
      if (event.type === 'payment_intent.succeeded') await processCredits(event.data.object.id, event.data.object.metadata?.package);
      if (event.type === 'payment_intent.payment_failed') {
        const pi = event.data.object;
        await supabase.from('sms_credit_transactions').insert({ type: 'refund', amount: 0, balance_after: 0, package: pi.metadata?.package, stripe_payment_intent_id: pi.id, event_type: 'payment_failed' });
      }
      return res.status(200).json({ received: true });
    } catch { return res.status(500).end(); }
  }

  // Stripe config — public
  if (action === 'stripe-config') {
    return res.status(200).json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
  }

  // All other actions require auth
  if (!requireAuth(req)) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    if (action === 'balance') {
      const { data } = await supabase.from('sms_credits').select('*').limit(1).single();
      return res.status(200).json({ success: true, data: data || { balance: 0, lifetime_purchased: 0, lifetime_used: 0, auto_reload_enabled: false, auto_reload_package: '25', auto_reload_threshold: 20 } });
    }

    if (action === 'transactions') {
      const page = parseInt(req.query.page) || 1;
      const perPage = parseInt(req.query.per_page) || 20;
      const from = (page - 1) * perPage;
      const to = from + perPage - 1;
      const { data, count } = await supabase.from('sms_credit_transactions').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(from, to);
      return res.status(200).json({ success: true, data: data || [], total: count || 0, page, perPage });
    }

    if (action === 'auto-reload') {
      if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });
      const body = await parseJsonBody(req);
      const { data: credits } = await supabase.from('sms_credits').select('id').limit(1).single();
      if (!credits) return res.status(400).json({ success: false, error: 'No credits record' });
      await supabase.from('sms_credits').update({ auto_reload_enabled: !!body.enabled, auto_reload_package: body.package || '25', auto_reload_threshold: parseInt(body.threshold) || 20, updated_at: new Date().toISOString() }).eq('id', credits.id);
      return res.status(200).json({ success: true });
    }

    if (action === 'create-payment-intent') {
      if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const body = await parseJsonBody(req);
      if (!PACKAGE_AMOUNTS[body.package]) return res.status(400).json({ success: false, error: 'Invalid package' });
      const pi = await stripe.paymentIntents.create({ amount: PACKAGE_AMOUNTS[body.package], currency: 'usd', metadata: { package: body.package, portal: 'flex-facility' } });
      return res.status(200).json({ success: true, clientSecret: pi.client_secret });
    }

    if (action === 'confirm-purchase') {
      if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const body = await parseJsonBody(req);
      if (!body.paymentIntentId || !body.package) return res.status(400).json({ success: false, error: 'Missing fields' });
      const pi = await stripe.paymentIntents.retrieve(body.paymentIntentId);
      if (pi.status !== 'succeeded') return res.status(400).json({ success: false, error: 'Payment not completed' });
      const result = await processCredits(body.paymentIntentId, body.package);
      if (!result) return res.status(400).json({ success: false, error: 'Processing failed' });
      return res.status(200).json({ success: true, newBalance: result.newBalance });
    }

    return res.status(400).json({ success: false, error: 'Unknown action' });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
}
