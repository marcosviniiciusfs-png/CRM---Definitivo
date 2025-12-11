-- Criar tabela segura para tokens do Facebook
CREATE TABLE IF NOT EXISTS public.facebook_integration_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID NOT NULL UNIQUE REFERENCES public.facebook_integrations(id) ON DELETE CASCADE,
  encrypted_access_token TEXT,
  encrypted_page_access_token TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS - bloquear todo acesso direto
ALTER TABLE public.facebook_integration_tokens ENABLE ROW LEVEL SECURITY;

-- Política que bloqueia acesso direto (tokens só via funções SECURITY DEFINER)
CREATE POLICY "Block direct access to facebook tokens"
ON public.facebook_integration_tokens
FOR ALL
USING (false);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_facebook_tokens_updated_at
BEFORE UPDATE ON public.facebook_integration_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Função para salvar tokens criptografados (chamada pelo OAuth callback)
CREATE OR REPLACE FUNCTION public.update_facebook_tokens_secure(
  p_integration_id UUID,
  p_encrypted_access_token TEXT,
  p_encrypted_page_access_token TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.facebook_integration_tokens (
    integration_id,
    encrypted_access_token,
    encrypted_page_access_token
  ) VALUES (
    p_integration_id,
    p_encrypted_access_token,
    p_encrypted_page_access_token
  )
  ON CONFLICT (integration_id) DO UPDATE SET
    encrypted_access_token = EXCLUDED.encrypted_access_token,
    encrypted_page_access_token = EXCLUDED.encrypted_page_access_token,
    updated_at = now();
END;
$$;

-- Função para buscar tokens (chamada pelas edge functions com service_role)
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
SET search_path = 'public'
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