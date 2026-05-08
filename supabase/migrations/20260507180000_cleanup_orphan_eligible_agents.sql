-- One-time cleanup: remove user_ids "fantasmas" de lead_distribution_configs.eligible_agents.
--
-- Contexto: antes do cascade automatico (commit 81f1301 / 2026-04-30), a exclusao de
-- colaborador via pagina Colaboradores nao limpava 'eligible_agents'. Resultado: arrays
-- carregam user_ids de membros que nao existem mais em organization_members.
--
-- Este script remove apenas user_ids que NAO TEM CORRESPONDENCIA em organization_members
-- da mesma organizacao. Membros INATIVOS (is_active=false) sao PRESERVADOS no array,
-- porque o owner pode reativar o colaborador no futuro e queremos que ele volte para a
-- roleta automaticamente. O backend (getAvailableAgentsFast) ja filtra is_active=true
-- na hora de distribuir, entao membros inativos no array nao pegam leads.
--
-- Idempotente: rodar multiplas vezes nao causa problema. Atualizacoes futuras de
-- eligible_agents continuam funcionando normalmente.

UPDATE lead_distribution_configs ldc
SET eligible_agents = ARRAY(
  SELECT u FROM unnest(ldc.eligible_agents) AS u
  WHERE EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.user_id::text = u::text
      AND om.organization_id = ldc.organization_id
  )
)
WHERE EXISTS (
  SELECT 1 FROM unnest(ldc.eligible_agents) AS u
  WHERE NOT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.user_id::text = u::text
      AND om.organization_id = ldc.organization_id
  )
);
