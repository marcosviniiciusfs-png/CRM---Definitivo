-- One-time cleanup: sincronizar leads.responsavel (texto) com o nome do
-- responsavel_user_id atual.
--
-- Bug observado: leads de colaboradores excluidos (antes do cascade existir)
-- tiveram responsavel_user_id reatribuido para outros agentes (manualmente
-- ou via redistribuicao), mas o campo 'responsavel' (texto) ficou com o nome
-- antigo do colaborador excluido. Resultado: relatorios e UI mostram nome
-- divergente.
--
-- Esta migracao atualiza apenas leads onde:
--   - responsavel_user_id IS NOT NULL (lead esta atribuido)
--   - o nome esperado (do owner atual) difere do nome atual em 'responsavel'
--
-- Idempotente: rodar de novo apos sync ja feito vira no-op.

UPDATE leads l
SET responsavel = COALESCE(p.full_name, om.display_name, om.email)
FROM organization_members om
LEFT JOIN profiles p ON p.user_id = om.user_id
WHERE l.responsavel_user_id IS NOT NULL
  AND l.responsavel_user_id = om.user_id
  AND l.organization_id = om.organization_id
  AND l.responsavel IS DISTINCT FROM COALESCE(p.full_name, om.display_name, om.email);
