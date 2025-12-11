-- Remove the public view that has no RLS (security vulnerability)
DROP VIEW IF EXISTS public.google_calendar_integrations_public;

-- Add unique constraint on google_calendar_tokens for upsert
ALTER TABLE public.google_calendar_tokens 
ADD CONSTRAINT google_calendar_tokens_integration_id_unique UNIQUE (integration_id);

-- Add foreign key constraint to ensure data integrity
ALTER TABLE public.google_calendar_tokens
ADD CONSTRAINT google_calendar_tokens_integration_id_fkey
FOREIGN KEY (integration_id) 
REFERENCES public.google_calendar_integrations(id)
ON DELETE CASCADE;