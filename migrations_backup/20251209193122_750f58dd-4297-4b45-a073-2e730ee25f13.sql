-- =====================================================
-- SECURITY FIX: Proteção de tokens do Google Calendar
-- =====================================================

-- 1. Dropar função existente para poder recriar com nova assinatura
DROP FUNCTION IF EXISTS public.get_google_calendar_integrations_masked();

-- 2. Criar uma view segura que exclui campos sensíveis
CREATE OR REPLACE VIEW public.google_calendar_integrations_safe AS
SELECT 
  id,
  organization_id,
  user_id,
  calendar_id,
  is_active,
  token_expires_at,
  created_at,
  updated_at
  -- access_token e refresh_token NUNCA são incluídos
FROM public.google_calendar_integrations;

-- 3. Recriar função masked que NUNCA retorna tokens
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
    -- access_token e refresh_token NUNCA retornados
  FROM public.google_calendar_integrations gci
  WHERE gci.user_id = auth.uid();
END;
$$;

-- 4. Dropar e recriar função para edge functions obterem tokens
DROP FUNCTION IF EXISTS public.get_google_calendar_tokens_for_user(uuid);

CREATE OR REPLACE FUNCTION public.get_google_calendar_tokens_for_user(target_user_id uuid)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  user_id uuid,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  calendar_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    gci.id,
    gci.organization_id,
    gci.user_id,
    gci.access_token,
    gci.refresh_token,
    gci.token_expires_at,
    gci.calendar_id
  FROM public.google_calendar_integrations gci
  WHERE gci.user_id = target_user_id
    AND gci.is_active = true
  ORDER BY gci.created_at DESC
  LIMIT 1;
END;
$$;

-- 5. Revogar acesso direto SELECT à tabela para usuários regulares
REVOKE SELECT ON public.google_calendar_integrations FROM anon, authenticated;

-- 6. Conceder acesso à view segura
GRANT SELECT ON public.google_calendar_integrations_safe TO authenticated;

-- 7. Atualizar políticas RLS para serem mais restritivas
DROP POLICY IF EXISTS "Users can only view their own integration metadata" ON public.google_calendar_integrations;
DROP POLICY IF EXISTS "Users can only create their own integrations" ON public.google_calendar_integrations;
DROP POLICY IF EXISTS "Users can only update their own integrations" ON public.google_calendar_integrations;
DROP POLICY IF EXISTS "Users can only delete their own integrations" ON public.google_calendar_integrations;
DROP POLICY IF EXISTS "Restrict direct table access" ON public.google_calendar_integrations;

-- SELECT bloqueado - use a view ou função masked
CREATE POLICY "Block direct SELECT access" 
ON public.google_calendar_integrations 
FOR SELECT 
USING (false);

-- INSERT: Usuários podem criar suas próprias integrações
CREATE POLICY "Users can create their own calendar integrations" 
ON public.google_calendar_integrations 
FOR INSERT 
WITH CHECK (user_id = auth.uid());

-- UPDATE: Usuários podem atualizar suas próprias integrações
CREATE POLICY "Users can update their own calendar integrations" 
ON public.google_calendar_integrations 
FOR UPDATE 
USING (user_id = auth.uid());

-- DELETE: Usuários podem deletar suas próprias integrações
CREATE POLICY "Users can delete their own calendar integrations" 
ON public.google_calendar_integrations 
FOR DELETE 
USING (user_id = auth.uid());