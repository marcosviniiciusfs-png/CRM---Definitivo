-- Garante que as funções RPC de token do Facebook estejam presentes.
-- Estas funções foram originalmente aplicadas manualmente; esta migration
-- as registra formalmente para garantir consistência em novos ambientes.

-- Função para buscar tokens de uma integração específica
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
        fi.id as integration_id,
        fit.encrypted_access_token,
        fit.encrypted_page_access_token,
        fi.page_id,
        fi.ad_account_id
    FROM public.facebook_integrations fi
    LEFT JOIN public.facebook_integration_tokens fit ON fit.integration_id = fi.id
    WHERE fi.id = p_integration_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_facebook_token_by_integration(UUID) TO authenticated;

-- Função para buscar tokens por organização (fallback)
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
        fi.id as integration_id,
        fit.encrypted_access_token,
        fit.encrypted_page_access_token,
        fi.page_id,
        fi.ad_account_id
    FROM public.facebook_integrations fi
    LEFT JOIN public.facebook_integration_tokens fit ON fit.integration_id = fi.id
    WHERE fi.organization_id = p_organization_id
    ORDER BY fi.created_at DESC
    LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_facebook_tokens_secure(UUID) TO authenticated;

-- Função para salvar/atualizar tokens de forma segura
CREATE OR REPLACE FUNCTION public.update_facebook_tokens_secure(
    p_integration_id UUID,
    p_encrypted_access_token TEXT,
    p_encrypted_page_access_token TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.facebook_integration_tokens (
        integration_id,
        encrypted_access_token,
        encrypted_page_access_token,
        updated_at
    )
    VALUES (
        p_integration_id,
        p_encrypted_access_token,
        p_encrypted_page_access_token,
        now()
    )
    ON CONFLICT (integration_id)
    DO UPDATE SET
        encrypted_access_token = EXCLUDED.encrypted_access_token,
        encrypted_page_access_token = EXCLUDED.encrypted_page_access_token,
        updated_at = now();

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_facebook_tokens_secure(UUID, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
