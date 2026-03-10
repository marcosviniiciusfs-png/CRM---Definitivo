-- Remover view pública existente sem RLS
DROP VIEW IF EXISTS public.google_calendar_integrations_public;

-- Criar view segura apenas com metadados (sem tokens)
CREATE VIEW public.google_calendar_integrations_public AS
SELECT 
  id,
  organization_id,
  user_id,
  calendar_id,
  is_active,
  token_expires_at,
  created_at,
  updated_at
FROM public.google_calendar_integrations
WHERE user_id = auth.uid();

-- Habilitar RLS na view (views herdam RLS da tabela base, mas vamos garantir)
COMMENT ON VIEW public.google_calendar_integrations_public IS 'View pública segura sem tokens - apenas metadados para o próprio usuário';

-- Revogar acesso direto à tabela google_calendar_integrations para usuários autenticados
-- Apenas service_role deve acessar diretamente
REVOKE ALL ON public.google_calendar_integrations FROM authenticated;
REVOKE ALL ON public.google_calendar_integrations FROM anon;

-- Dar acesso à view pública (sem tokens)
GRANT SELECT ON public.google_calendar_integrations_public TO authenticated;

-- Atualizar função mascarada para nunca retornar tokens
CREATE OR REPLACE FUNCTION public.get_google_calendar_integrations_masked()
RETURNS TABLE(
  id uuid, 
  organization_id uuid, 
  user_id uuid, 
  calendar_id text, 
  is_active boolean, 
  token_expires_at timestamp with time zone, 
  created_at timestamp with time zone, 
  updated_at timestamp with time zone
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