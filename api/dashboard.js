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
    const [
      { data: contacts, error: e1 },
      { data: bookings, error: e2 },
      { data: pipelineA, error: e3 },
      { data: pipelineL, error: e4 }
    ] = await Promise.all([
      supabase.from('contacts_master').select('*').limit(500),
      supabase.from('bookings_master').select('*').limit(200),
      supabase.from('pipeline_athlete').select('*').limit(200),
      supabase.from('pipeline_lifestyle').select('*').limit(200)
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    if (e3) throw e3;
    if (e4) throw e4;

    const allPipeline = [...pipelineA, ...pipelineL];
    const today = new Date().toISOString().split('T')[0];

    res.status(200).json({
      totalLeads: contacts.length,
      athleteLeads: contacts.filter(c => c.segment === 'athlete' || c.athlete_lead_id).length,
      lifestyleLeads: contacts.filter(c => c.segment === 'lifestyle' || c.lifestyle_lead_id).length,
      totalBookings: bookings.length,
      upcomingBookings: bookings.filter(b => b.booking_date && b.booking_date >= today).length,
      totalPipelineValue: allPipeline.reduce((s, p) => s + (Number(p.deal_value) || 0), 0),
      commissionEarned: 0,
      commissionPending: 0,
      topSources: Object.entries(
        contacts.reduce((acc, c) => { const s = c.source || 'Unknown'; acc[s] = (acc[s] || 0) + 1; return acc; }, {})
      ).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count).slice(0, 5),
      pipelineStages: contacts.reduce((acc, c) => { const s = c.contact_type || 'Unknown'; acc[s] = (acc[s] || 0) + 1; return acc; }, {}),
      recentBookings: bookings.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
