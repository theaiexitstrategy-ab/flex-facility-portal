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
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('bookings_master')
      .select('*')
      .gte('booking_date', dateStr)
      .order('booking_date', { ascending: true })
      .limit(100);
    if (error) throw error;
    res.status(200).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
}
