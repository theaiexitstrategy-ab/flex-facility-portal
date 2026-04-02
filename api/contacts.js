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
      if (req.query.id) {
        const { data, error } = await supabase.from('contacts_master').select('*').eq('id', req.query.id).single();
        if (error) return res.status(400).json({ success: false, error: error.message });
        return res.status(200).json({ success: true, data });
      }
      let query = supabase.from('contacts_master').select('*');
      if (req.query.segment) query = query.eq('segment', req.query.segment);
      if (req.query.search) query = query.or(`first_name.ilike.%${req.query.search}%,last_name.ilike.%${req.query.search}%,phone.ilike.%${req.query.search}%,email.ilike.%${req.query.search}%`);
      const { data, error } = await query.order('created_at', { ascending: false }).limit(500);
      if (error) return res.status(400).json({ success: false, error: error.message });
      return res.status(200).json({ success: true, data });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      if (body.phone) {
        const { data: existing } = await supabase.from('contacts_master').select('id').eq('phone', body.phone).limit(1);
        if (existing?.length > 0) {
          const { data, error } = await supabase.from('contacts_master').update(body).eq('id', existing[0].id).select().single();
          if (error) return res.status(400).json({ success: false, error: error.message });
          return res.status(200).json({ success: true, data });
        }
      }
      const { data, error } = await supabase.from('contacts_master').insert(body).select().single();
      if (error) return res.status(400).json({ success: false, error: error.message });
      return res.status(201).json({ success: true, data });
    }

    if (req.method === 'PUT') {
      if (!req.query.id) return res.status(400).json({ success: false, error: 'Missing id' });
      const { data, error } = await supabase.from('contacts_master').update(req.body).eq('id', req.query.id).select().single();
      if (error) return res.status(400).json({ success: false, error: error.message });
      return res.status(200).json({ success: true, data });
    }

    if (req.method === 'DELETE') {
      if (!req.query.id) return res.status(400).json({ success: false, error: 'Missing id' });
      const { error } = await supabase.from('contacts_master').delete().eq('id', req.query.id);
      if (error) return res.status(400).json({ success: false, error: error.message });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
}
