-- ============================================================
-- Tracking Match Log
-- ============================================================
-- Registra cada vez que a primeira mensagem de um lead novo bateu
-- com uma keyword cadastrada em whatsapp_tracking_rules.
-- Usado para o counter de "X leads tagueados por keyword Y" na UI
-- de Trackeamento (com filtro de data).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tracking_match_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  whatsapp_instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  matched_keyword TEXT NOT NULL,
  matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index principal: queries da UI filtram por canal + janela de tempo,
-- agrupam por matched_keyword.
CREATE INDEX IF NOT EXISTS idx_tml_instance_matched_at
  ON public.tracking_match_log (whatsapp_instance_id, matched_at DESC);

CREATE INDEX IF NOT EXISTS idx_tml_org
  ON public.tracking_match_log (organization_id);

-- Index pra evitar duplicar log se o webhook reprocessar (mesmo lead,
-- mesmo canal — improvavel mas defensivo). Sem unique pq pode haver
-- multiplas keywords matching na mesma msg em modos futuros.
CREATE INDEX IF NOT EXISTS idx_tml_lead_instance
  ON public.tracking_match_log (lead_id, whatsapp_instance_id);

-- RLS: SELECT por org member (mesma policy de outras tabelas)
ALTER TABLE public.tracking_match_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tml_org_select ON public.tracking_match_log;
CREATE POLICY tml_org_select ON public.tracking_match_log
  FOR SELECT USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

-- Sem policy de INSERT/UPDATE/DELETE: bloqueado para anon/authenticated.
-- Apenas service_role (Edge Function) escreve.

-- Sem realtime publication (stats sao polled, nao streamed).
