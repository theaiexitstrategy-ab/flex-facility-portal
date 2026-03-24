export default function handler(req, res) {
  res.setHeader('Set-Cookie',
    'flex_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'
  );
  return res.status(200).json({ success: true });
}
