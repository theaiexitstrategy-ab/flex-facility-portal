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
    const [athlete, lifestyle] = await Promise.all([
      fetchAirtable('VAPI & Chat Interactions — Athlete', { sortField: 'Date & Time', sortDir: 'desc', maxRecords: 100 }),
      fetchAirtable('VAPI & Chat Interactions — Lifestyle', { sortField: 'Date & Time', sortDir: 'desc', maxRecords: 100 })
    ]);
    const merged = [
      ...athlete.map(r => ({ ...r, segment: 'athlete' })),
      ...lifestyle.map(r => ({ ...r, segment: 'lifestyle' }))
    ].sort((a, b) => new Date(b['Date & Time'] || 0) - new Date(a['Date & Time'] || 0)).slice(0, 100);
    res.status(200).json(merged);
  } catch (err) { res.status(500).json({ error: err.message }); }
}
