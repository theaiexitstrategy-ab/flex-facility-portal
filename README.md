# The Flex Facility — Command Center

**URL:** portal.theflexfacility.com
**Stack:** HTML/CSS/JS · Vercel Serverless · Supabase (PostgreSQL)
**Auth:** SHA256 + JWT · HttpOnly cookies · 24hr session

## Environment Variables

Set all 7 in Vercel → Settings → Environment Variables:

| Variable | Value |
|---|---|
| KENNY_EMAIL | Coach Kenny's login email |
| KENNY_PASSWORD | SHA256 hash of his password (hashed with JWT_SECRET) |
| AARON_EMAIL | Aaron's login email |
| AARON_PASSWORD | SHA256 hash of his password (hashed with JWT_SECRET) |
| JWT_SECRET | Run: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| SUPABASE_URL | Your Supabase project URL |
| SUPABASE_SERVICE_ROLE_KEY | Your Supabase service role key |

## Database Setup

Run the setup script to create all 9 tables in Supabase:

```bash
npm run setup
```

If the script cannot execute DDL via REST (common in hosted Supabase), copy the SQL output and run it in:
Supabase Dashboard → SQL Editor → New Query

## Deploy

1. Push to GitHub → theaiexitstrategy-ab/theflexfacility-portal
2. Import in Vercel dashboard
3. Add all 7 environment variables
4. Deploy
5. Vercel → Settings → Domains → add portal.theflexfacility.com
6. DNS CNAME: portal → cname.vercel-dns.com

## Changing a Password

1. Use: `node -e "const c=require('crypto');console.log(c.createHash('sha256').update('YOUR_PASSWORD'+process.env.JWT_SECRET).digest('hex'))"`
2. Update KENNY_PASSWORD or AARON_PASSWORD in Vercel env vars
3. Redeploy
