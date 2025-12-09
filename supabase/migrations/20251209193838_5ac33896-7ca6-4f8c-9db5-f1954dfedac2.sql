-- Corrigir SECURITY DEFINER views
-- Dropar views com SECURITY DEFINER e recriar com SECURITY INVOKER

DROP VIEW IF EXISTS public.google_calendar_integrations_public;
DROP VIEW IF EXISTS public.google_calendar_integrations_safe;

-- Recriar view pública com SECURITY INVOKER (usa permissões do usuário que consulta)
CREATE VIEW public.google_calendar_integrations_public 
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

-- Conceder acesso à view
GRANT SELECT ON public.google_calendar_integrations_public TO authenticated;