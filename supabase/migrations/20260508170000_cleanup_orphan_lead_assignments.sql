-- One-time cleanup de duas categorias de dados orfaos deixados por
-- exclusoes de colaborador feitas ANTES do cascade automatico existir.
--
-- 1. leads.responsavel_user_id -> aponta para user_id que NAO esta em
--    organization_members daquela org. UI mostra um nome de colaborador
--    que nao existe mais. Solucao: zerar ambos os campos. Auto-redistribute
--    Phase 2 pega esses leads no proximo ciclo do cron e distribui via
--    roleta da org.
--
-- 2. agent_distribution_settings.user_id -> aponta para user_id que NAO
--    esta em organization_members daquela org. Aparece na pagina Agentes
--    da Roleta como "Agente" (sem nome). Solucao: deletar a linha.
--
-- Idempotente: rodar de novo e' no-op se o cleanup ja foi feito.

-- Fix 1: leads orfaos
UPDATE leads l
SET responsavel_user_id = NULL,
    responsavel = NULL
WHERE l.responsavel_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.user_id = l.responsavel_user_id
      AND om.organization_id = l.organization_id
  );

-- Fix 2: agent_distribution_settings orfaos
DELETE FROM agent_distribution_settings ads
WHERE NOT EXISTS (
  SELECT 1 FROM organization_members om
  WHERE om.user_id = ads.user_id
    AND om.organization_id = ads.organization_id
);
