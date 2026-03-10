-- Add tag_id column to webhook_configs to associate a tag with webhook leads
ALTER TABLE webhook_configs
ADD COLUMN tag_id uuid REFERENCES lead_tags(id) ON DELETE SET NULL;