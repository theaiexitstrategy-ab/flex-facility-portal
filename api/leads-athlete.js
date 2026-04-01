import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function requireAuth(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/flex_session=([^;]+)/);
  if (!match) return false;
  try { jwt.verify(match[1], process.env.JWT_SECRET); return true; } catch { return false; }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('leads_athlete')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      res.status(200).json(data);
    } else if (req.method === 'POST') {
      const body = req.body || {};
      // Search by phone first, update if found
      if (body.phone) {
        const { data: existing } = await supabase
          .from('leads_athlete')
          .select('id')
          .eq('phone', body.phone)
          .limit(1);
        if (existing && existing.length > 0) {
          const { data, error } = await supabase
            .from('leads_athlete')
            .update(body)
            .eq('id', existing[0].id)
            .select()
            .single();
          if (error) throw error;
          return res.status(200).json(data);
        }
      }
      const { data, error } = await supabase
        .from('leads_athlete')
        .insert(body)
        .select()
        .single();
      if (error) throw error;
      res.status(201).json(data);
    } else if (req.method === 'PATCH') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Missing id' });
      const { data, error } = await supabase
        .from('leads_athlete')
        .update(req.body)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      res.status(200).json(data);
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
}
