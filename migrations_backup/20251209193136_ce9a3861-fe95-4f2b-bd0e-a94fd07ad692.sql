-- Corrigir aviso de SECURITY DEFINER view
-- A view não precisa ser SECURITY DEFINER, apenas uma view regular com RLS da tabela base

-- Dropar e recriar a view sem SECURITY DEFINER
DROP VIEW IF EXISTS public.google_calendar_integrations_safe;

CREATE VIEW public.google_calendar_integrations_safe 
WITH (security_invoker = true) AS
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

-- Garantir que a view usa as permissões do usuário que consulta
GRANT SELECT ON public.google_calendar_integrations_safe TO authenticated;