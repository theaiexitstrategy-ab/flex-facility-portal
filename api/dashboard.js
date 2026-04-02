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

  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const [
      { data: athleteLeads, error: e1 },
      { data: lifestyleLeads, error: e2 },
      { data: bookings, error: e3 },
      { data: pipelineA, error: e4 },
      { data: pipelineL, error: e5 },
      { data: purchases, error: e6 },
      { data: contacts, error: e7 }
    ] = await Promise.all([
      supabase.from('leads_athlete').select('id, created_at, first_name, last_name, source, lead_status', { count: 'exact' }).limit(500),
      supabase.from('leads_lifestyle').select('id, created_at, first_name, last_name, source, lead_status', { count: 'exact' }).limit(500),
      supabase.from('bookings_master').select('*').limit(200),
      supabase.from('pipeline_athlete').select('*').limit(200),
      supabase.from('pipeline_lifestyle').select('*').limit(200),
      supabase.from('purchases_ebook').select('id, amount_paid').limit(500),
      supabase.from('contacts_master').select('id, source, segment, contact_type').limit(500)
    ]);
    for (const e of [e1, e2, e3, e4, e5, e6, e7]) { if (e) throw e; }

    const allPipeline = [...(pipelineA || []), ...(pipelineL || [])];
    const today = new Date().toISOString().split('T')[0];
    const allLeads = [...(athleteLeads || []), ...(lifestyleLeads || [])];

    // Source distribution
    const topSources = Object.entries(
      [...(contacts || [])].reduce((acc, c) => { const s = c.source || 'Unknown'; acc[s] = (acc[s] || 0) + 1; return acc; }, {})
    ).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count).slice(0, 5);

    // Lead status funnel
    const statusCounts = allLeads.reduce((acc, l) => { const s = l.lead_status || 'New'; acc[s] = (acc[s] || 0) + 1; return acc; }, {});

    // Recent activity — last 10 leads + bookings combined
    const recentActivity = [
      ...allLeads.map(l => ({ type: 'lead', name: (l.first_name || '') + ' ' + (l.last_name || ''), time: l.created_at })),
      ...(bookings || []).map(b => ({ type: 'booking', name: b.full_name || 'Unknown', time: b.created_at }))
    ].sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0)).slice(0, 10);

    return res.status(200).json({
      success: true,
      data: {
        totalLeads: (athleteLeads || []).length + (lifestyleLeads || []).length,
        athleteLeads: (athleteLeads || []).length,
        lifestyleLeads: (lifestyleLeads || []).length,
        totalBookings: (bookings || []).length,
        upcomingBookings: (bookings || []).filter(b => b.booking_date && b.booking_date >= today).length,
        totalPipelineValue: allPipeline.reduce((s, p) => s + (Number(p.deal_value) || 0), 0),
        totalPurchases: (purchases || []).length,
        purchaseRevenue: (purchases || []).reduce((s, p) => s + (Number(p.amount_paid) || 0), 0),
        topSources,
        statusCounts,
        recentActivity,
        recentBookings: (bookings || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5)
      }
    });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
}
