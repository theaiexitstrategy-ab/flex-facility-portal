import jwt from 'jsonwebtoken';
import supabase from '../lib/supabase.js';

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
    const [athleteRes, lifestyleRes] = await Promise.all([
      supabase.from('pipeline_athlete').select('*').limit(200),
      supabase.from('pipeline_lifestyle').select('*').limit(200)
    ]);

    if (athleteRes.error) throw athleteRes.error;
    if (lifestyleRes.error) throw lifestyleRes.error;

    res.status(200).json([
      ...athleteRes.data.map(r => ({ ...r, segment: 'athlete' })),
      ...lifestyleRes.data.map(r => ({ ...r, segment: 'lifestyle' }))
    ]);
  } catch (err) { res.status(500).json({ error: err.message }); }
}
