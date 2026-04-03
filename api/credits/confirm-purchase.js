import jwt from 'jsonwebtoken';
import Stripe from 'stripe';
import supabase from '../../lib/supabase.js';

function requireAuth(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/flex_session=([^;]+)/);
  if (!match) return false;
  try { jwt.verify(match[1], process.env.JWT_SECRET); return true; } catch { return false; }
}

const PACKAGE_CREDITS = { '25': 250, '50': 625, '100': 2000 };

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req)) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const { paymentIntentId, package: pkg } = req.body || {};

    if (!paymentIntentId || !pkg) {
      return res.status(400).json({ success: false, error: 'Missing paymentIntentId or package' });
    }

    // Verify payment with Stripe
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== 'succeeded') {
      return res.status(400).json({ success: false, error: 'Payment not completed. Status: ' + pi.status });
    }

    const creditsToAdd = PACKAGE_CREDITS[pkg];
    if (!creditsToAdd) {
      return res.status(400).json({ success: false, error: 'Invalid package' });
    }

    // Check for duplicate processing
    const { data: existing } = await supabase
      .from('sms_credit_transactions')
      .select('id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .limit(1);
    if (existing?.length > 0) {
      // Already processed — return current balance
      const { data: credits } = await supabase.from('sms_credits').select('balance').limit(1).single();
      return res.status(200).json({ success: true, newBalance: credits?.balance || 0, duplicate: true });
    }

    // Get current credits
    const { data: credits } = await supabase.from('sms_credits').select('*').limit(1).single();
    if (!credits) {
      return res.status(400).json({ success: false, error: 'No credits record found. Run migration first.' });
    }

    const newBalance = credits.balance + creditsToAdd;

    // Update balance
    await supabase.from('sms_credits').update({
      balance: newBalance,
      lifetime_purchased: credits.lifetime_purchased + creditsToAdd,
      updated_at: new Date().toISOString()
    }).eq('id', credits.id);

    // Log transaction
    await supabase.from('sms_credit_transactions').insert({
      type: 'purchase',
      amount: creditsToAdd,
      balance_after: newBalance,
      package: pkg,
      stripe_payment_intent_id: paymentIntentId
    });

    return res.status(200).json({ success: true, newBalance });
  } catch (err) {
    console.error('Confirm purchase error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
