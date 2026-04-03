import supabase from '../../lib/supabase.js';

/**
 * Deduct SMS credits before sending messages.
 * @param {Object} opts
 * @param {number} opts.count - Number of credits to deduct
 * @param {string} opts.eventType - 'blast' | 'booking' | 'nudge' | 'funnel' | 'cancel' | 'reschedule'
 * @param {string} [opts.contactName] - Optional contact name for logging
 * @returns {{ allowed: boolean, balance: number }}
 */
export async function deductCredit({ count, eventType, contactName }) {
  try {
    const { data: credits } = await supabase.from('sms_credits').select('*').limit(1).single();

    if (!credits) {
      return { allowed: false, balance: 0 };
    }

    if (credits.balance < count) {
      // Log blocked event
      await supabase.from('sms_log').insert({
        to_number: 'system',
        message_body: 'Blocked: insufficient credits (' + credits.balance + ' < ' + count + ')',
        event_type: 'blocked_low_credits',
        status: 'blocked'
      });

      return { allowed: false, balance: credits.balance };
    }

    // Deduct
    const newBalance = credits.balance - count;
    await supabase.from('sms_credits').update({
      balance: newBalance,
      lifetime_used: credits.lifetime_used + count,
      updated_at: new Date().toISOString()
    }).eq('id', credits.id);

    // Log transaction
    await supabase.from('sms_credit_transactions').insert({
      type: 'usage',
      amount: -count,
      balance_after: newBalance,
      event_type: eventType,
      contact_name: contactName || null
    });

    // Check auto-reload threshold
    if (credits.auto_reload_enabled && newBalance <= (credits.auto_reload_threshold || 50)) {
      // Log that auto-reload was triggered (actual Stripe charge would require saved payment method)
      await supabase.from('sms_log').insert({
        to_number: 'system',
        message_body: 'Auto-reload triggered: balance=' + newBalance + ', threshold=' + credits.auto_reload_threshold,
        event_type: 'auto_reload_triggered',
        status: 'pending'
      });
    }

    return { allowed: true, balance: newBalance };
  } catch (err) {
    console.error('deductCredit error:', err.message);
    return { allowed: false, balance: 0 };
  }
}
