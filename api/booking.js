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

  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Missing booking id' });
  }

  const { date, time, status, notes } = req.body || {};
  const fields = {};
  if (date) fields.booking_date = date;
  if (time) fields.booking_time = time;
  if (status) fields.status = status;
  if (notes !== undefined) fields.notes = notes;

  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  try {
    const { data, error } = await supabase
      .from('bookings_master')
      .update(fields)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return res.status(200).json({ success: true, id: data.id, fields: data });
  } catch (err) {
    console.error('Booking update error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
