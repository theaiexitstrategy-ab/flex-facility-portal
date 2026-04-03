import jwt from 'jsonwebtoken';
import supabase from '../lib/supabase.js';
import { deductCredit } from './utils/deductCredit.js';

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
      if (req.query.id) {
        const { data, error } = await supabase.from('bookings_master').select('*').eq('id', req.query.id).single();
        if (error) return res.status(400).json({ success: false, error: error.message });
        return res.status(200).json({ success: true, data });
      }
      let query = supabase.from('bookings_master').select('*');
      if (req.query.upcoming === 'true') {
        const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
        query = query.gte('booking_date', yesterday.toISOString().split('T')[0]);
      }
      if (req.query.status) query = query.eq('status', req.query.status);
      if (req.query.segment) query = query.eq('segment', req.query.segment);
      const { data, error } = await query.order('booking_date', { ascending: true }).limit(200);
      if (error) return res.status(400).json({ success: false, error: error.message });
      return res.status(200).json({ success: true, data });
    }

    if (req.method === 'POST') {
      // Deduct 2 credits for booking SMS (client + coach notification)
      const creditResult = await deductCredit({ count: 2, eventType: 'booking', contactName: req.body?.full_name || req.body?.name });
      if (!creditResult.allowed) {
        // Still create the booking but skip SMS
        console.warn('Low credits — booking SMS skipped. Balance:', creditResult.balance);
      }
      const { data, error } = await supabase.from('bookings_master').insert(req.body).select().single();
      if (error) return res.status(400).json({ success: false, error: error.message });
      return res.status(201).json({ success: true, data, creditsDeducted: creditResult.allowed });
    }

    if (req.method === 'PUT') {
      if (!req.query.id) return res.status(400).json({ success: false, error: 'Missing id' });
      const { booking_date, booking_time, status, notes } = req.body;
      const updates = {};
      if (booking_date !== undefined) updates.booking_date = booking_date;
      if (booking_time !== undefined) updates.booking_time = booking_time;
      if (status !== undefined) updates.status = status;
      if (notes !== undefined) updates.notes = notes;
      const { data, error } = await supabase.from('bookings_master').update(updates).eq('id', req.query.id).select().single();
      if (error) return res.status(400).json({ success: false, error: error.message });
      return res.status(200).json({ success: true, data });
    }

    if (req.method === 'DELETE') {
      if (!req.query.id) return res.status(400).json({ success: false, error: 'Missing id' });
      const { error } = await supabase.from('bookings_master').delete().eq('id', req.query.id);
      if (error) return res.status(400).json({ success: false, error: error.message });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
}
