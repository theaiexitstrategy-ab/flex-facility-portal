-- ══════════════════════════════════════════════════════════════════════
-- MIGRATION 002 — SMS Credits System
-- Run in Supabase Dashboard → SQL Editor → Run
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sms_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  balance integer NOT NULL DEFAULT 0,
  lifetime_purchased integer NOT NULL DEFAULT 0,
  lifetime_used integer NOT NULL DEFAULT 0,
  auto_reload_enabled boolean DEFAULT false,
  auto_reload_package text DEFAULT '25',
  auto_reload_threshold integer DEFAULT 50,
  updated_at timestamptz DEFAULT now()
);

-- Seed one row (single account balance)
INSERT INTO sms_credits (balance) VALUES (0)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS sms_credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL, -- 'purchase' | 'usage' | 'refund'
  amount integer NOT NULL, -- positive = credits added, negative = credits used
  balance_after integer NOT NULL,
  package text, -- '25' | '50' | '100' (for purchases)
  stripe_payment_intent_id text,
  event_type text, -- 'blast' | 'booking' | 'nudge' | 'funnel' | 'cancel' | 'reschedule'
  contact_name text,
  created_at timestamptz DEFAULT now()
);

-- Also create sms_log and sms_blast_log if they don't exist
CREATE TABLE IF NOT EXISTS sms_blast_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blast_id uuid NOT NULL,
  to_number text NOT NULL,
  contact_name text,
  message_body text,
  segment text,
  status text DEFAULT 'sent',
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sms_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_number text NOT NULL,
  message_body text,
  event_type text,
  status text DEFAULT 'sent',
  created_at timestamptz DEFAULT now()
);

-- Add opt-out columns if not present
ALTER TABLE leads_athlete ADD COLUMN IF NOT EXISTS opted_out BOOLEAN DEFAULT FALSE;
ALTER TABLE leads_athlete ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ;
ALTER TABLE leads_lifestyle ADD COLUMN IF NOT EXISTS opted_out BOOLEAN DEFAULT FALSE;
ALTER TABLE leads_lifestyle ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ;
ALTER TABLE contacts_master ADD COLUMN IF NOT EXISTS opted_out BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts_master ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ;

-- RLS
ALTER TABLE sms_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_blast_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sms_credit_txns_created ON sms_credit_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_blast_log_blast_id ON sms_blast_log(blast_id);

-- ══════════════════════════════════════════════════════════════════════
-- COMPLETE
-- ══════════════════════════════════════════════════════════════════════
