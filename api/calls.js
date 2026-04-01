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
    const [{ data: athlete, error: e1 }, { data: lifestyle, error: e2 }] = await Promise.all([
      supabase.from('vapi_interactions_athlete').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('vapi_interactions_lifestyle').select('*').order('created_at', { ascending: false }).limit(100)
    ]);
    if (e1) throw e1;
    if (e2) throw e2;

    const merged = [
      ...athlete.map(r => ({ ...r, segment: 'athlete' })),
      ...lifestyle.map(r => ({ ...r, segment: 'lifestyle' }))
    ].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 100);
    res.status(200).json(merged);
  } catch (err) { res.status(500).json({ error: err.message }); }
}
