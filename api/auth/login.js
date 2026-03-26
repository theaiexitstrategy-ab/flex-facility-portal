import crypto from 'crypto';
import jwt from 'jsonwebtoken';
function hashPassword(password) {
  return crypto
    .createHash('sha256')
    .update(password + process.env.JWT_SECRET)
    .digest('hex');
}
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password required.' });
  }
  const users = [
    { email: process.env.KENNY_EMAIL, hash: process.env.KENNY_PASSWORD, name: 'Coach Kenny', role: 'owner' },
    { email: process.env.AARON_EMAIL, hash: process.env.AARON_PASSWORD, name: 'Aaron', role: 'admin' },
  ];
  const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }
  const submittedHash = hashPassword(password);
  if (submittedHash !== user.hash) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }
  const token = jwt.sign(
    { email: user.email, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
  res.setHeader('Set-Cookie',
    `flex_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`
  );
  return res.status(200).json({ success: true, name: user.name, role: user.role });
}
