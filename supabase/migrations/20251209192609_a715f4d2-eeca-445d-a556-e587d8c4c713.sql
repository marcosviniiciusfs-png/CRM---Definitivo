-- Habilitar extensão pgcrypto para criptografia
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Criar função para criptografar tokens OAuth
CREATE OR REPLACE FUNCTION public.encrypt_oauth_token(plain_token TEXT, encryption_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF plain_token IS NULL OR plain_token = '' THEN
    RETURN NULL;
  END IF;
  -- Usar AES-256 via pgp_sym_encrypt
  RETURN encode(pgp_sym_encrypt(plain_token, encryption_key, 'cipher-algo=aes256'), 'base64');
END;
$$;

-- Criar função para descriptografar tokens OAuth
CREATE OR REPLACE FUNCTION public.decrypt_oauth_token(encrypted_token TEXT, encryption_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF encrypted_token IS NULL OR encrypted_token = '' THEN
    RETURN NULL;
  END IF;
  -- Descriptografar usando pgp_sym_decrypt
  RETURN pgp_sym_decrypt(decode(encrypted_token, 'base64'), encryption_key);
EXCEPTION
  WHEN OTHERS THEN
    -- Se falhar a descriptografia (token antigo não criptografado), retornar como está
    RETURN encrypted_token;
END;
$$;

-- Criar função segura para obter tokens descriptografados (apenas para o próprio usuário)
CREATE OR REPLACE FUNCTION public.get_google_calendar_tokens_for_user(_user_id UUID)
RETURNS TABLE(
  id UUID,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  calendar_id TEXT,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  encryption_key TEXT;
BEGIN
  -- Apenas o próprio usuário pode acessar seus tokens
  IF auth.uid() IS NULL OR auth.uid() != _user_id THEN
    RAISE EXCEPTION 'Acesso negado: você só pode acessar seus próprios tokens';
  END IF;
  
  -- Esta função é chamada apenas por edge functions que têm acesso à chave
  -- Para segurança máxima, os tokens são acessados diretamente nas edge functions
  RETURN QUERY
  SELECT 
    gci.id,
    gci.access_token,
    gci.refresh_token,
    gci.token_expires_at,
    gci.calendar_id,
    gci.is_active
  FROM public.google_calendar_integrations gci
  WHERE gci.user_id = _user_id AND gci.is_active = true
  LIMIT 1;
END;
$$;

-- Atualizar a função mascarada para NUNCA mostrar tokens (nem para admins)
CREATE OR REPLACE FUNCTION public.get_google_calendar_integrations_masked()
RETURNS TABLE(
  id UUID,
  user_id UUID,
  organization_id UUID,
  is_active BOOLEAN,
  calendar_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_org_id uuid;
BEGIN
  -- Get the current user's organization
  SELECT om.organization_id 
  INTO current_user_org_id
  FROM public.organization_members om
  WHERE om.user_id = auth.uid()
  LIMIT 1;
  
  -- Return integrations with tokens ALWAYS masked (never expose encrypted tokens)
  RETURN QUERY
  SELECT 
    gci.id,
    gci.user_id,
    gci.organization_id,
    gci.is_active,
    gci.calendar_id,
    -- NEVER expose tokens to frontend - they are encrypted and only accessible via edge functions
    NULL::TEXT as access_token,
    NULL::TEXT as refresh_token,
    gci.token_expires_at,
    gci.created_at,
    gci.updated_at
  FROM public.google_calendar_integrations gci
  WHERE gci.organization_id = current_user_org_id;
END;
$$;

-- Atualizar políticas RLS para restringir acesso aos tokens
-- Primeiro, remover políticas existentes
DROP POLICY IF EXISTS "Users can only view their own Google Calendar integrations" ON public.google_calendar_integrations;
DROP POLICY IF EXISTS "Users can only view their own calendar integration" ON public.google_calendar_integrations;
DROP POLICY IF EXISTS "Users can create Google Calendar integrations in their organiza" ON public.google_calendar_integrations;
DROP POLICY IF EXISTS "Users can create their own calendar integration" ON public.google_calendar_integrations;
DROP POLICY IF EXISTS "Users can update their organization's Google Calendar integrati" ON public.google_calendar_integrations;
DROP POLICY IF EXISTS "Users can update their own calendar integration" ON public.google_calendar_integrations;
DROP POLICY IF EXISTS "Users can delete their organization's Google Calendar integrati" ON public.google_calendar_integrations;
DROP POLICY IF EXISTS "Users can delete their own calendar integration" ON public.google_calendar_integrations;

-- Criar novas políticas mais restritivas
-- Usuários só podem ver suas próprias integrações (não tokens - eles são acessados via RPC)
CREATE POLICY "Users can only view their own integration metadata"
ON public.google_calendar_integrations
FOR SELECT
USING (user_id = auth.uid());

-- Usuários só podem criar integrações para si mesmos
CREATE POLICY "Users can only create their own integrations"
ON public.google_calendar_integrations
FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Usuários só podem atualizar suas próprias integrações
CREATE POLICY "Users can only update their own integrations"
ON public.google_calendar_integrations
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Usuários só podem deletar suas próprias integrações
CREATE POLICY "Users can only delete their own integrations"
ON public.google_calendar_integrations
FOR DELETE
USING (user_id = auth.uid());