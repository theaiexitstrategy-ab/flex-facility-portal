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

  const { segment, search, status, page, sort_by, sort_dir } = req.query;
  const pageNum = parseInt(page) || 1;
  const perPage = 25;
  const offset = (pageNum - 1) * perPage;
  const table = segment === 'lifestyle' ? 'leads_lifestyle' : 'leads_athlete';
  const sortCol = sort_by || 'created_at';
  const sortAsc = sort_dir === 'asc';

  try {
    if (req.method === 'GET') {
      let query = supabase.from(table).select('*', { count: 'exact' });

      if (status && status !== 'All') {
        query = query.eq('lead_status', status);
      }
      if (search) {
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
      }

      query = query.order(sortCol, { ascending: sortAsc }).range(offset, offset + perPage - 1);
      const { data, error, count } = await query;
      if (error) throw error;
      res.status(200).json({ data, total: count, page: pageNum, perPage });
    } else if (req.method === 'POST') {
      const body = req.body || {};
      // Insert lead
      if (body.phone) {
        const { data: existing } = await supabase
          .from(table)
          .select('id')
          .eq('phone', body.phone)
          .limit(1);
        if (existing && existing.length > 0) {
          const { data, error } = await supabase
            .from(table)
            .update(body)
            .eq('id', existing[0].id)
            .select()
            .single();
          if (error) throw error;
          return res.status(200).json(data);
        }
      }

      const { data: lead, error: leadErr } = await supabase
        .from(table)
        .insert(body)
        .select()
        .single();
      if (leadErr) throw leadErr;

      // Also create contacts_master entry
      const contactData = {
        first_name: body.first_name,
        last_name: body.last_name,
        email: body.email,
        phone: body.phone,
        contact_type: 'Lead',
        segment: segment === 'lifestyle' ? 'lifestyle' : 'athlete'
      };
      if (segment === 'lifestyle') {
        contactData.lifestyle_lead_id = lead.id;
      } else {
        contactData.athlete_lead_id = lead.id;
      }

      // Upsert contact by phone
      if (body.phone) {
        const { data: existingContact } = await supabase
          .from('contacts_master')
          .select('id')
          .eq('phone', body.phone)
          .limit(1);
        if (existingContact && existingContact.length > 0) {
          await supabase
            .from('contacts_master')
            .update(contactData)
            .eq('id', existingContact[0].id);
        } else {
          await supabase.from('contacts_master').insert(contactData);
        }
      } else {
        await supabase.from('contacts_master').insert(contactData);
      }

      res.status(201).json(lead);
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
}
