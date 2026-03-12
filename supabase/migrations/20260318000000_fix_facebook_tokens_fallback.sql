-- Fix: Tornar get_facebook_token_by_integration mais robusto com COALESCE
-- e criar get_facebook_integrations_masked caso não exista.

-- Reescrever get_facebook_token_by_integration com COALESCE explícito
CREATE OR REPLACE FUNCTION public.get_facebook_token_by_integration(p_integration_id UUID)
RETURNS TABLE (
    integration_id UUID,
    encrypted_access_token TEXT,
    encrypted_page_access_token TEXT,
    page_id TEXT,
    ad_account_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        fi.id AS integration_id,
        COALESCE(fit.encrypted_access_token, '')     AS encrypted_access_token,
        COALESCE(fit.encrypted_page_access_token, '') AS encrypted_page_access_token,
        fi.page_id,
        fi.ad_account_id
    FROM public.facebook_integrations fi
    LEFT JOIN public.facebook_integration_tokens fit ON fit.integration_id = fi.id
    WHERE fi.id = p_integration_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_facebook_token_by_integration(UUID) TO authenticated, service_role;

-- Reescrever get_facebook_tokens_secure com COALESCE explícito
CREATE OR REPLACE FUNCTION public.get_facebook_tokens_secure(p_organization_id UUID)
RETURNS TABLE (
    integration_id UUID,
    encrypted_access_token TEXT,
    encrypted_page_access_token TEXT,
    page_id TEXT,
    ad_account_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        fi.id AS integration_id,
        COALESCE(fit.encrypted_access_token, '')     AS encrypted_access_token,
        COALESCE(fit.encrypted_page_access_token, '') AS encrypted_page_access_token,
        fi.page_id,
        fi.ad_account_id
    FROM public.facebook_integrations fi
    LEFT JOIN public.facebook_integration_tokens fit ON fit.integration_id = fi.id
    WHERE fi.organization_id = p_organization_id
    ORDER BY fi.created_at DESC
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_facebook_tokens_secure(UUID) TO authenticated, service_role;

-- Criar get_facebook_integrations_masked (usado pelo checkConnection no frontend)
-- DROP necessário pois não é possível alterar return type com CREATE OR REPLACE
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
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        fi.id,
        fi.organization_id,
        fi.page_id,
        fi.page_name,
        COALESCE(fi.webhook_verified, false) AS webhook_verified,
        CASE
            -- Sem token criptografado E sem token legado → precisa reconectar
            WHEN (fit.encrypted_page_access_token IS NULL OR fit.encrypted_page_access_token = '')
                 AND (fi.page_access_token IS NULL OR fi.page_access_token = '')
                 AND (fi.access_token IS NULL OR fi.access_token = '') THEN true
            -- Token expirado
            WHEN fi.expires_at IS NOT NULL AND fi.expires_at < now() THEN true
            ELSE false
        END AS needs_reconnect,
        fi.expires_at,
        fi.created_at
    FROM public.facebook_integrations fi
    LEFT JOIN public.facebook_integration_tokens fit ON fit.integration_id = fi.id
    WHERE fi.organization_id IN (
        SELECT om.organization_id
        FROM public.organization_members om
        WHERE om.user_id = auth.uid()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_facebook_integrations_masked() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
