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

  const seg = req.query.segment || 'athlete';
  const table = seg === 'lifestyle' ? 'leads_lifestyle' : 'leads_athlete';
  const pipelineTable = seg === 'lifestyle' ? 'pipeline_lifestyle' : 'pipeline_athlete';
  const vapiTable = seg === 'lifestyle' ? 'vapi_interactions_lifestyle' : 'vapi_interactions_athlete';
  const contactFK = seg === 'lifestyle' ? 'lifestyle_lead_id' : 'athlete_lead_id';

  try {
    // ── GET ──
    if (req.method === 'GET') {
      // Single lead with linked data
      if (req.query.id) {
        const [{ data: lead, error: e1 }, { data: pipeline }, { data: interactions }] = await Promise.all([
          supabase.from(table).select('*').eq('id', req.query.id).single(),
          supabase.from(pipelineTable).select('*').eq('lead_id', req.query.id).limit(1),
          supabase.from(vapiTable).select('*').eq('lead_id', req.query.id).order('created_at', { ascending: false }).limit(20)
        ]);
        if (e1) return res.status(400).json({ success: false, error: e1.message });

        let bookings = [];
        if (lead.phone) {
          const { data: bk } = await supabase.from('bookings_master').select('*').eq('phone', lead.phone).order('booking_date', { ascending: false }).limit(10);
          bookings = bk || [];
        }

        return res.status(200).json({ success: true, data: { lead, pipeline: pipeline?.[0] || null, interactions: interactions || [], bookings } });
      }

      // List with search, filter, sort, pagination
      const page = parseInt(req.query.page) || 1;
      const perPage = 25;
      const offset = (page - 1) * perPage;
      const sortBy = req.query.sort_by || 'created_at';
      const sortAsc = req.query.sort_dir === 'asc';

      let query = supabase.from(table).select('*', { count: 'exact' });
      if (req.query.status && req.query.status !== 'All') query = query.eq('lead_status', req.query.status);
      if (req.query.search) query = query.or(`first_name.ilike.%${req.query.search}%,last_name.ilike.%${req.query.search}%,phone.ilike.%${req.query.search}%,email.ilike.%${req.query.search}%`);
      const { data, error, count } = await query.order(sortBy, { ascending: sortAsc }).range(offset, offset + perPage - 1);
      if (error) return res.status(400).json({ success: false, error: error.message });
      return res.status(200).json({ success: true, data, total: count, page, perPage });
    }

    // ── POST ──
    if (req.method === 'POST') {
      const body = req.body || {};
      // Upsert by phone
      if (body.phone) {
        const { data: existing } = await supabase.from(table).select('id').eq('phone', body.phone).limit(1);
        if (existing?.length > 0) {
          const { data, error } = await supabase.from(table).update(body).eq('id', existing[0].id).select().single();
          if (error) return res.status(400).json({ success: false, error: error.message });
          return res.status(200).json({ success: true, data });
        }
      }
      const { data: lead, error } = await supabase.from(table).insert(body).select().single();
      if (error) return res.status(400).json({ success: false, error: error.message });

      // Also write to contacts_master
      const contact = { first_name: body.first_name, last_name: body.last_name, email: body.email, phone: body.phone, contact_type: 'Lead', segment: seg, [contactFK]: lead.id };
      if (body.phone) {
        const { data: ec } = await supabase.from('contacts_master').select('id').eq('phone', body.phone).limit(1);
        if (ec?.length > 0) await supabase.from('contacts_master').update(contact).eq('id', ec[0].id);
        else await supabase.from('contacts_master').insert(contact);
      } else {
        await supabase.from('contacts_master').insert(contact);
      }
      return res.status(201).json({ success: true, data: lead });
    }

    // ── PUT ──
    if (req.method === 'PUT') {
      if (!req.query.id) return res.status(400).json({ success: false, error: 'Missing id' });
      const { data, error } = await supabase.from(table).update(req.body).eq('id', req.query.id).select().single();
      if (error) return res.status(400).json({ success: false, error: error.message });
      return res.status(200).json({ success: true, data });
    }

    // ── DELETE ──
    if (req.method === 'DELETE') {
      if (!req.query.id) return res.status(400).json({ success: false, error: 'Missing id' });
      const { error } = await supabase.from(table).delete().eq('id', req.query.id);
      if (error) return res.status(400).json({ success: false, error: error.message });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
}
