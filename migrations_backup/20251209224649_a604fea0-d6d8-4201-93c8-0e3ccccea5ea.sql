-- Remover view com SECURITY DEFINER
DROP VIEW IF EXISTS public.google_calendar_integrations_public;

-- Recriar view com SECURITY INVOKER (padrão seguro)
-- A view herda as permissões do usuário que consulta
CREATE VIEW public.google_calendar_integrations_public 
WITH (security_invoker = on) AS
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

-- Restaurar permissões SELECT na tabela base para que RLS funcione
-- (RLS precisa de permissão SELECT para ser avaliado)
GRANT SELECT ON public.google_calendar_integrations TO authenticated;

-- Revogar INSERT/UPDATE/DELETE direto - apenas através de edge functions
REVOKE INSERT, UPDATE, DELETE ON public.google_calendar_integrations FROM authenticated;
REVOKE ALL ON public.google_calendar_integrations FROM anon;

-- Dar acesso à view pública (sem tokens)
GRANT SELECT ON public.google_calendar_integrations_public TO authenticated;

COMMENT ON VIEW public.google_calendar_integrations_public IS 'View pública segura sem tokens - usa SECURITY INVOKER e respeita RLS da tabela base';