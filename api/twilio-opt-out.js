import supabase from '../lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Content-Type', 'text/xml');
    return res.status(405).send('<Response></Response>');
  }

  try {
    const body = req.body || {};
    const from = body.From || '';
    const messageBody = (body.Body || '').trim().toUpperCase();

    const optOutKeywords = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];
    if (!optOutKeywords.includes(messageBody)) {
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send('<Response></Response>');
    }

    const normalizedPhone = from.replace(/^\+1/, '').replace(/\D/g, '');
    const now = new Date().toISOString();

    await Promise.all([
      supabase.from('leads_athlete').update({ opted_out: true, opted_out_at: now }).eq('phone', normalizedPhone),
      supabase.from('leads_athlete').update({ opted_out: true, opted_out_at: now }).eq('phone', from),
      supabase.from('leads_lifestyle').update({ opted_out: true, opted_out_at: now }).eq('phone', normalizedPhone),
      supabase.from('leads_lifestyle').update({ opted_out: true, opted_out_at: now }).eq('phone', from),
      supabase.from('contacts_master').update({ opted_out: true, opted_out_at: now }).eq('phone', normalizedPhone),
      supabase.from('contacts_master').update({ opted_out: true, opted_out_at: now }).eq('phone', from),
    ]);

    await supabase.from('sms_log').insert({ to_number: from, message_body: body.Body || '', event_type: 'opt_out', status: 'processed' });

    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<Response></Response>');
  } catch (err) {
    console.error('Twilio opt-out error:', err);
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<Response></Response>');
  }
}
