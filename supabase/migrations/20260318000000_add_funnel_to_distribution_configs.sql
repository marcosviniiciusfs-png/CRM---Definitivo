-- Migration: Add funnel_id and funnel_stage_id to lead_distribution_configs
-- This allows a roleta (distribution config) to specify which funnel/stage
-- leads should be placed in when distributed.

ALTER TABLE lead_distribution_configs
  ADD COLUMN IF NOT EXISTS funnel_id UUID REFERENCES sales_funnels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS funnel_stage_id UUID REFERENCES funnel_stages(id) ON DELETE SET NULL;

-- Add comment for documentation
COMMENT ON COLUMN lead_distribution_configs.funnel_id IS 'Funnel where leads distributed by this roleta will be placed';
COMMENT ON COLUMN lead_distribution_configs.funnel_stage_id IS 'Initial stage where leads will be placed (defaults to first stage of funnel if null)';
