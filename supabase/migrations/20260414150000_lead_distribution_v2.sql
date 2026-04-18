-- ============================================================
-- Lead Distribution V2: lead_score, filter_rules, sparkline index
-- ============================================================

-- 1. lead_score na tabela leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_score integer DEFAULT 0;
ALTER TABLE leads ADD CONSTRAINT leads_lead_score_check CHECK (lead_score >= 0 AND lead_score <= 100);

-- 2. filter_rules na tabela lead_distribution_configs
ALTER TABLE lead_distribution_configs ADD COLUMN IF NOT EXISTS filter_rules jsonb
  DEFAULT '{"logic":"AND","conditions":[]}';

-- 3. Indice para sparkline queries
CREATE INDEX IF NOT EXISTS idx_dist_history_config_created
  ON lead_distribution_history(config_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
