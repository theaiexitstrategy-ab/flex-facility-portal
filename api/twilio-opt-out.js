import supabase from '../lib/supabase.js';

export default async function handler(req, res) {
  // Only accept POST from Twilio webhooks
  if (req.method !== 'POST') {
    return res.status(405).send('<Response></Response>');
  }

  try {
    const body = req.body || {};
    const from = body.From || '';
    const messageBody = (body.Body || '').trim().toUpperCase();

    // Check for opt-out keywords (Twilio standard)
    const optOutKeywords = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];
    const isOptOut = optOutKeywords.includes(messageBody);

    if (!isOptOut) {
      // Not an opt-out message, just acknowledge
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send('<Response></Response>');
    }

    // Normalize phone number (strip +1 prefix for matching)
    const normalizedPhone = from.replace(/^\+1/, '').replace(/\D/g, '');
    const now = new Date().toISOString();

    // Update opted_out in all relevant tables
    const updates = [];

    // Update leads_athlete
    updates.push(
      supabase.from('leads_athlete')
        .update({ opted_out: true, opted_out_at: now })
        .eq('phone', normalizedPhone)
    );

    // Also try with +1 prefix
    updates.push(
      supabase.from('leads_athlete')
        .update({ opted_out: true, opted_out_at: now })
        .eq('phone', from)
    );

    // Update leads_lifestyle
    updates.push(
      supabase.from('leads_lifestyle')
        .update({ opted_out: true, opted_out_at: now })
        .eq('phone', normalizedPhone)
    );

    updates.push(
      supabase.from('leads_lifestyle')
        .update({ opted_out: true, opted_out_at: now })
        .eq('phone', from)
    );

    // Update contacts_master
    updates.push(
      supabase.from('contacts_master')
        .update({ opted_out: true, opted_out_at: now })
        .eq('phone', normalizedPhone)
    );

    updates.push(
      supabase.from('contacts_master')
        .update({ opted_out: true, opted_out_at: now })
        .eq('phone', from)
    );

    await Promise.all(updates);

    // Log the opt-out event
    await supabase.from('sms_log').insert({
      to_number: from,
      message_body: body.Body || '',
      event_type: 'opt_out',
      status: 'processed'
    });

    // Return TwiML 200 response
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<Response></Response>');
  } catch (err) {
    console.error('Twilio opt-out error:', err);
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send('<Response></Response>');
  }
}
