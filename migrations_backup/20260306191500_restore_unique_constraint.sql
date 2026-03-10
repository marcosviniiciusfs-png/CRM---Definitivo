
-- Garantir constraint original (uma integração por usuário/org)
ALTER TABLE public.facebook_integrations 
DROP CONSTRAINT IF EXISTS facebook_integrations_org_page_unique;

DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'facebook_integrations_user_org_unique'
    ) THEN
        ALTER TABLE public.facebook_integrations
        ADD CONSTRAINT facebook_integrations_user_org_unique 
        UNIQUE (user_id, organization_id);
    END IF;
END $$;

-- Notificar PostgREST
NOTIFY pgrst, 'reload schema';
