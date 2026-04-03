import Stripe from 'stripe';
import supabase from '../../lib/supabase.js';

const PACKAGE_CREDITS = { '25': 250, '50': 625, '100': 2000 };

export const config = { api: { bodyParser: false } };

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) { chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk); }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const buf = await buffer(req);
    const sig = req.headers['stripe-signature'];

    let event;
    try {
      event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook sig verify failed:', err.message);
      return res.status(400).send('Webhook Error: ' + err.message);
    }

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      const pkg = pi.metadata?.package;
      const creditsToAdd = PACKAGE_CREDITS[pkg];

      if (creditsToAdd) {
        // Check duplicate
        const { data: existing } = await supabase
          .from('sms_credit_transactions')
          .select('id')
          .eq('stripe_payment_intent_id', pi.id)
          .limit(1);

        if (!existing?.length) {
          const { data: credits } = await supabase.from('sms_credits').select('*').limit(1).single();
          if (credits) {
            const newBalance = credits.balance + creditsToAdd;
            await supabase.from('sms_credits').update({
              balance: newBalance,
              lifetime_purchased: credits.lifetime_purchased + creditsToAdd,
              updated_at: new Date().toISOString()
            }).eq('id', credits.id);

            await supabase.from('sms_credit_transactions').insert({
              type: 'purchase',
              amount: creditsToAdd,
              balance_after: newBalance,
              package: pkg,
              stripe_payment_intent_id: pi.id
            });
          }
        }
      }
    }

    if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object;
      await supabase.from('sms_credit_transactions').insert({
        type: 'refund',
        amount: 0,
        balance_after: 0,
        package: pi.metadata?.package || null,
        stripe_payment_intent_id: pi.id,
        event_type: 'payment_failed'
      });
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err.message);
    return res.status(500).end();
  }
}
