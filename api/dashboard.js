import jwt from 'jsonwebtoken';
import supabase from '../lib/supabase.js';

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
    const [contactsRes, bookingsRes, pipelineARes, pipelineLRes] = await Promise.all([
      supabase.from('contacts_master').select('*').limit(500),
      supabase.from('bookings_master').select('*').limit(200),
      supabase.from('pipeline_athlete').select('*').limit(200),
      supabase.from('pipeline_lifestyle').select('*').limit(200)
    ]);

    if (contactsRes.error) throw contactsRes.error;
    if (bookingsRes.error) throw bookingsRes.error;
    if (pipelineARes.error) throw pipelineARes.error;
    if (pipelineLRes.error) throw pipelineLRes.error;

    const contacts = contactsRes.data;
    const bookings = bookingsRes.data;
    const allPipeline = [...pipelineARes.data, ...pipelineLRes.data];
    const today = new Date();

    res.status(200).json({
      totalLeads: contacts.length,
      athleteLeads: contacts.filter(c => c['Sport']).length,
      lifestyleLeads: contacts.filter(c => c['Goal'] && !c['Sport']).length,
      totalBookings: bookings.length,
      upcomingBookings: bookings.filter(b => b['Date'] && new Date(b['Date']) >= today).length,
      totalPipelineValue: allPipeline.reduce((s, p) => s + (Number(p['Deal Value']) || 0), 0),
      commissionEarned: allPipeline.filter(p => p['Commission Paid']).reduce((s, p) => s + (Number(p['Commission Amount']) || 0), 0),
      commissionPending: allPipeline.filter(p => !p['Commission Paid']).reduce((s, p) => s + (Number(p['Commission Amount']) || 0), 0),
      topSources: Object.entries(
        contacts.reduce((acc, c) => { const s = c['Source'] || 'Unknown'; acc[s] = (acc[s] || 0) + 1; return acc; }, {})
      ).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count).slice(0, 5),
      pipelineStages: contacts.reduce((acc, c) => { const s = c['Lead Status'] || 'Unknown'; acc[s] = (acc[s] || 0) + 1; return acc; }, {}),
      recentBookings: bookings.slice(0, 5)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
