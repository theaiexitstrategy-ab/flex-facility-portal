export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  return res.status(200).json({
    kenny_email: process.env.KENNY_EMAIL || 'NOT SET',
    aaron_email: process.env.AARON_EMAIL || 'NOT SET',
    jwt_secret: process.env.JWT_SECRET ? 'SET' : 'NOT SET',
    kenny_password: process.env.KENNY_PASSWORD ? 'SET' : 'NOT SET',
    aaron_password: process.env.AARON_PASSWORD ? 'SET' : 'NOT SET',
  });
}
