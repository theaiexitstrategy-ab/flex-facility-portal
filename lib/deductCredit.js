import supabase from './supabase.js';

export async function deductCredit({ count, eventType, contactName }) {
  try {
    const { data: credits } = await supabase.from('sms_credits').select('*').limit(1).single();
    if (!credits) return { allowed: false, balance: 0 };
    if (credits.balance < count) {
      await supabase.from('sms_log').insert({ to_number: 'system', message_body: 'Blocked: insufficient credits (' + credits.balance + ' < ' + count + ')', event_type: 'blocked_low_credits', status: 'blocked' });
      return { allowed: false, balance: credits.balance };
    }
    const newBalance = credits.balance - count;
    await supabase.from('sms_credits').update({ balance: newBalance, lifetime_used: credits.lifetime_used + count, updated_at: new Date().toISOString() }).eq('id', credits.id);
    await supabase.from('sms_credit_transactions').insert({ type: 'usage', amount: -count, balance_after: newBalance, event_type: eventType, contact_name: contactName || null });
    return { allowed: true, balance: newBalance };
  } catch (err) {
    console.error('deductCredit error:', err.message);
    return { allowed: false, balance: 0 };
  }
}
