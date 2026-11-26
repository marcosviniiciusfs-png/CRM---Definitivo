-- Fecha tres acessos entre organizacoes encontrados na auditoria de 26/11.

-- 1. Funcoes de token do Facebook: so o servidor (service_role) chama.
REVOKE ALL ON FUNCTION public.get_facebook_token_by_integration(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_facebook_tokens_secure(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_facebook_tokens_secure(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_facebook_token_by_integration(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_facebook_tokens_secure(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_facebook_tokens_secure(uuid, text, text) TO service_role;

-- 2. Etapas do funil: uma regra so, por participacao na organizacao dona do funil.
--    Mantem o que cada membro ja fazia na propria organizacao.
DROP POLICY IF EXISTS "org_admins_can_manage_funnel_stages" ON public.funnel_stages;
DROP POLICY IF EXISTS "org_members_can_manage_default_funnel_stages" ON public.funnel_stages;
DROP POLICY IF EXISTS "Users can delete non-final stages of their org funnels" ON public.funnel_stages;
DROP POLICY IF EXISTS "Users can create stages for their org funnels" ON public.funnel_stages;
DROP POLICY IF EXISTS "Users can view stages of their funnels" ON public.funnel_stages;
DROP POLICY IF EXISTS "Users can view stages of their org funnels" ON public.funnel_stages;
DROP POLICY IF EXISTS "org_members_can_view_funnel_stages" ON public.funnel_stages;
DROP POLICY IF EXISTS "Users can update stages of their org funnels" ON public.funnel_stages;
DROP POLICY IF EXISTS "funnel_stages_org_members" ON public.funnel_stages;

CREATE POLICY "funnel_stages_org_members" ON public.funnel_stages
  FOR ALL TO authenticated
  USING (funnel_id IN (
    SELECT sf.id FROM public.sales_funnels sf
    JOIN public.organization_members om ON om.organization_id = sf.organization_id
    WHERE om.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (funnel_id IN (
    SELECT sf.id FROM public.sales_funnels sf
    JOIN public.organization_members om ON om.organization_id = sf.organization_id
    WHERE om.user_id = (SELECT auth.uid())
  ));

ALTER TABLE public.funnel_stages ENABLE ROW LEVEL SECURITY;
-- TRUNCATE ignora RLS.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.funnel_stages FROM authenticated;

-- 3. Reserva de telefone: usada so pelos webhooks no servidor. Sem politica = ninguem pela API.
--    A tabela so existe onde o webhook de deduplicacao ja foi instalado.
DO $$
BEGIN
  IF to_regclass('public.lead_phone_claims') IS NOT NULL THEN
    ALTER TABLE public.lead_phone_claims ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.lead_phone_claims FROM anon, authenticated;
  END IF;
END $$;
