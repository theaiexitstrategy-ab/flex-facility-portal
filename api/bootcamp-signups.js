// Bootcamp Signups — reservations taken at theflexfacility.com/bootcamp.
//
// Read-only on purpose: the rows are written by the main site's
// /api/bootcamp (checkout) and its Stripe webhook (payment_status). The
// portal shows them; it doesn't edit them. No POST/PUT/DELETE means one
// less way for a stale portal edit to contradict Stripe.
//
// GET /api/bootcamp-signups?search=&status=&page=
//   → { success, data, total, page, perPage }
//
// Always scoped to client_id — the multi-tenant filter is applied here,
// server-side, never passed in from the browser.

import jwt from 'jsonwebtoken';
import supabase from '../lib/supabase.js';

const CLIENT_ID = process.env.PORTAL_CLIENT_ID || 'flex-facility';
const PER_PAGE = 50;

function requireAuth(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/flex_session=([^;]+)/);
  if (!match) return false;
  try { jwt.verify(match[1], process.env.JWT_SECRET); return true; } catch { return false; }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req)) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * PER_PAGE;

    let query = supabase
      .from('bootcamp_signups')
      .select('*', { count: 'exact' })
      .eq('client_id', CLIENT_ID);

    if (req.query.status && req.query.status !== 'All') {
      query = query.eq('payment_status', req.query.status);
    }
    if (req.query.search) {
      // Escape PostgREST's or() delimiters so a comma or paren in the
      // search box can't break out of the filter expression.
      const term = String(req.query.search).replace(/[,()\\]/g, ' ').trim();
      if (term) {
        query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
      }
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + PER_PAGE - 1);

    if (error) return res.status(400).json({ success: false, error: error.message });

    // Paid count is over ALL signups, not just this page — it's the
    // number Kenny actually wants (how many seats are locked in).
    const { count: paidCount } = await supabase
      .from('bootcamp_signups')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', CLIENT_ID)
      .eq('payment_status', 'paid');

    return res.status(200).json({
      success: true,
      data,
      total: count,
      paid: paidCount || 0,
      page,
      perPage: PER_PAGE,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
