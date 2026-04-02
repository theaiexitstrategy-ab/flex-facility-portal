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
      const seg = req.query.segment;
      if (seg === 'athlete' || seg === 'lifestyle') {
        const table = seg === 'athlete' ? 'vapi_interactions_athlete' : 'vapi_interactions_lifestyle';
        const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: false }).limit(100);
        if (error) return res.status(400).json({ success: false, error: error.message });
        return res.status(200).json({ success: true, data: data.map(r => ({ ...r, segment: seg })) });
      }
      // Both segments merged
      const [{ data: a, error: e1 }, { data: l, error: e2 }] = await Promise.all([
        supabase.from('vapi_interactions_athlete').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('vapi_interactions_lifestyle').select('*').order('created_at', { ascending: false }).limit(100)
      ]);
      if (e1) return res.status(400).json({ success: false, error: e1.message });
      if (e2) return res.status(400).json({ success: false, error: e2.message });
      const merged = [
        ...(a || []).map(r => ({ ...r, segment: 'athlete' })),
        ...(l || []).map(r => ({ ...r, segment: 'lifestyle' }))
      ].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 100);
      return res.status(200).json({ success: true, data: merged });
    }

    if (req.method === 'POST') {
      const seg = req.query.segment;
      if (!seg || (seg !== 'athlete' && seg !== 'lifestyle')) {
        return res.status(400).json({ success: false, error: 'Missing segment (athlete or lifestyle)' });
      }
      const table = seg === 'athlete' ? 'vapi_interactions_athlete' : 'vapi_interactions_lifestyle';
      const { data, error } = await supabase.from(table).insert(req.body).select().single();
      if (error) return res.status(400).json({ success: false, error: error.message });
      return res.status(201).json({ success: true, data });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
}
