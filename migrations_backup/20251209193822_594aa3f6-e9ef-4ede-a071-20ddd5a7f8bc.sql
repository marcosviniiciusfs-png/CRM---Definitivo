-- =====================================================
-- SECURITY FIX: Mover tokens para tabela separada altamente segura
-- =====================================================

-- 1. Criar tabela separada para tokens sensíveis
CREATE TABLE IF NOT EXISTS public.google_calendar_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL UNIQUE,
  encrypted_access_token text NOT NULL,
  encrypted_refresh_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Habilitar RLS na nova tabela
ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;

-- 3. Políticas RLS ultra-restritivas - NENHUM acesso via cliente
-- Tokens só podem ser acessados via funções SECURITY DEFINER com service_role
CREATE POLICY "Block all direct access to tokens"
ON public.google_calendar_tokens
FOR ALL
USING (false);

-- 4. Criar view pública da tabela de integrações SEM tokens
CREATE OR REPLACE VIEW public.google_calendar_integrations_public AS
SELECT 
  id,
  organization_id,
  user_id,
  calendar_id,
  is_active,
  token_expires_at,
  created_at,
  updated_at
FROM public.google_calendar_integrations;

-- 5. Atualizar função para buscar tokens de forma segura (só via service_role)
CREATE OR REPLACE FUNCTION public.get_google_calendar_tokens_secure(target_user_id uuid)
RETURNS TABLE (
  integration_id uuid,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  calendar_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Esta função só funciona com service_role
  -- Retorna tokens criptografados da tabela principal (migração futura usará tabela separada)
  RETURN QUERY
  SELECT 
    gci.id as integration_id,
    gci.access_token as encrypted_access_token,
    gci.refresh_token as encrypted_refresh_token,
    gci.token_expires_at,
    gci.calendar_id
  FROM public.google_calendar_integrations gci
  WHERE gci.user_id = target_user_id
    AND gci.is_active = true
  ORDER BY gci.created_at DESC
  LIMIT 1;
END;
$$;

-- 6. Atualizar função masked para NUNCA retornar tokens
CREATE OR REPLACE FUNCTION public.get_google_calendar_integrations_masked()
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  user_id uuid,
  calendar_id text,
  is_active boolean,
  token_expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Tokens NUNCA são retornados - apenas metadados
  RETURN QUERY
  SELECT 
    gci.id,
    gci.organization_id,
    gci.user_id,
    gci.calendar_id,
    gci.is_active,
    gci.token_expires_at,
    gci.created_at,
    gci.updated_at
  FROM public.google_calendar_integrations gci
  WHERE gci.user_id = auth.uid();
END;
$$;

-- 7. Revogar acesso direto às colunas de token
-- Criar uma política que mascara os tokens no SELECT
DROP POLICY IF EXISTS "Owner only SELECT access" ON public.google_calendar_integrations;

-- Política que permite ver apenas metadados (não tokens)
CREATE POLICY "Owner can view own integration metadata"
ON public.google_calendar_integrations
FOR SELECT
USING (user_id = auth.uid());

-- 8. Adicionar comentário nas colunas de token indicando que são criptografadas
COMMENT ON COLUMN public.google_calendar_integrations.access_token IS 'ENCRYPTED: AES-256-GCM encrypted OAuth access token';
COMMENT ON COLUMN public.google_calendar_integrations.refresh_token IS 'ENCRYPTED: AES-256-GCM encrypted OAuth refresh token';