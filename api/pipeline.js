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
      const [{ data: athlete, error: e1 }, { data: lifestyle, error: e2 }] = await Promise.all([
        supabase.from('pipeline_athlete').select('*').limit(200),
        supabase.from('pipeline_lifestyle').select('*').limit(200)
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      res.status(200).json([
        ...athlete.map(r => ({ ...r, segment: 'athlete' })),
        ...lifestyle.map(r => ({ ...r, segment: 'lifestyle' }))
      ]);
    } else if (req.method === 'PATCH') {
      const { id, segment } = req.query;
      if (!id || !segment) return res.status(400).json({ error: 'Missing id or segment' });
      const table = segment === 'athlete' ? 'pipeline_athlete' : 'pipeline_lifestyle';
      const { data, error } = await supabase
        .from(table)
        .update(req.body)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      res.status(200).json(data);
    } else if (req.method === 'POST') {
      const { segment, ...body } = req.body || {};
      const table = segment === 'athlete' ? 'pipeline_athlete' : 'pipeline_lifestyle';
      const { data, error } = await supabase
        .from(table)
        .insert(body)
        .select()
        .single();
      if (error) throw error;
      res.status(201).json(data);
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
}
