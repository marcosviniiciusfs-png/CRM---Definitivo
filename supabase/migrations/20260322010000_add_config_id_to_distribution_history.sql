-- ============================================================
-- Adicionar config_id (roleta) ao histórico de distribuição
-- Isso permite que o round-robin mantenha sequência independente
-- por roleta, evitando contaminação cruzada entre roletss distintas.
-- ============================================================

ALTER TABLE public.lead_distribution_history
  ADD COLUMN IF NOT EXISTS config_id UUID REFERENCES public.lead_distribution_configs(id) ON DELETE SET NULL;

-- Índice para buscas eficientes por config + org no round-robin
CREATE INDEX IF NOT EXISTS idx_lead_distribution_history_config_id
  ON public.lead_distribution_history (config_id, organization_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
