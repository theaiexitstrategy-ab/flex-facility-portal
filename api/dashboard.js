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

  const action = req.query.action;

  // Health check (merged from /api/health)
  if (action === 'health') {
    try {
      const { data, error } = await supabase.from('contacts_master').select('id').limit(1);
      if (error) throw error;
      return res.status(200).json({ success: true, message: 'Connection confirmed' });
    } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
  }

  // Credits balance (for header pill)
  if (action === 'credits') {
    try {
      const { data } = await supabase.from('sms_credits').select('balance').limit(1).single();
      return res.status(200).json({ success: true, balance: data?.balance ?? 0 });
    } catch { return res.status(200).json({ success: true, balance: 0 }); }
  }

  // Settings read
  if (action === 'settings') {
    try {
      const { data } = await supabase.from('portal_settings').select('setting_key, setting_value');
      const settings = {};
      (data || []).forEach(r => { settings[r.setting_key] = r.setting_value; });
      return res.status(200).json({ success: true, data: settings });
    } catch { return res.status(200).json({ success: true, data: {} }); }
  }

  // Settings toggle
  if (action === 'toggle-setting' && req.method === 'POST') {
    try {
      const { key, value } = req.body || {};
      if (!key) return res.status(400).json({ success: false, error: 'Missing key' });
      await supabase.from('portal_settings').upsert(
        { setting_key: key, setting_value: !!value, updated_at: new Date().toISOString() },
        { onConflict: 'setting_key' }
      );
      return res.status(200).json({ success: true });
    } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
  }

  // Blocked dates - list
  if (action === 'blocked-dates') {
    try {
      const { data } = await supabase.from('blocked_dates').select('*').order('blocked_date', { ascending: true });
      return res.status(200).json({ success: true, data: data || [] });
    } catch { return res.status(200).json({ success: true, data: [] }); }
  }

  // Blocked dates - add
  if (action === 'block-date' && req.method === 'POST') {
    try {
      const { date, reason } = req.body || {};
      if (!date) return res.status(400).json({ success: false, error: 'Missing date' });
      const { data, error } = await supabase.from('blocked_dates').insert({ blocked_date: date, reason: reason || null }).select().single();
      if (error) return res.status(400).json({ success: false, error: error.message });
      return res.status(201).json({ success: true, data });
    } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
  }

  // Blocked dates - unblock
  if (action === 'unblock-date' && req.method === 'POST') {
    try {
      const { date } = req.body || {};
      if (!date) return res.status(400).json({ success: false, error: 'Missing date' });
      await supabase.from('blocked_dates').delete().eq('blocked_date', date);
      return res.status(200).json({ success: true });
    } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
  }

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

    // Start of week (Monday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    startOfWeek.setHours(0, 0, 0, 0);
    const weekStart = startOfWeek.toISOString();

    const leadsThisWeek = allLeads.filter(l => l.created_at && new Date(l.created_at) >= startOfWeek).length;
    const closedLeads = allLeads.filter(l => l.lead_status === 'Closed').length;
    const hotLeads = allLeads.filter(l => {
      const isRecent = l.created_at && (Date.now() - new Date(l.created_at).getTime()) < 7 * 86400000;
      return isRecent && (l.lead_status === 'New' || l.lead_status === 'Contacted');
    }).length;

    // Source distribution
    const topSources = Object.entries(
      allLeads.reduce((acc, l) => { const s = l.source || 'Unknown'; acc[s] = (acc[s] || 0) + 1; return acc; }, {})
    ).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count).slice(0, 5);

    const statusCounts = allLeads.reduce((acc, l) => { const s = l.lead_status || 'New'; acc[s] = (acc[s] || 0) + 1; return acc; }, {});

    // Recent activity
    const recentActivity = [
      ...allLeads.map(l => ({ type: 'lead', name: ((l.first_name || '') + ' ' + (l.last_name || '')).trim(), time: l.created_at })),
      ...(bookings || []).map(b => ({ type: 'booking', name: b.full_name || 'Unknown', time: b.created_at }))
    ].sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0)).slice(0, 10);

    // Credits balance
    let creditBalance = 0;
    try {
      const { data: creditData } = await supabase.from('sms_credits').select('balance').limit(1).single();
      creditBalance = creditData?.balance ?? 0;
    } catch {}

    // Close rate
    const closeRate = allLeads.length > 0 ? Math.round((closedLeads / allLeads.length) * 100) : 0;

    return res.status(200).json({
      success: true,
      data: {
        totalLeads: allLeads.length,
        athleteLeads: (athleteLeads || []).length,
        lifestyleLeads: (lifestyleLeads || []).length,
        leadsThisWeek,
        closedLeads,
        hotLeads,
        closeRate,
        totalBookings: (bookings || []).length,
        upcomingBookings: (bookings || []).filter(b => b.booking_date && b.booking_date >= today).length,
        totalPipelineValue: allPipeline.reduce((s, p) => s + (Number(p.deal_value) || 0), 0),
        totalPurchases: (purchases || []).length,
        purchaseRevenue: (purchases || []).reduce((s, p) => s + (Number(p.amount_paid) || 0), 0),
        creditBalance,
        topSources,
        statusCounts,
        recentActivity,
        recentBookings: (bookings || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5)
      }
    });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
}
