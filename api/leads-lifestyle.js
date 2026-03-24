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
    const leads = await fetchAirtable('Leads — Lifestyle & Bodybuilding', {
      sortField: 'Created Time', sortDir: 'desc', maxRecords: 200
    });
    res.status(200).json(leads);
  } catch (err) { res.status(500).json({ error: err.message }); }
}
