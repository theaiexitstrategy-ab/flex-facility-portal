import jwt from 'jsonwebtoken';

export default function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/flex_session=([^;]+)/);
  if (!match) return res.status(401).json({ authenticated: false });
  try {
    const decoded = jwt.verify(match[1], process.env.JWT_SECRET);
    return res.status(200).json({ authenticated: true, user: { name: decoded.name, role: decoded.role, email: decoded.email } });
  } catch {
    return res.status(401).json({ authenticated: false });
  }
}
