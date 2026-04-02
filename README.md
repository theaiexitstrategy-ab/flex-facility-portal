# The Flex Facility — Command Center

**URL:** portal.theflexfacility.com
**Stack:** HTML/CSS/JS · Vercel Serverless · Supabase (PostgreSQL)
**Auth:** SHA256 + JWT · HttpOnly cookies · 24hr session

## Environment Variables

Set all 7 in Vercel → Settings → Environment Variables:

| Variable | Value |
|---|---|
| KENNY_EMAIL | Coach Kenny's login email |
| KENNY_PASSWORD | SHA256 hash of password (hashed with JWT_SECRET) |
| AARON_EMAIL | Aaron's login email |
| AARON_PASSWORD | SHA256 hash of password (hashed with JWT_SECRET) |
| JWT_SECRET | Run: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| SUPABASE_URL | Your Supabase project URL |
| SUPABASE_SERVICE_ROLE_KEY | Your Supabase service role key |

## Database Setup

Run the setup script to verify/create all 9 tables:

```bash
npm run setup
```

If tables don't exist yet, the script outputs the full SQL. Copy it and run in:
Supabase Dashboard → SQL Editor → New Query

## API Routes (9 total — under Vercel Hobby 12-function limit)

| Route | Methods | Purpose |
|---|---|---|
| `/api/auth` | POST | Login, verify, logout (via `?action=`) |
| `/api/leads` | GET/POST/PUT/DELETE | Athlete + lifestyle leads (via `?segment=`) |
| `/api/bookings` | GET/POST/PUT/DELETE | All bookings |
| `/api/pipeline` | GET/POST/PUT/DELETE | Pipeline stages (via `?segment=`) |
| `/api/contacts` | GET/POST/PUT/DELETE | Contacts master |
| `/api/interactions` | GET/POST | VAPI/chat interactions |
| `/api/purchases` | GET/POST/PUT | Ebook purchases |
| `/api/dashboard` | GET | Aggregated stats |
| `/api/sms` | POST | Send SMS via Twilio |

## Deploy

1. Push to GitHub
2. Import in Vercel dashboard
3. Add all 7 environment variables
4. Deploy
5. Add domain: portal.theflexfacility.com
6. DNS CNAME: portal → cname.vercel-dns.com

## Changing a Password

```bash
node -e "const c=require('crypto');console.log(c.createHash('sha256').update('YOUR_PASSWORD'+process.env.JWT_SECRET).digest('hex'))"
```

Update `KENNY_PASSWORD` or `AARON_PASSWORD` in Vercel env vars, then redeploy.
