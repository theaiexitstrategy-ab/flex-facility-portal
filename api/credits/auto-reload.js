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
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

  try {
    const { enabled, package: pkg, threshold } = req.body || {};

    // Get the single credits row
    const { data: credits } = await supabase.from('sms_credits').select('id').limit(1).single();
    if (!credits) return res.status(400).json({ success: false, error: 'No credits record found' });

    const { error } = await supabase.from('sms_credits').update({
      auto_reload_enabled: !!enabled,
      auto_reload_package: pkg || '25',
      auto_reload_threshold: parseInt(threshold) || 50,
      updated_at: new Date().toISOString()
    }).eq('id', credits.id);

    if (error) return res.status(400).json({ success: false, error: error.message });
    return res.status(200).json({ success: true });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
}
