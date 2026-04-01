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
      supabase
        .from('vapi_chat_interactions_athlete')
        .select('*')
        .order('Date & Time', { ascending: false })
        .limit(100),
      supabase
        .from('vapi_chat_interactions_lifestyle')
        .select('*')
        .order('Date & Time', { ascending: false })
        .limit(100)
    ]);

    if (athleteRes.error) throw athleteRes.error;
    if (lifestyleRes.error) throw lifestyleRes.error;

    const merged = [
      ...athleteRes.data.map(r => ({ ...r, segment: 'athlete' })),
      ...lifestyleRes.data.map(r => ({ ...r, segment: 'lifestyle' }))
    ].sort((a, b) => new Date(b['Date & Time'] || 0) - new Date(a['Date & Time'] || 0)).slice(0, 100);

    res.status(200).json(merged);
  } catch (err) { res.status(500).json({ error: err.message }); }
}
