# The Flex Facility — Command Center

**URL:** portal.theflexfacility.com
**Stack:** HTML/CSS/JS · Vercel Serverless · Airtable REST API
**Auth:** bcrypt + JWT · HttpOnly cookies · 24hr session

## Environment Variables

Set all 7 in Vercel → Settings → Environment Variables:

| Variable | Value |
|---|---|
| KENNY_EMAIL | Coach Kenny's login email |
| KENNY_PASSWORD | bcrypt hash (cost 12) of his password |
| AARON_EMAIL | Aaron's login email |
| AARON_PASSWORD | bcrypt hash (cost 12) of his password |
| JWT_SECRET | Run: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| AIRTABLE_API_KEY | From airtable.com/create/tokens |
| AIRTABLE_BASE_ID | app0MAjRtdbZ4na2h |

## Deploy

1. Push to GitHub → theaiexitstrategy-ab/theflexfacility-portal
2. Import in Vercel dashboard
3. Add all 7 environment variables
4. Deploy
5. Vercel → Settings → Domains → add portal.theflexfacility.com
6. DNS CNAME: portal → cname.vercel-dns.com

## Changing a Password

1. Go to bcrypt-generator.com · cost factor 12
2. Generate hash of new password
3. Update KENNY_PASSWORD or AARON_PASSWORD in Vercel env vars
4. Redeploy
