import jwt from 'jsonwebtoken';
import Stripe from 'stripe';

function requireAuth(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/flex_session=([^;]+)/);
  if (!match) return false;
  try { jwt.verify(match[1], process.env.JWT_SECRET); return true; } catch { return false; }
}

const PACKAGE_AMOUNTS = { '25': 2500, '50': 5000, '100': 10000 }; // cents

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAuth(req)) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const { package: pkg } = req.body || {};

    if (!PACKAGE_AMOUNTS[pkg]) {
      return res.status(400).json({ success: false, error: 'Invalid package. Use 25, 50, or 100.' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: PACKAGE_AMOUNTS[pkg],
      currency: 'usd',
      metadata: { package: pkg, portal: 'flex-facility' },
    });

    return res.status(200).json({ success: true, clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('Stripe PI error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
