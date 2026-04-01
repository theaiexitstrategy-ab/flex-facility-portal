-- =============================================================
-- Supabase SQL Schema for The Flex Facility Portal
-- Run this in Supabase SQL Editor before deploying the portal
-- =============================================================

-- 1. Leads — Athlete & Parent
CREATE TABLE leads_athlete (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "Name" TEXT,
  "Email" TEXT,
  "Phone" TEXT,
  "Sport" TEXT,                          -- e.g. Basketball, Football (was Single Select in Airtable — consider CHECK constraint or enum)
  "Age" TEXT,
  "Parent Name" TEXT,
  "Parent Phone" TEXT,
  "Parent Email" TEXT,
  "Source" TEXT,                          -- e.g. Instagram, Referral, Website (was Single Select in Airtable)
  "Lead Status" TEXT DEFAULT 'New',      -- e.g. New, Contacted, Qualified, Booked, Won, Lost (was Single Select in Airtable)
  "Notes" TEXT,
  "Created Time" TIMESTAMPTZ DEFAULT now()
);

-- 2. Leads — Lifestyle & Bodybuilding
CREATE TABLE leads_lifestyle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "Name" TEXT,
  "Email" TEXT,
  "Phone" TEXT,
  "Goal" TEXT,                           -- e.g. Weight Loss, Muscle Gain, General Fitness (was Single Select in Airtable)
  "Source" TEXT,                          -- was Single Select in Airtable
  "Lead Status" TEXT DEFAULT 'New',      -- was Single Select in Airtable
  "Notes" TEXT,
  "Created Time" TIMESTAMPTZ DEFAULT now()
);

-- 3. VAPI & Chat Interactions — Athlete
CREATE TABLE vapi_chat_interactions_athlete (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "Caller Name" TEXT,
  "Phone" TEXT,
  "Type" TEXT,                           -- e.g. VAPI Call, Chat, SMS (was Single Select in Airtable)
  "Summary" TEXT,
  "Transcript" TEXT,
  "Duration" TEXT,
  "Outcome" TEXT,                        -- was Single Select in Airtable
  "Date & Time" TIMESTAMPTZ DEFAULT now()
);

-- 4. VAPI & Chat Interactions — Lifestyle
CREATE TABLE vapi_chat_interactions_lifestyle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "Caller Name" TEXT,
  "Phone" TEXT,
  "Type" TEXT,                           -- was Single Select in Airtable
  "Summary" TEXT,
  "Transcript" TEXT,
  "Duration" TEXT,
  "Outcome" TEXT,                        -- was Single Select in Airtable
  "Date & Time" TIMESTAMPTZ DEFAULT now()
);

-- 5. Pipeline — Athlete
CREATE TABLE pipeline_athlete (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "Name" TEXT,
  "Phone" TEXT,
  "Email" TEXT,
  "Sport" TEXT,
  "Stage" TEXT,                          -- was Single Select in Airtable
  "Deal Value" NUMERIC DEFAULT 0,
  "Commission Paid" BOOLEAN DEFAULT false,
  "Commission Amount" NUMERIC DEFAULT 0,
  "Notes" TEXT,
  "Created Time" TIMESTAMPTZ DEFAULT now()
);

-- 6. Pipeline — Lifestyle & Bodybuilding
CREATE TABLE pipeline_lifestyle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "Name" TEXT,
  "Phone" TEXT,
  "Email" TEXT,
  "Goal" TEXT,
  "Stage" TEXT,                          -- was Single Select in Airtable
  "Deal Value" NUMERIC DEFAULT 0,
  "Commission Paid" BOOLEAN DEFAULT false,
  "Commission Amount" NUMERIC DEFAULT 0,
  "Notes" TEXT,
  "Created Time" TIMESTAMPTZ DEFAULT now()
);

-- 7. Contacts — Master
CREATE TABLE contacts_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "Name" TEXT,
  "Email" TEXT,
  "Phone" TEXT,
  "Sport" TEXT,                          -- present for athlete contacts
  "Goal" TEXT,                           -- present for lifestyle contacts
  "Source" TEXT,                          -- was Single Select in Airtable
  "Lead Status" TEXT DEFAULT 'New',      -- was Single Select in Airtable
  "Segment" TEXT,                        -- 'athlete' or 'lifestyle'
  "Notes" TEXT,
  "Created Time" TIMESTAMPTZ DEFAULT now()
);

-- 8. Bookings — Master
CREATE TABLE bookings_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "Name" TEXT,
  "Phone" TEXT,
  "Email" TEXT,
  "Date" DATE,
  "Time" TEXT,
  "Status" TEXT DEFAULT 'Confirmed',     -- e.g. Confirmed, Completed, No-Show, Cancelled (was Single Select in Airtable)
  "Type" TEXT,                           -- e.g. Assessment, Session
  "Notes" TEXT,
  "Created Time" TIMESTAMPTZ DEFAULT now()
);

-- 9. Purchases — Ebook
CREATE TABLE purchases_ebook (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "Name" TEXT,
  "Email" TEXT,
  "Phone" TEXT,
  "Ebook Title" TEXT,
  "Amount" NUMERIC DEFAULT 0,
  "Payment Status" TEXT DEFAULT 'Pending',  -- e.g. Pending, Completed, Refunded
  "Purchase Date" TIMESTAMPTZ DEFAULT now(),
  "Notes" TEXT,
  "Created Time" TIMESTAMPTZ DEFAULT now()
);

-- =============================================================
-- INDEXES for common query patterns
-- =============================================================

-- Phone-based lookups (search-before-create pattern)
CREATE INDEX idx_leads_athlete_phone ON leads_athlete ("Phone");
CREATE INDEX idx_leads_lifestyle_phone ON leads_lifestyle ("Phone");
CREATE INDEX idx_contacts_master_phone ON contacts_master ("Phone");
CREATE INDEX idx_bookings_master_phone ON bookings_master ("Phone");

-- Date-based sorting/filtering
CREATE INDEX idx_bookings_master_date ON bookings_master ("Date");
CREATE INDEX idx_vapi_athlete_datetime ON vapi_chat_interactions_athlete ("Date & Time");
CREATE INDEX idx_vapi_lifestyle_datetime ON vapi_chat_interactions_lifestyle ("Date & Time");

-- Lead status for pipeline stage aggregation
CREATE INDEX idx_contacts_master_status ON contacts_master ("Lead Status");
