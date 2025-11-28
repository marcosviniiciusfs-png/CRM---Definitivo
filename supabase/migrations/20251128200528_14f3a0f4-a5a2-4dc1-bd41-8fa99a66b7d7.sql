-- Add eligible_agents column to lead_distribution_configs
ALTER TABLE public.lead_distribution_configs 
ADD COLUMN eligible_agents uuid[] DEFAULT NULL;

COMMENT ON COLUMN public.lead_distribution_configs.eligible_agents IS 
'Array of user IDs that are eligible to receive leads from this distribution config. If NULL, all active agents are eligible.';