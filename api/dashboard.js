import jwt from 'jsonwebtoken';

function requireAuth(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/flex_session=([^;]+)/);
  if (!match) return false;
  try { jwt.verify(match[1], process.env.JWT_SECRET); return true; } catch { return false; }
}

async function fetchAirtable(tableName, opts = {}) {
  const base = process.env.AIRTABLE_BASE_ID;
  const key = process.env.AIRTABLE_API_KEY;
  const params = new URLSearchParams();
  params.set('maxRecords', opts.maxRecords || 200);
  if (opts.sortField) { params.set('sort[0][field]', opts.sortField); params.set('sort[0][direction]', opts.sortDir || 'desc'); }
  if (opts.filter) params.set('filterByFormula', opts.filter);
  const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(tableName)}?${params}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`Airtable ${tableName}: ${r.status}`);
  const d = await r.json();
  return d.records.map(rec => ({ id: rec.id, ...rec.fields }));
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (!requireAuth(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const [contacts, bookings, pipelineA, pipelineL] = await Promise.all([
      fetchAirtable('Contacts — Master', { maxRecords: 500 }),
      fetchAirtable('Bookings — Master', { maxRecords: 200 }),
      fetchAirtable('Pipeline — Athlete', { maxRecords: 200 }),
      fetchAirtable('Pipeline — Lifestyle & Bodybuilding', { maxRecords: 200 })
    ]);

    const allPipeline = [...pipelineA, ...pipelineL];
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
