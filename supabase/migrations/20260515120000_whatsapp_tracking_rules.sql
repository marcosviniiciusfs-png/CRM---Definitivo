-- ============================================================
-- WhatsApp Tracking Rules (Lead de Anuncio)
-- ============================================================
-- Marca canais WhatsApp para auditoria de primeira-mensagem de leads
-- novos. Quando match contra keywords cadastradas, lead recebe a tag
-- "Lead de anuncio" (criada lazily na primeira aplicacao).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_tracking_rules (
  whatsapp_instance_id UUID PRIMARY KEY
    REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  match_mode TEXT NOT NULL DEFAULT 'any'
    CHECK (match_mode IN ('any', 'all', 'exact_phrase')),
  case_sensitive BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wtr_org
  ON public.whatsapp_tracking_rules (organization_id);

-- Trigger: updated_at = now() em todo UPDATE
CREATE OR REPLACE FUNCTION public.touch_wtr_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_wtr_updated_at ON public.whatsapp_tracking_rules;
CREATE TRIGGER trg_wtr_updated_at
  BEFORE UPDATE ON public.whatsapp_tracking_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_wtr_updated_at();

-- RLS
ALTER TABLE public.whatsapp_tracking_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wtr_org_select ON public.whatsapp_tracking_rules;
CREATE POLICY wtr_org_select ON public.whatsapp_tracking_rules
  FOR SELECT USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS wtr_admin_write ON public.whatsapp_tracking_rules;
CREATE POLICY wtr_admin_write ON public.whatsapp_tracking_rules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = whatsapp_tracking_rules.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = whatsapp_tracking_rules.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- Sem ALTER PUBLICATION supabase_realtime — rules nao precisam realtime.
