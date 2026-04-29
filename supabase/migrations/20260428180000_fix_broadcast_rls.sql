-- Corrigir RLS de broadcasts/broadcast_contacts.
--
-- A migration original (20260418000000_add_broadcast_tables.sql) referencia
-- a tabela `profiles` para resolver organization_id, mas o sistema usa
-- `organization_members` em todas as outras tabelas. Como `profiles` nao
-- tem coluna organization_id, as policies bloqueavam silenciosamente todas
-- as leituras/escritas em broadcasts.

DROP POLICY IF EXISTS "org_broadcasts" ON broadcasts;
DROP POLICY IF EXISTS "org_broadcast_contacts" ON broadcast_contacts;

CREATE POLICY "org_broadcasts" ON broadcasts
  FOR ALL USING (organization_id = (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid()
    LIMIT 1
  ));

CREATE POLICY "org_broadcast_contacts" ON broadcast_contacts
  FOR ALL USING (broadcast_id IN (
    SELECT id FROM broadcasts WHERE organization_id = (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      LIMIT 1
    )
  ));
