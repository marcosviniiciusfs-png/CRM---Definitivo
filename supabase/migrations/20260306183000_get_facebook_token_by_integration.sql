
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

-- Garantir permissões de execução
GRANT EXECUTE ON FUNCTION public.get_facebook_token_by_integration(UUID) TO authenticated;

-- Notificar PostgREST
NOTIFY pgrst, 'reload schema';
