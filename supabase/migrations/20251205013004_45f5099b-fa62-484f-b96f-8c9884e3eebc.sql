-- Add ad_accounts column to store all available ad accounts
ALTER TABLE facebook_integrations 
ADD COLUMN IF NOT EXISTS ad_accounts jsonb DEFAULT '[]'::jsonb;

-- Comment explaining the structure
COMMENT ON COLUMN facebook_integrations.ad_accounts IS 'Array of ad accounts: [{ id: "act_123", name: "Account Name", status: 1 }]';