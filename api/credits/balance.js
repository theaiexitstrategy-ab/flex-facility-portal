import jwt from 'jsonwebtoken';
import supabase from '../../lib/supabase.js';

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
    const { data, error } = await supabase.from('sms_credits').select('*').limit(1).single();
    if (error) return res.status(200).json({ success: true, data: { balance: 0, lifetime_purchased: 0, lifetime_used: 0, auto_reload_enabled: false, auto_reload_package: '25', auto_reload_threshold: 50 } });
    return res.status(200).json({ success: true, data });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
}
