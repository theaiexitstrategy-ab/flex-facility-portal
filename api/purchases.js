import jwt from 'jsonwebtoken';
import supabase from '../lib/supabase.js';

function requireAuth(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/flex_session=([^;]+)/);
  if (!match) return false;
  try { jwt.verify(match[1], process.env.JWT_SECRET); return true; } catch { return false; }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req)) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('purchases_ebook').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) return res.status(400).json({ success: false, error: error.message });
      return res.status(200).json({ success: true, data });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      if (body.stripe_session_id) {
        const { data: existing } = await supabase.from('purchases_ebook').select('id').eq('stripe_session_id', body.stripe_session_id).limit(1);
        if (existing?.length > 0) return res.status(200).json({ success: true, data: existing[0], duplicate: true });
      }
      const { data, error } = await supabase.from('purchases_ebook').insert(body).select().single();
      if (error) return res.status(400).json({ success: false, error: error.message });
      return res.status(201).json({ success: true, data });
    }

    if (req.method === 'PUT') {
      if (!req.query.id) return res.status(400).json({ success: false, error: 'Missing id' });
      const { data, error } = await supabase.from('purchases_ebook').update(req.body).eq('id', req.query.id).select().single();
      if (error) return res.status(400).json({ success: false, error: error.message });
      return res.status(200).json({ success: true, data });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
}
