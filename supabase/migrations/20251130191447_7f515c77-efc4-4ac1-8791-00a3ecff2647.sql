-- Add stage_config column to funnel_stages for storing stage behavior configurations
ALTER TABLE funnel_stages 
ADD COLUMN IF NOT EXISTS stage_config JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN funnel_stages.stage_config IS 'Configuration for stage behaviors like automatic messages, task creation, agent assignment';
