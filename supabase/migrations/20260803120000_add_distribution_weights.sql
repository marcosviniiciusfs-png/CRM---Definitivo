ALTER TABLE public.lead_distribution_configs
  ADD COLUMN IF NOT EXISTS distribution_weights JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.lead_distribution_configs.distribution_weights IS
  'Percentual por user_id usado pelo metodo weighted. Os valores dos agentes elegiveis devem somar 100.';
