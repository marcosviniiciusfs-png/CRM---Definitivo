-- Add unique constraint to facebook_integrations to allow upsert
ALTER TABLE public.facebook_integrations
ADD CONSTRAINT facebook_integrations_user_org_unique 
UNIQUE (user_id, organization_id);