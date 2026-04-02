import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function requireAuth(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/flex_session=([^;]+)/);
  if (!match) return false;
  try { jwt.verify(match[1], process.env.JWT_SECRET); return true; } catch { return false; }
}

const SEGMENTS = {
  athlete: {
    leads: 'leads_athlete',
    pipeline: 'pipeline_athlete',
    interactions: 'vapi_interactions_athlete',
    contactKey: 'athlete_lead_id',
  },
  lifestyle: {
    leads: 'leads_lifestyle',
    pipeline: 'pipeline_lifestyle',
    interactions: 'vapi_interactions_lifestyle',
    contactKey: 'lifestyle_lead_id',
  },
};

const PER_PAGE = 25;

async function handleGet(req, res, tables) {
  const { id, search, status, page, sort_by, sort_dir } = req.query;

  // Single lead by id
  if (id) {
    const { data: lead, error } = await supabase
      .from(tables.leads)
      .select('*')
      .eq('id', id)
      .single();

    if (error) return res.status(404).json({ success: false, error: 'Lead not found' });

    const [pipelineRes, bookingsRes, interactionsRes] = await Promise.all([
      supabase.from(tables.pipeline).select('*').eq('lead_id', id),
      supabase.from('bookings_master').select('*').eq('phone', lead.phone),
      supabase.from(tables.interactions).select('*').eq('lead_id', id),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        lead,
        pipeline: pipelineRes.data || [],
        bookings: bookingsRes.data || [],
        interactions: interactionsRes.data || [],
      },
    });
  }

  // List leads with filtering, search, pagination, sorting
  const currentPage = Math.max(1, parseInt(page, 10) || 1);
  const sortBy = sort_by || 'created_at';
  const sortDir = sort_dir === 'asc' ? true : false; // ascending = true for supabase

  let query = supabase
    .from(tables.leads)
    .select('*', { count: 'exact' });

  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`
    );
  }

  if (status) {
    query = query.eq('lead_status', status);
  }

  const from = (currentPage - 1) * PER_PAGE;
  const to = from + PER_PAGE - 1;

  const { data, count, error } = await query
    .order(sortBy, { ascending: sortDir })
    .range(from, to);

  if (error) return res.status(500).json({ success: false, error: error.message });

  return res.status(200).json({
    success: true,
    data,
    total: count,
    page: currentPage,
    perPage: PER_PAGE,
  });
}

async function handlePost(req, res, tables) {
  const body = req.body;
  const { phone } = body;

  let lead;

  if (phone) {
    const { data: existing } = await supabase
      .from(tables.leads)
      .select('*')
      .eq('phone', phone)
      .maybeSingle();

    if (existing) {
      const { data: updated, error } = await supabase
        .from(tables.leads)
        .update(body)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) return res.status(500).json({ success: false, error: error.message });
      lead = updated;
    } else {
      const { data: inserted, error } = await supabase
        .from(tables.leads)
        .insert(body)
        .select()
        .single();

      if (error) return res.status(500).json({ success: false, error: error.message });
      lead = inserted;
    }
  } else {
    const { data: inserted, error } = await supabase
      .from(tables.leads)
      .insert(body)
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    lead = inserted;
  }

  // Upsert into contacts_master
  const contactData = {
    phone: lead.phone,
    first_name: lead.first_name,
    last_name: lead.last_name,
    email: lead.email,
    segment: req.query.segment,
    [tables.contactKey]: lead.id,
  };

  if (lead.phone) {
    await supabase
      .from('contacts_master')
      .upsert(contactData, { onConflict: 'phone' });
  }

  return res.status(200).json({ success: true, data: lead });
}

async function handlePut(req, res, tables) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ success: false, error: 'Missing id parameter' });

  const { data: updatedLead, error } = await supabase
    .from(tables.leads)
    .update(req.body)
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ success: false, error: error.message });

  return res.status(200).json({ success: true, data: updatedLead });
}

async function handleDelete(req, res, tables) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ success: false, error: 'Missing id parameter' });

  const { error } = await supabase
    .from(tables.leads)
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json({ success: false, error: error.message });

  return res.status(200).json({ success: true });
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (!requireAuth(req)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const segment = req.query.segment;
  if (!segment || !SEGMENTS[segment]) {
    return res.status(400).json({ success: false, error: 'Invalid or missing segment. Use "athlete" or "lifestyle".' });
  }

  const tables = SEGMENTS[segment];

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(req, res, tables);
      case 'POST':
        return await handlePost(req, res, tables);
      case 'PUT':
        return await handlePut(req, res, tables);
      case 'DELETE':
        return await handleDelete(req, res, tables);
      default:
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
