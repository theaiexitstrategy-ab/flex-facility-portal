-- ══════════════════════════════════════════════════════════════════════
-- MIGRATION 001 — SMS Blast & Opt-Out Support
-- Run in Supabase Dashboard → SQL Editor → Run
-- ══════════════════════════════════════════════════════════════════════

-- ── SMS BLAST LOG ──
CREATE TABLE IF NOT EXISTS sms_blast_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blast_id UUID NOT NULL,
  to_number TEXT NOT NULL,
  contact_name TEXT,
  message_body TEXT,
  segment TEXT,
  status TEXT DEFAULT 'sent',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── SMS LOG (general) ──
CREATE TABLE IF NOT EXISTS sms_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_number TEXT NOT NULL,
  message_body TEXT,
  event_type TEXT,
  status TEXT DEFAULT 'sent',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Add opt-out columns to leads tables ──
ALTER TABLE leads_athlete ADD COLUMN IF NOT EXISTS opted_out BOOLEAN DEFAULT FALSE;
ALTER TABLE leads_athlete ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ;

ALTER TABLE leads_lifestyle ADD COLUMN IF NOT EXISTS opted_out BOOLEAN DEFAULT FALSE;
ALTER TABLE leads_lifestyle ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ;

ALTER TABLE contacts_master ADD COLUMN IF NOT EXISTS opted_out BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts_master ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ;

-- ── RLS ──
ALTER TABLE sms_blast_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;

-- ── Index for blast_id lookups ──
CREATE INDEX IF NOT EXISTS idx_sms_blast_log_blast_id ON sms_blast_log(blast_id);
CREATE INDEX IF NOT EXISTS idx_sms_blast_log_sent_at ON sms_blast_log(sent_at DESC);

-- ══════════════════════════════════════════════════════════════════════
-- COMPLETE — 2 tables created, opt-out columns added, RLS enabled
-- ══════════════════════════════════════════════════════════════════════
