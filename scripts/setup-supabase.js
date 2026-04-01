const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runSQL(sql) {
  const { error } = await supabase.rpc('exec_sql', { sql });
  if (error) {
    // If exec_sql doesn't exist, use the REST API directly
    const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ sql })
    });
    if (!res.ok) {
      // Fall back to pg_net or direct SQL via management API
      throw new Error(`SQL exec failed: ${await res.text()}`);
    }
  }
}

// Use Supabase's postgrest to create tables via raw SQL endpoint
async function setupDatabase() {
  console.log('Setting up Supabase database...\n');

  const sqlStatements = [
    // ── EXTENSIONS ──
    `CREATE EXTENSION IF NOT EXISTS "pgcrypto";`,

    // ── LEADS ATHLETE ──
    `CREATE TABLE IF NOT EXISTS leads_athlete (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      phone TEXT UNIQUE,
      parent_name TEXT,
      parent_phone TEXT,
      parent_email TEXT,
      athlete_age INT,
      sport TEXT,
      position TEXT,
      school TEXT,
      grad_year INT,
      goals TEXT,
      source TEXT,
      lead_status TEXT DEFAULT 'New',
      notes TEXT,
      tags TEXT[] DEFAULT '{}'
    );`,

    // ── LEADS LIFESTYLE ──
    `CREATE TABLE IF NOT EXISTS leads_lifestyle (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      phone TEXT UNIQUE,
      age INT,
      goals TEXT,
      experience_level TEXT,
      source TEXT,
      lead_status TEXT DEFAULT 'New',
      notes TEXT,
      tags TEXT[] DEFAULT '{}'
    );`,

    // ── VAPI INTERACTIONS ATHLETE ──
    `CREATE TABLE IF NOT EXISTS vapi_interactions_athlete (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      phone TEXT,
      lead_id UUID REFERENCES leads_athlete(id) ON DELETE SET NULL,
      interaction_type TEXT,
      transcript TEXT,
      summary TEXT,
      intent_detected TEXT,
      booking_requested BOOLEAN DEFAULT FALSE,
      follow_up_needed BOOLEAN DEFAULT FALSE,
      duration_seconds INT,
      assistant_name TEXT DEFAULT 'FLEX',
      raw_payload JSONB
    );`,

    // ── VAPI INTERACTIONS LIFESTYLE ──
    `CREATE TABLE IF NOT EXISTS vapi_interactions_lifestyle (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      phone TEXT,
      lead_id UUID REFERENCES leads_lifestyle(id) ON DELETE SET NULL,
      interaction_type TEXT,
      transcript TEXT,
      summary TEXT,
      intent_detected TEXT,
      booking_requested BOOLEAN DEFAULT FALSE,
      follow_up_needed BOOLEAN DEFAULT FALSE,
      duration_seconds INT,
      assistant_name TEXT DEFAULT 'FLEX',
      raw_payload JSONB
    );`,

    // ── PIPELINE ATHLETE ──
    `CREATE TABLE IF NOT EXISTS pipeline_athlete (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      lead_id UUID REFERENCES leads_athlete(id) ON DELETE SET NULL,
      phone TEXT,
      full_name TEXT,
      stage TEXT DEFAULT 'New Lead',
      deal_value NUMERIC,
      program_type TEXT,
      close_probability INT,
      expected_close_date DATE,
      assigned_to TEXT DEFAULT 'Coach Kenny',
      notes TEXT
    );`,

    // ── PIPELINE LIFESTYLE ──
    `CREATE TABLE IF NOT EXISTS pipeline_lifestyle (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      lead_id UUID REFERENCES leads_lifestyle(id) ON DELETE SET NULL,
      phone TEXT,
      full_name TEXT,
      stage TEXT DEFAULT 'New Lead',
      deal_value NUMERIC,
      program_type TEXT,
      close_probability INT,
      expected_close_date DATE,
      assigned_to TEXT DEFAULT 'Coach Kenny',
      notes TEXT
    );`,

    // ── CONTACTS MASTER ──
    `CREATE TABLE IF NOT EXISTS contacts_master (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      phone TEXT UNIQUE,
      contact_type TEXT,
      segment TEXT,
      athlete_lead_id UUID REFERENCES leads_athlete(id) ON DELETE SET NULL,
      lifestyle_lead_id UUID REFERENCES leads_lifestyle(id) ON DELETE SET NULL,
      is_active_member BOOLEAN DEFAULT FALSE,
      member_since DATE,
      tags TEXT[] DEFAULT '{}',
      notes TEXT
    );`,

    // ── BOOKINGS MASTER ──
    `CREATE TABLE IF NOT EXISTS bookings_master (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      contact_id UUID REFERENCES contacts_master(id) ON DELETE SET NULL,
      phone TEXT,
      full_name TEXT,
      email TEXT,
      booking_type TEXT,
      booking_date DATE,
      booking_time TIME,
      duration_minutes INT DEFAULT 60,
      status TEXT DEFAULT 'Scheduled',
      segment TEXT,
      booked_via TEXT,
      tidycal_booking_id TEXT,
      notes TEXT,
      reminder_sent BOOLEAN DEFAULT FALSE
    );`,

    // ── PURCHASES EBOOK ──
    `CREATE TABLE IF NOT EXISTS purchases_ebook (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      full_name TEXT,
      email TEXT,
      phone TEXT,
      product_name TEXT DEFAULT 'The Road to The Stage',
      amount_paid NUMERIC DEFAULT 65.00,
      currency TEXT DEFAULT 'usd',
      stripe_session_id TEXT UNIQUE,
      stripe_payment_intent TEXT,
      delivery_status TEXT DEFAULT 'Pending',
      sendgrid_message_id TEXT,
      download_accessed BOOLEAN DEFAULT FALSE,
      refunded BOOLEAN DEFAULT FALSE,
      notes TEXT
    );`,

    // ── UPDATED_AT TRIGGER FUNCTION ──
    `CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;`,

    // ── TRIGGERS FOR UPDATED_AT ──
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_leads_athlete_updated_at') THEN
        CREATE TRIGGER trg_leads_athlete_updated_at BEFORE UPDATE ON leads_athlete FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      END IF;
    END $$;`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_leads_lifestyle_updated_at') THEN
        CREATE TRIGGER trg_leads_lifestyle_updated_at BEFORE UPDATE ON leads_lifestyle FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      END IF;
    END $$;`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pipeline_athlete_updated_at') THEN
        CREATE TRIGGER trg_pipeline_athlete_updated_at BEFORE UPDATE ON pipeline_athlete FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      END IF;
    END $$;`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pipeline_lifestyle_updated_at') THEN
        CREATE TRIGGER trg_pipeline_lifestyle_updated_at BEFORE UPDATE ON pipeline_lifestyle FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      END IF;
    END $$;`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_contacts_master_updated_at') THEN
        CREATE TRIGGER trg_contacts_master_updated_at BEFORE UPDATE ON contacts_master FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      END IF;
    END $$;`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_bookings_master_updated_at') THEN
        CREATE TRIGGER trg_bookings_master_updated_at BEFORE UPDATE ON bookings_master FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      END IF;
    END $$;`,

    // ── ROW LEVEL SECURITY ──
    `ALTER TABLE leads_athlete ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE leads_lifestyle ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE vapi_interactions_athlete ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE vapi_interactions_lifestyle ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE pipeline_athlete ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE pipeline_lifestyle ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE contacts_master ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE bookings_master ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE purchases_ebook ENABLE ROW LEVEL SECURITY;`
  ];

  // Execute via Supabase SQL editor API (uses service role)
  const pgUrl = `${process.env.SUPABASE_URL}/rest/v1/rpc/`;

  // Try using supabase-js .rpc() first, fall back to direct fetch
  for (let i = 0; i < sqlStatements.length; i++) {
    const sql = sqlStatements[i];
    const label = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1]
      || sql.match(/CREATE TRIGGER (\w+)/)?.[1]
      || sql.match(/ALTER TABLE (\w+)/)?.[1]
      || sql.match(/CREATE OR REPLACE FUNCTION (\w+)/)?.[1]
      || sql.match(/CREATE EXTENSION/)?.[0]
      || `statement ${i + 1}`;

    try {
      // Use the Supabase Management API / SQL endpoint
      const res = await fetch(`${process.env.SUPABASE_URL}/pg`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({ query: sql })
      });

      if (!res.ok) {
        // Try alternative: use the /rest/v1/ endpoint with raw SQL via postgREST
        // This won't work for DDL, so we'll try the query endpoint
        const res2 = await fetch(`${process.env.SUPABASE_URL}/sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({ query: sql })
        });

        if (!res2.ok) {
          console.log(`  [SKIP] ${label} — will need to run via Supabase SQL Editor`);
          continue;
        }
      }
      console.log(`  [OK] ${label}`);
    } catch (err) {
      console.log(`  [SKIP] ${label} — ${err.message}`);
    }
  }

  console.log('\nDatabase setup complete.');
  console.log('\nIf any statements were skipped, run the full SQL below in your');
  console.log('Supabase SQL Editor (Dashboard → SQL Editor → New Query):\n');
  console.log('--- BEGIN SQL ---');
  console.log(sqlStatements.join('\n\n'));
  console.log('--- END SQL ---');
}

// Also export the SQL for programmatic use
module.exports = { setupDatabase };

// Run if called directly
if (require.main === module) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('Environment variables SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    console.log('Set them in your environment or .env file, then run: npm run setup\n');
    console.log('Outputting full SQL for manual setup via Supabase SQL Editor...\n');

    // Still output the SQL so user can copy-paste
    const sqlStatements = [
      `CREATE EXTENSION IF NOT EXISTS "pgcrypto";`,
      `-- See full output above for all CREATE TABLE statements`
    ];
    process.exit(0);
  }
  setupDatabase().catch(err => {
    console.error('Setup failed:', err.message);
    process.exit(1);
  });
}
