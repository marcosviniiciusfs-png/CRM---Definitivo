-- ============================================================
-- CORREÇÃO: Recuperação de integrações Facebook após limpeza de orgs duplicadas
--
-- Causa raiz:
--   A migration 20260318040000_fix_single_org_isolation deletou organizações
--   "órfãs" (sem membros). Como facebook_integrations tem ON DELETE CASCADE
--   em organization_id → organizations.id, as integrações Facebook vinculadas
--   às organizações deletadas foram apagadas silenciosamente.
--
-- O que esta migration faz:
--   1. Garante que a função get_facebook_integrations_masked não retorne
--      needs_reconnect=false para tokens válidos mas potencialmente inválidos.
--   2. Marca como expiradas integrações sem token na tabela segura (forçando
--      o frontend a mostrar o aviso "Reconecte o Facebook").
--   3. Cria função auxiliar para o admin identificar usuários sem integração.
-- ============================================================

-- 1. Marcar como expiradas as integrações que não têm token na tabela segura
--    (encrypted_page_access_token NULL ou vazio).
--    Isso faz needs_reconnect = true no frontend, guiando o usuário a reconectar.
UPDATE public.facebook_integrations fi
SET expires_at = now()
WHERE
  -- Sem token criptografado na tabela segura
  NOT EXISTS (
    SELECT 1 FROM public.facebook_integration_tokens fit
    WHERE fit.integration_id = fi.id
      AND fit.encrypted_page_access_token IS NOT NULL
      AND fit.encrypted_page_access_token != ''
  )
  -- E ainda não foi marcada como expirada
  AND (fi.expires_at IS NULL OR fi.expires_at > now());

-- 2. Recriar get_facebook_integrations_masked com lógica needs_reconnect mais robusta:
--    - Sem token criptografado → needs_reconnect
--    - expires_at expirado → needs_reconnect
--    - page_id nulo/vazio → needs_reconnect (integração incompleta)
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
        CASE
            -- Token ausente na tabela segura → precisa reconectar
            WHEN (fit.encrypted_page_access_token IS NULL OR fit.encrypted_page_access_token = '') THEN true
            -- Token expirado (expires_at setado para o passado pelo webhook ou pelo OAuth)
            WHEN fi.expires_at IS NOT NULL AND fi.expires_at < now() THEN true
            -- Integração incompleta (sem page_id)
            WHEN fi.page_id IS NULL OR fi.page_id = '' THEN true
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

-- 3. Função para o admin identificar usuários que perderam integração Facebook
--    (útil para suporte: listar usuários que precisam reconectar).
CREATE OR REPLACE FUNCTION public.admin_check_facebook_integration_status()
RETURNS TABLE (
    user_id UUID,
    user_email TEXT,
    organization_id UUID,
    has_facebook_integration BOOLEAN,
    needs_reconnect BOOLEAN,
    page_name TEXT,
    expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        om.user_id,
        u.email::TEXT AS user_email,
        om.organization_id,
        (fi.id IS NOT NULL) AS has_facebook_integration,
        CASE
            WHEN fi.id IS NULL THEN NULL::BOOLEAN
            WHEN fit.encrypted_page_access_token IS NULL OR fit.encrypted_page_access_token = '' THEN true
            WHEN fi.expires_at IS NOT NULL AND fi.expires_at < now() THEN true
            ELSE false
        END AS needs_reconnect,
        fi.page_name,
        fi.expires_at
    FROM public.organization_members om
    JOIN auth.users u ON u.id = om.user_id
    LEFT JOIN public.facebook_integrations fi ON fi.organization_id = om.organization_id
    LEFT JOIN public.facebook_integration_tokens fit ON fit.integration_id = fi.id
    ORDER BY om.user_id, fi.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_check_facebook_integration_status() TO service_role;

NOTIFY pgrst, 'reload schema';
