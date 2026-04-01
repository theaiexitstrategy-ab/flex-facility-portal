# The Flex Facility — Command Center

**URL:** portal.theflexfacility.com
**Stack:** HTML/CSS/JS · Vercel Serverless · Supabase
**Auth:** SHA256 + JWT · HttpOnly cookies · 24hr session

## Environment Variables

Set all variables in Vercel → Settings → Environment Variables:

| Variable | Value |
|---|---|
| KENNY_EMAIL | Coach Kenny's login email |
| KENNY_PASSWORD | SHA256 hash of his password (salted with JWT_SECRET) |
| AARON_EMAIL | Aaron's login email |
| AARON_PASSWORD | SHA256 hash of his password (salted with JWT_SECRET) |
| JWT_SECRET | Run: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| SUPABASE_URL | From Supabase project settings → API |
| SUPABASE_SERVICE_ROLE_KEY | From Supabase project settings → API (service_role key) |

## Deploy

1. Push to GitHub → theaiexitstrategy-ab/flex-facility-portal
2. Import in Vercel dashboard
3. Add all environment variables
4. Deploy
5. Vercel → Settings → Domains → add portal.theflexfacility.com
6. DNS CNAME: portal → cname.vercel-dns.com

## Changing a Password

1. Run: `node -e "const c=require('crypto');console.log(c.createHash('sha256').update('NEW_PASSWORD'+process.env.JWT_SECRET).digest('hex'))"`
2. Update KENNY_PASSWORD or AARON_PASSWORD in Vercel env vars
3. Redeploy
