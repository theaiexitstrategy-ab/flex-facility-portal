import supabase from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Missing booking id' });
  }

  const { date, time, status, notes } = req.body || {};

  const fields = {};
  if (date) fields['Date'] = date;
  if (time) fields['Time'] = time;
  if (status) fields['Status'] = status;
  if (notes !== undefined) fields['Notes'] = notes;

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

    return res.status(200).json({
      success: true,
      id: data.id,
      fields: data
    });
  } catch (err) {
    console.error('Booking update error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
