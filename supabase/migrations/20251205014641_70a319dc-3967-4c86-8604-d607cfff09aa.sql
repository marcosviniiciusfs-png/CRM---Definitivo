-- Add business_id and business_name columns to track which BM is connected
ALTER TABLE facebook_integrations 
ADD COLUMN IF NOT EXISTS business_id text,
ADD COLUMN IF NOT EXISTS business_name text;