const { createClient } = require('@supabase/supabase-js');

async function setupDatabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.log('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    console.log('Set them in your environment, then run: npm run setup\n');
    console.log('Alternatively, copy the SQL below and run it in Supabase SQL Editor:\n');
    printSQL();
    process.exit(0);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  console.log('Setting up Supabase database...\n');

  // Test connection
  const { error: testErr } = await supabase.from('leads_athlete').select('id').limit(1);

  if (testErr && testErr.code === '42P01') {
    console.log('Tables do not exist yet. Please run the following SQL in your');
    console.log('Supabase Dashboard → SQL Editor → New Query:\n');
    printSQL();
    process.exit(0);
  } else if (testErr && testErr.message) {
    console.log('Connection test result:', testErr.message);
    console.log('\nIf tables do not exist, run this SQL in Supabase SQL Editor:\n');
    printSQL();
    process.exit(0);
  } else {
    console.log('Connection successful! Tables appear to exist.');
    console.log('Verifying all 9 tables...\n');

    const tables = [
      'leads_athlete', 'leads_lifestyle',
      'vapi_interactions_athlete', 'vapi_interactions_lifestyle',
      'pipeline_athlete', 'pipeline_lifestyle',
      'contacts_master', 'bookings_master', 'purchases_ebook'
    ];

    for (const table of tables) {
      const { error } = await supabase.from(table).select('id').limit(1);
      if (error && error.code === '42P01') {
        console.log(`  [MISSING] ${table}`);
      } else if (error) {
        console.log(`  [ERROR]   ${table} — ${error.message}`);
      } else {
        console.log(`  [OK]      ${table}`);
      }
    }

    console.log('\nSetup verification complete.');
  }
}

function printSQL() {
  console.log(FULL_SQL);
}

const FULL_SQL = `
-- ══════════════════════════════════════════════
-- FLEX FACILITY — SUPABASE SCHEMA SETUP
-- Run this in Supabase Dashboard → SQL Editor
-- ══════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── LEADS ATHLETE ──
CREATE TABLE IF NOT EXISTS leads_athlete (
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
);

-- ── LEADS LIFESTYLE ──
CREATE TABLE IF NOT EXISTS leads_lifestyle (
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
);

-- ── VAPI INTERACTIONS ATHLETE ──
CREATE TABLE IF NOT EXISTS vapi_interactions_athlete (
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
);

-- ── VAPI INTERACTIONS LIFESTYLE ──
CREATE TABLE IF NOT EXISTS vapi_interactions_lifestyle (
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
);

-- ── PIPELINE ATHLETE ──
CREATE TABLE IF NOT EXISTS pipeline_athlete (
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
);

-- ── PIPELINE LIFESTYLE ──
CREATE TABLE IF NOT EXISTS pipeline_lifestyle (
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
);

-- ── CONTACTS MASTER ──
CREATE TABLE IF NOT EXISTS contacts_master (
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
);

-- ── BOOKINGS MASTER ──
CREATE TABLE IF NOT EXISTS bookings_master (
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
);

-- ── PURCHASES EBOOK ──
CREATE TABLE IF NOT EXISTS purchases_ebook (
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
);

-- ── UPDATED_AT TRIGGER FUNCTION ──
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── TRIGGERS ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_leads_athlete_updated_at') THEN
    CREATE TRIGGER trg_leads_athlete_updated_at BEFORE UPDATE ON leads_athlete FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_leads_lifestyle_updated_at') THEN
    CREATE TRIGGER trg_leads_lifestyle_updated_at BEFORE UPDATE ON leads_lifestyle FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pipeline_athlete_updated_at') THEN
    CREATE TRIGGER trg_pipeline_athlete_updated_at BEFORE UPDATE ON pipeline_athlete FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pipeline_lifestyle_updated_at') THEN
    CREATE TRIGGER trg_pipeline_lifestyle_updated_at BEFORE UPDATE ON pipeline_lifestyle FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_contacts_master_updated_at') THEN
    CREATE TRIGGER trg_contacts_master_updated_at BEFORE UPDATE ON contacts_master FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_bookings_master_updated_at') THEN
    CREATE TRIGGER trg_bookings_master_updated_at BEFORE UPDATE ON bookings_master FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ── ROW LEVEL SECURITY ──
ALTER TABLE leads_athlete ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads_lifestyle ENABLE ROW LEVEL SECURITY;
ALTER TABLE vapi_interactions_athlete ENABLE ROW LEVEL SECURITY;
ALTER TABLE vapi_interactions_lifestyle ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_athlete ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_lifestyle ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases_ebook ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════
-- SETUP COMPLETE
-- ══════════════════════════════════════════════
`;

module.exports = { setupDatabase, FULL_SQL };

if (require.main === module) {
  setupDatabase().catch(err => {
    console.error('Setup failed:', err.message);
    process.exit(1);
  });
}
