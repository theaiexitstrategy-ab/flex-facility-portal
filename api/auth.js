import crypto from 'crypto';
import jwt from 'jsonwebtoken';

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + process.env.JWT_SECRET).digest('hex');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.query.action;

  // ── LOGIN ──
  if (action === 'login') {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required.' });

    const users = [
      { email: process.env.KENNY_EMAIL, hash: process.env.KENNY_PASSWORD, name: 'Coach Kenny', role: 'owner' },
      { email: process.env.AARON_EMAIL, hash: process.env.AARON_PASSWORD, name: 'Aaron', role: 'admin' },
    ];
    const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

    const submittedHash = hashPassword(password);
    if (submittedHash !== user.hash) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

    const token = jwt.sign({ email: user.email, name: user.name, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.setHeader('Set-Cookie', `flex_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`);
    return res.status(200).json({ success: true, name: user.name, role: user.role });
  }

  // ── VERIFY ──
  if (action === 'verify') {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/flex_session=([^;]+)/);
    if (!match) return res.status(401).json({ success: false, authenticated: false });
    try {
      const decoded = jwt.verify(match[1], process.env.JWT_SECRET);
      return res.status(200).json({ success: true, authenticated: true, user: { name: decoded.name, role: decoded.role } });
    } catch {
      return res.status(401).json({ success: false, authenticated: false });
    }
  }

  // ── LOGOUT ──
  if (action === 'logout') {
    res.setHeader('Set-Cookie', 'flex_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
    return res.status(200).json({ success: true });
  }

  return res.status(400).json({ success: false, error: 'Unknown action. Use ?action=login|verify|logout' });
}
