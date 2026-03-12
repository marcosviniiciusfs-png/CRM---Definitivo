-- Correção crítica: get_facebook_integrations_masked referenciava fi.page_access_token
-- que não existe em facebook_integrations. Tokens estão APENAS em facebook_integration_tokens.

DROP FUNCTION IF EXISTS public.get_facebook_integrations_masked();

CREATE OR REPLACE FUNCTION public.get_facebook_integrations_masked()
RETURNS TABLE (
    id UUID,
    organization_id UUID,
    page_id TEXT,
    page_name TEXT,
    webhook_verified BOOLEAN,
    needs_reconnect BOOLEAN,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        fi.id,
        fi.organization_id,
        fi.page_id,
        fi.page_name,
        COALESCE(fi.webhook_verified, false) AS webhook_verified,
        -- needs_reconnect: token ausente na tabela de tokens OU expirado
        CASE
            WHEN fi.expires_at IS NOT NULL AND fi.expires_at < now() THEN true
            WHEN (fit.encrypted_page_access_token IS NULL OR fit.encrypted_page_access_token = '') THEN true
            ELSE false
        END AS needs_reconnect,
        fi.expires_at,
        fi.created_at
    FROM public.facebook_integrations fi
    LEFT JOIN public.facebook_integration_tokens fit ON fit.integration_id = fi.id
    WHERE fi.organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_facebook_integrations_masked() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
