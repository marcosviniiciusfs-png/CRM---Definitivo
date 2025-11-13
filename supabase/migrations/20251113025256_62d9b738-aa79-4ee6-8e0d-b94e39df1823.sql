-- Add position field to leads table for sorting within stages
ALTER TABLE leads ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;

-- Create index for better performance on stage + position queries
CREATE INDEX IF NOT EXISTS idx_leads_stage_position ON leads(stage, position);