-- ============================================================
-- Fase 2 v2: Substitui OAuth-por-usuário por Service Account.
--
-- Apaga as tabelas de integração e tokens (sem dados em produção,
-- já que o OAuth nunca chegou a funcionar para o usuário final).
-- Remove integration_id de sheet_sync_configs — agora todas as
-- configs apontam para a SA única do projeto.
--
-- sheet_processed_rows e sheet_sync_logs permanecem inalteradas.
-- ============================================================

-- 1. Drop FKs antes das tabelas
ALTER TABLE public.sheet_sync_configs
  DROP CONSTRAINT IF EXISTS sheet_sync_configs_integration_id_fkey;

-- 2. Drop tabelas do fluxo OAuth
DROP TABLE IF EXISTS public.google_sheets_tokens     CASCADE;
DROP TABLE IF EXISTS public.google_sheets_integrations CASCADE;

-- 3. Drop coluna integration_id
ALTER TABLE public.sheet_sync_configs
  DROP COLUMN IF EXISTS integration_id;
