import jwt from 'jsonwebtoken';
import supabase from '../lib/supabase.js';
import { deductCredit } from './utils/deductCredit.js';

function requireAuth(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/flex_session=([^;]+)/);
  if (!match) return false;
  try { jwt.verify(match[1], process.env.JWT_SECRET); return true; } catch { return false; }
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function replaceMergeTags(template, contact) {
  return template
    .replace(/\{\{firstName\}\}/g, contact.first_name || '')
    .replace(/\{\{lastName\}\}/g, contact.last_name || '')
    .replace(/\{\{coachName\}\}/g, 'Coach Kenny')
    .replace(/\[First Name\]/g, contact.first_name || '')
    .replace(/\[Last Name\]/g, contact.last_name || '')
    .replace(/\[Coach Name\]/g, 'Coach Kenny');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req)) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    // GET — blast history or contact count
    if (req.method === 'GET') {
      const action = req.query.action;

      if (action === 'tags') {
        const { data: athletes } = await supabase.from('leads_athlete').select('tags');
        const { data: lifestyle } = await supabase.from('leads_lifestyle').select('tags');
        const allTags = new Set();
        [...(athletes || []), ...(lifestyle || [])].forEach(row => {
          if (Array.isArray(row.tags)) row.tags.forEach(t => { if (t) allTags.add(t); });
        });
        return res.status(200).json({ success: true, data: [...allTags].sort() });
      }

      if (action === 'count') {
        const contacts = await queryContacts(req.query);
        const optedOut = contacts.filter(c => c.opted_out).length;
        const eligible = contacts.filter(c => !c.opted_out).length;
        return res.status(200).json({ success: true, total: contacts.length, eligible, optedOut });
      }

      if (action === 'preview') {
        const contacts = await queryContacts(req.query);
        const eligible = contacts.filter(c => !c.opted_out);
        return res.status(200).json({
          success: true,
          eligible: eligible.length,
          optedOut: contacts.length - eligible.length,
          preview: eligible.slice(0, 5).map(c => ({
            name: ((c.first_name || '') + ' ' + (c.last_name || '')).trim() || 'Unknown',
            phone: c.phone
          }))
        });
      }

      if (action === 'history') {
        const { data } = await supabase.from('sms_blast_log').select('*').order('created_at', { ascending: false }).limit(500);
        const blasts = {};
        (data || []).forEach(row => {
          if (!blasts[row.blast_id]) {
            blasts[row.blast_id] = { blast_id: row.blast_id, message_preview: (row.message_body || '').slice(0, 60), segment: row.segment || 'All', sent_at: row.sent_at || row.created_at, recipients: 0, sent: 0, failed: 0 };
          }
          blasts[row.blast_id].recipients++;
          if (row.status === 'sent') blasts[row.blast_id].sent++;
          if (row.status === 'failed') blasts[row.blast_id].failed++;
        });
        return res.status(200).json({ success: true, data: Object.values(blasts).sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at)) });
      }

      return res.status(400).json({ success: false, error: 'Missing action parameter' });
    }

    // POST — send blast
    if (req.method === 'POST') {
      const { message, filters = {} } = req.body || {};
      if (!message) return res.status(400).json({ success: false, error: 'Message is required' });

      const contacts = await queryContacts(filters);
      const eligible = contacts.filter(c => !c.opted_out && c.phone);

      if (eligible.length === 0) {
        return res.status(400).json({ success: false, error: 'No eligible contacts match filters' });
      }

      // Deduct credits before sending
      const creditResult = await deductCredit({ count: eligible.length, eventType: 'blast' });
      if (!creditResult.allowed) {
        return res.status(400).json({ success: false, error: 'Insufficient SMS credits. Balance: ' + creditResult.balance + ', needed: ' + eligible.length });
      }

      const blastId = crypto.randomUUID();
      const twilio = (await import('twilio')).default;
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      const fromNumber = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER;

      let sent = 0, failed = 0;
      const errors = [];

      for (const contact of eligible) {
        const personalizedMessage = replaceMergeTags(message, contact);
        const contactName = ((contact.first_name || '') + ' ' + (contact.last_name || '')).trim();

        try {
          await client.messages.create({ body: personalizedMessage, from: fromNumber, to: contact.phone });
          await supabase.from('sms_blast_log').insert({ blast_id: blastId, to_number: contact.phone, contact_name: contactName, message_body: personalizedMessage, segment: filters.segment || 'all', status: 'sent', sent_at: new Date().toISOString() });
          sent++;
        } catch (err) {
          failed++;
          errors.push({ phone: contact.phone, error: err.message });
          await supabase.from('sms_blast_log').insert({ blast_id: blastId, to_number: contact.phone, contact_name: contactName, message_body: personalizedMessage, segment: filters.segment || 'all', status: 'failed', sent_at: new Date().toISOString() });
        }
        await sleep(100);
      }

      return res.status(200).json({ success: true, data: { blast_id: blastId, total: eligible.length, sent, failed, errors: errors.slice(0, 10) } });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('SMS Blast error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

async function queryContacts({ segment, statuses, tags }) {
  let athletes = [], lifestyle = [];
  const statusList = statuses ? statuses.split(',').map(s => s.trim()).filter(Boolean) : [];
  const tagList = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];

  if (!segment || segment === 'all' || segment === 'athlete') {
    let q = supabase.from('leads_athlete').select('id, first_name, last_name, phone, lead_status, tags, opted_out');
    if (statusList.length > 0) q = q.in('lead_status', statusList);
    if (tagList.length > 0) q = q.overlaps('tags', tagList);
    const { data } = await q.limit(2000);
    athletes = (data || []).map(c => ({ ...c, _segment: 'athlete' }));
  }

  if (!segment || segment === 'all' || segment === 'lifestyle') {
    let q = supabase.from('leads_lifestyle').select('id, first_name, last_name, phone, lead_status, tags, opted_out');
    if (statusList.length > 0) q = q.in('lead_status', statusList);
    if (tagList.length > 0) q = q.overlaps('tags', tagList);
    const { data } = await q.limit(2000);
    lifestyle = (data || []).map(c => ({ ...c, _segment: 'lifestyle' }));
  }

  return [...athletes, ...lifestyle];
}
