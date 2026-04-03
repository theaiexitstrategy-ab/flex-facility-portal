-- ══════════════════════════════════════════════════════════════════════
-- MIGRATION 004 — All missing tables for portal features
-- Run in Supabase Dashboard → SQL Editor → Run
-- ══════════════════════════════════════════════════════════════════════

-- SMS Credits
CREATE TABLE IF NOT EXISTS sms_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  balance integer NOT NULL DEFAULT 0,
  lifetime_purchased integer NOT NULL DEFAULT 0,
  lifetime_used integer NOT NULL DEFAULT 0,
  auto_reload_enabled boolean DEFAULT false,
  auto_reload_package text DEFAULT '25',
  auto_reload_threshold integer DEFAULT 20,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO sms_credits (balance, lifetime_purchased, lifetime_used, auto_reload_enabled, auto_reload_threshold, auto_reload_package)
VALUES (50, 50, 0, false, 20, '25')
ON CONFLICT DO NOTHING;

-- SMS Credit Transactions
CREATE TABLE IF NOT EXISTS sms_credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  package text,
  stripe_payment_intent_id text,
  event_type text,
  contact_name text,
  created_at timestamptz DEFAULT now()
);

-- Social Connections
CREATE TABLE IF NOT EXISTS social_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL DEFAULT 'flex-facility',
  platform text NOT NULL,
  access_token text NOT NULL,
  token_expires_at timestamptz,
  page_id text,
  page_name text,
  ig_account_id text,
  ig_username text,
  connected_at timestamptz DEFAULT now(),
  last_synced_at timestamptz,
  is_active boolean DEFAULT true,
  UNIQUE(client_id, platform)
);

-- Social Metrics Cache
CREATE TABLE IF NOT EXISTS social_metrics_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL DEFAULT 'flex-facility',
  platform text NOT NULL,
  metric_date date NOT NULL DEFAULT CURRENT_DATE,
  followers integer,
  profile_views integer,
  reach integer,
  impressions integer,
  link_clicks integer,
  post_count integer,
  top_posts jsonb,
  audience_demographics jsonb,
  raw_response jsonb,
  fetched_at timestamptz DEFAULT now(),
  UNIQUE(client_id, platform, metric_date)
);

-- Portal Settings
CREATE TABLE IF NOT EXISTS portal_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO portal_settings (setting_key, setting_value) VALUES
  ('new_lead_sms', true),
  ('booking_confirmation_sms', true),
  ('flex_call_summary', true),
  ('daily_report', false)
ON CONFLICT DO NOTHING;

-- Blocked Dates
CREATE TABLE IF NOT EXISTS blocked_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocked_date date NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now()
);

-- Ensure sms_blast_log and sms_log exist (may already from earlier migration)
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

-- Add opted_out columns to leads tables
ALTER TABLE leads_athlete ADD COLUMN IF NOT EXISTS opted_out BOOLEAN DEFAULT FALSE;
ALTER TABLE leads_athlete ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ;
ALTER TABLE leads_lifestyle ADD COLUMN IF NOT EXISTS opted_out BOOLEAN DEFAULT FALSE;
ALTER TABLE leads_lifestyle ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ;
ALTER TABLE contacts_master ADD COLUMN IF NOT EXISTS opted_out BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts_master ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ;

-- RLS on all new tables
ALTER TABLE sms_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_metrics_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_blast_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sms_credit_txns_created ON sms_credit_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_blast_log_blast_id ON sms_blast_log(blast_id);
CREATE INDEX IF NOT EXISTS idx_social_metrics_date ON social_metrics_cache(client_id, platform, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_blocked_dates ON blocked_dates(blocked_date);

-- ══════════════════════════════════════════════════════════════════════
-- COMPLETE — Run this once in Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════════════
