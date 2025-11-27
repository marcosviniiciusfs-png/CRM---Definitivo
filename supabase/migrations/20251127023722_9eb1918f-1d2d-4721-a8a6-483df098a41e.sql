-- Add additional_data field to leads table to store extra form fields
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS additional_data JSONB DEFAULT NULL;

COMMENT ON COLUMN public.leads.additional_data IS 'Stores additional form fields from webhook integrations as JSON';