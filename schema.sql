-- ══════════════════════════════════════════════════════════════════════
-- FLEX FACILITY — COMPLETE SUPABASE SCHEMA
-- Paste this entire file into Supabase Dashboard → SQL Editor → Run
-- ══════════════════════════════════════════════════════════════════════

-- ── EXTENSIONS ──
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ══════════════════════════════════════════════════════════════════════
-- TABLES
-- ══════════════════════════════════════════════════════════════════════

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

-- ══════════════════════════════════════════════════════════════════════
-- TRIGGERS — auto-update updated_at on row changes
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

-- ══════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — enabled on all tables
-- Service role key bypasses RLS automatically
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE leads_athlete ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads_lifestyle ENABLE ROW LEVEL SECURITY;
ALTER TABLE vapi_interactions_athlete ENABLE ROW LEVEL SECURITY;
ALTER TABLE vapi_interactions_lifestyle ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_athlete ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_lifestyle ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases_ebook ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════
-- SEED DATA — Flex Facility demo records
-- ══════════════════════════════════════════════════════════════════════

-- ── ATHLETE LEADS ──
INSERT INTO leads_athlete (first_name, last_name, email, phone, parent_name, parent_phone, parent_email, athlete_age, sport, position, school, grad_year, goals, source, lead_status) VALUES
  ('Marcus', 'Williams', 'marcus.w@email.com', '3145551001', 'Denise Williams', '3145551002', 'denise.w@email.com', 16, 'Football', 'Wide Receiver', 'Hazelwood East', 2027, 'Increase 40-yard dash speed, improve route running', 'Instagram', 'New'),
  ('Jaylen', 'Carter', 'jaylen.c@email.com', '3145551003', 'Tony Carter', '3145551004', 'tony.c@email.com', 15, 'Basketball', 'Point Guard', 'Parkway North', 2028, 'Vertical leap, agility, court vision', 'Website', 'Contacted'),
  ('Aiden', 'Brooks', 'aiden.b@email.com', '3145551005', 'Lisa Brooks', '3145551006', 'lisa.b@email.com', 17, 'Baseball', 'Pitcher', 'Ladue Horton Watkins', 2026, 'Arm strength, velocity, injury prevention', 'Referral', 'Booked'),
  ('Cameron', 'Davis', 'cameron.d@email.com', '3145551007', 'Robert Davis', '3145551008', 'robert.d@email.com', 14, 'Soccer', 'Midfielder', 'CBC High School', 2029, 'Speed, endurance, ball control', 'TikTok', 'New'),
  ('Isaiah', 'Thompson', 'isaiah.t@email.com', '3145551009', 'Michelle Thompson', '3145551010', 'michelle.t@email.com', 16, 'Track & Field', 'Sprinter', 'University City', 2027, 'Break 11s in 100m, state championship prep', 'VAPI AI', 'Showed'),
  ('Devon', 'Johnson', 'devon.j@email.com', '3145551011', 'Karen Johnson', '3145551012', 'karen.j@email.com', 15, 'Football', 'Linebacker', 'Kirkwood', 2028, 'Strength, tackle form, film review', 'Walk-In', 'Closed'),
  ('Tyler', 'Robinson', 'tyler.r@email.com', '3145551013', 'Angela Robinson', '3145551014', 'angela.r@email.com', 17, 'Basketball', 'Shooting Guard', 'Chaminade', 2026, 'Shooting accuracy, defensive footwork', 'Instagram', 'New'),
  ('Malik', 'Harris', 'malik.h@email.com', '3145551015', 'James Harris', '3145551016', 'james.h@email.com', 16, 'Football', 'Quarterback', 'De Smet Jesuit', 2027, 'Arm strength, pocket presence, reads', 'Phone Call', 'Contacted')
ON CONFLICT (phone) DO NOTHING;

-- ── LIFESTYLE LEADS ──
INSERT INTO leads_lifestyle (first_name, last_name, email, phone, age, goals, experience_level, source, lead_status) VALUES
  ('Sarah', 'Mitchell', 'sarah.m@email.com', '3145552001', 34, 'Lose 30 lbs, tone up, build confidence', 'Beginner', 'Instagram', 'New'),
  ('David', 'Chen', 'david.c@email.com', '3145552002', 28, 'Build muscle mass, meal planning help', 'Intermediate', 'Website', 'Booked'),
  ('Brianna', 'Foster', 'brianna.f@email.com', '3145552003', 41, 'Bikini competition prep, posing practice', 'Advanced', 'Referral', 'Showed'),
  ('Kevin', 'Martinez', 'kevin.m@email.com', '3145552004', 25, 'First bodybuilding show, classic physique', 'Intermediate', 'TikTok', 'Contacted'),
  ('Tanya', 'Williams', 'tanya.w@email.com', '3145552005', 38, 'Post-pregnancy fitness, core strength', 'Beginner', 'VAPI AI', 'New'),
  ('Marcus', 'Lee', 'marcus.l@email.com', '3145552006', 45, 'General fitness, blood pressure management', 'Beginner', 'Walk-In', 'Closed'),
  ('Jessica', 'Brown', 'jessica.b@email.com', '3145552007', 31, 'Strength training, powerlifting fundamentals', 'Intermediate', 'Instagram', 'New')
ON CONFLICT (phone) DO NOTHING;

-- ── CONTACTS MASTER — mirror all leads ──
INSERT INTO contacts_master (first_name, last_name, email, phone, contact_type, segment, athlete_lead_id)
SELECT first_name, last_name, email, phone, 'Lead', 'athlete', id FROM leads_athlete
ON CONFLICT (phone) DO NOTHING;

