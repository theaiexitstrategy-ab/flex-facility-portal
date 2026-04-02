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

function getTable(segment) {
  if (segment === 'athlete') return 'vapi_interactions_athlete';
  if (segment === 'lifestyle') return 'vapi_interactions_lifestyle';
  return null;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!requireAuth(req)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    if (req.method === 'GET') {
      if (req.query.segment) {
        const table = getTable(req.query.segment);
        if (!table) {
          return res.status(400).json({ success: false, error: 'Invalid segment (athlete or lifestyle)' });
        }
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);
        if (error) return res.status(400).json({ success: false, error: error.message });
        const withSegment = data.map(r => ({ ...r, segment: req.query.segment }));
        return res.status(200).json({ success: true, data: withSegment });
      }

      const [athleteRes, lifestyleRes] = await Promise.all([
        supabase.from('vapi_interactions_athlete').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('vapi_interactions_lifestyle').select('*').order('created_at', { ascending: false }).limit(100)
      ]);

      if (athleteRes.error) return res.status(400).json({ success: false, error: athleteRes.error.message });
      if (lifestyleRes.error) return res.status(400).json({ success: false, error: lifestyleRes.error.message });

      const merged = [
        ...athleteRes.data.map(r => ({ ...r, segment: 'athlete' })),
        ...lifestyleRes.data.map(r => ({ ...r, segment: 'lifestyle' }))
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 100);

      return res.status(200).json({ success: true, data: merged });
    }

    if (req.method === 'POST') {
      const table = getTable(req.query.segment);
      if (!table) {
        return res.status(400).json({ success: false, error: 'Missing or invalid segment parameter (athlete or lifestyle)' });
      }
      const { data, error } = await supabase
        .from(table)
        .insert(req.body)
        .select()
        .single();
      if (error) return res.status(400).json({ success: false, error: error.message });
      return res.status(201).json({ success: true, data });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
