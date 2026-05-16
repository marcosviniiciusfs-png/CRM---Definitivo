-- ============================================================
-- Tracking: detect_unknown_contacts
-- ============================================================
-- Heuristica complementar: leads cujo numero nao esta na agenda do
-- aparelho do canal recebem tag "Lead de anuncio" mesmo sem match
-- de keyword. Opt-in por canal. Default false preserva comportamento.
-- ============================================================

ALTER TABLE public.whatsapp_tracking_rules
  ADD COLUMN IF NOT EXISTS detect_unknown_contacts BOOLEAN NOT NULL DEFAULT false;