INSERT INTO contacts_master (first_name, last_name, email, phone, contact_type, segment, lifestyle_lead_id)
SELECT first_name, last_name, email, phone, 'Lead', 'lifestyle', id FROM leads_lifestyle
ON CONFLICT (phone) DO NOTHING;

-- ── PIPELINE ATHLETE ──
INSERT INTO pipeline_athlete (lead_id, phone, full_name, stage, deal_value, program_type, close_probability, assigned_to)
SELECT id, phone, first_name || ' ' || last_name,
  CASE lead_status
    WHEN 'New' THEN 'New Lead'
    WHEN 'Contacted' THEN 'New Lead'
    WHEN 'Booked' THEN 'Assessment Booked'
    WHEN 'Showed' THEN 'Assessment Complete'
    WHEN 'Closed' THEN 'Closed Won'
    ELSE 'New Lead'
  END,
  CASE lead_status
    WHEN 'Closed' THEN 2400
    WHEN 'Showed' THEN 2400
    WHEN 'Booked' THEN 2400
    ELSE 0
  END,
  'Athlete Performance Program',
  CASE lead_status
    WHEN 'Closed' THEN 100
    WHEN 'Showed' THEN 70
    WHEN 'Booked' THEN 50
    WHEN 'Contacted' THEN 25
    ELSE 10
  END,
  'Coach Kenny'
FROM leads_athlete
ON CONFLICT DO NOTHING;

-- ── PIPELINE LIFESTYLE ──
INSERT INTO pipeline_lifestyle (lead_id, phone, full_name, stage, deal_value, program_type, close_probability, assigned_to)
SELECT id, phone, first_name || ' ' || last_name,
  CASE lead_status
    WHEN 'New' THEN 'New Lead'
    WHEN 'Contacted' THEN 'New Lead'
    WHEN 'Booked' THEN 'Consultation Booked'
    WHEN 'Showed' THEN 'Consultation Complete'
    WHEN 'Closed' THEN 'Closed Won'
    ELSE 'New Lead'
  END,
  CASE lead_status
    WHEN 'Closed' THEN 1800
    WHEN 'Showed' THEN 1800
    WHEN 'Booked' THEN 1800
    ELSE 0
  END,
  'Lifestyle & Bodybuilding Program',
  CASE lead_status
    WHEN 'Closed' THEN 100
    WHEN 'Showed' THEN 70
    WHEN 'Booked' THEN 50
    WHEN 'Contacted' THEN 25
    ELSE 10
  END,
  'Coach Kenny'
FROM leads_lifestyle
ON CONFLICT DO NOTHING;

-- ── BOOKINGS ──
INSERT INTO bookings_master (phone, full_name, email, booking_type, booking_date, booking_time, status, segment, booked_via) VALUES
  ('3145551005', 'Aiden Brooks', 'aiden.b@email.com', 'Free Athlete Assessment', CURRENT_DATE + INTERVAL '2 days', '16:00', 'Scheduled', 'athlete', 'Website'),
  ('3145551009', 'Isaiah Thompson', 'isaiah.t@email.com', 'Free Athlete Assessment', CURRENT_DATE + INTERVAL '3 days', '10:00', 'Scheduled', 'athlete', 'VAPI AI'),
  ('3145552002', 'David Chen', 'david.c@email.com', 'Lifestyle Consultation', CURRENT_DATE + INTERVAL '1 day', '14:00', 'Scheduled', 'lifestyle', 'Website'),
  ('3145552003', 'Brianna Foster', 'brianna.f@email.com', 'Bodybuilding Consultation', CURRENT_DATE + INTERVAL '4 days', '11:00', 'Scheduled', 'lifestyle', 'Referral'),
  ('3145551007', 'Cameron Davis', 'cameron.d@email.com', 'Free Athlete Assessment', CURRENT_DATE + INTERVAL '5 days', '15:00', 'Scheduled', 'athlete', 'TikTok')
ON CONFLICT DO NOTHING;

-- ── VAPI INTERACTIONS ──
INSERT INTO vapi_interactions_athlete (phone, lead_id, interaction_type, summary, intent_detected, booking_requested, follow_up_needed, duration_seconds)
SELECT phone, id, 'Inbound Call', 'Lead asked about athlete training programs and pricing. Expressed interest in free assessment.', 'booking_interest', true, true, 187
FROM leads_athlete WHERE phone = '3145551009'
ON CONFLICT DO NOTHING;

INSERT INTO vapi_interactions_athlete (phone, lead_id, interaction_type, summary, intent_detected, booking_requested, follow_up_needed, duration_seconds)
SELECT phone, id, 'Outbound Call', 'Follow-up call. Parent confirmed assessment booking for this week.', 'booking_confirmed', false, false, 124
FROM leads_athlete WHERE phone = '3145551005'
ON CONFLICT DO NOTHING;

INSERT INTO vapi_interactions_lifestyle (phone, lead_id, interaction_type, summary, intent_detected, booking_requested, follow_up_needed, duration_seconds)
SELECT phone, id, 'Inbound Call', 'Interested in competition prep. Asked about coaching packages and timeline.', 'pricing_inquiry', true, true, 210
FROM leads_lifestyle WHERE phone = '3145552003'
ON CONFLICT DO NOTHING;

INSERT INTO vapi_interactions_lifestyle (phone, lead_id, interaction_type, summary, intent_detected, booking_requested, follow_up_needed, duration_seconds)
SELECT phone, id, 'Inbound Call', 'Post-pregnancy fitness inquiry. Wants to start slow with a consultation.', 'booking_interest', true, true, 156
FROM leads_lifestyle WHERE phone = '3145552005'
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════
-- COMPLETE — 9 tables created, triggers set, RLS enabled, data seeded
-- ══════════════════════════════════════════════════════════════════════
