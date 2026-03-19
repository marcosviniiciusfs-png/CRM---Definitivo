-- =============================================================================
-- Fix: habilitar Realtime e RLS corretos na tabela mensagens_chat
-- Sem isso, os eventos postgres_changes não chegam ao cliente (Chat.tsx)
-- e as mensagens recebidas dos leads nunca aparecem em tempo real.
-- =============================================================================

-- 1. Garante que a tabela existe com as colunas mínimas necessárias
--    (caso ela já exista, o CREATE será ignorado)
CREATE TABLE IF NOT EXISTS mensagens_chat (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_lead             UUID NOT NULL,
  direcao             TEXT NOT NULL CHECK (direcao IN ('ENTRADA', 'SAIDA')),
  corpo_mensagem      TEXT,
  data_hora           TIMESTAMPTZ NOT NULL DEFAULT now(),
  evolution_message_id TEXT,
  status_entrega      TEXT,
  media_type          TEXT,
  media_url           TEXT,
  quoted_message_id   UUID REFERENCES mensagens_chat(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Habilita RLS
ALTER TABLE mensagens_chat ENABLE ROW LEVEL SECURITY;

-- 3. Remove políticas antigas para recriar de forma limpa
DROP POLICY IF EXISTS "org_members_can_view_chat_messages"  ON mensagens_chat;
DROP POLICY IF EXISTS "org_members_can_insert_messages"     ON mensagens_chat;
DROP POLICY IF EXISTS "org_members_can_update_messages"     ON mensagens_chat;
DROP POLICY IF EXISTS "service_role_full_access"            ON mensagens_chat;

-- 4. SELECT: membros da org podem ler mensagens dos seus leads
CREATE POLICY "org_members_can_view_chat_messages"
ON mensagens_chat FOR SELECT
USING (
  id_lead IN (
    SELECT l.id
    FROM   leads l
    JOIN   organization_members om ON om.organization_id = l.organization_id
    WHERE  om.user_id = auth.uid()
  )
);

-- 5. INSERT: membros da org podem inserir mensagens nos seus leads
--    (o webhook usa service_role que contorna RLS automaticamente)
CREATE POLICY "org_members_can_insert_messages"
ON mensagens_chat FOR INSERT
WITH CHECK (
  id_lead IN (
    SELECT l.id
    FROM   leads l
    JOIN   organization_members om ON om.organization_id = l.organization_id
    WHERE  om.user_id = auth.uid()
  )
);

-- 6. UPDATE: membros da org podem atualizar (ex: status_entrega)
CREATE POLICY "org_members_can_update_messages"
ON mensagens_chat FOR UPDATE
USING (
  id_lead IN (
    SELECT l.id
    FROM   leads l
    JOIN   organization_members om ON om.organization_id = l.organization_id
    WHERE  om.user_id = auth.uid()
  )
);

-- 7. Adiciona a tabela à publicação do Supabase Realtime (idempotente)
--    Sem isso, nenhum evento postgres_changes é disparado para esta tabela.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'mensagens_chat'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE mensagens_chat;
  END IF;
END $$;

-- 8. REPLICA IDENTITY FULL garante que o payload do evento inclua todos os campos,
--    inclusive as colunas necessárias para o filtro id_lead=eq.X funcionar.
ALTER TABLE mensagens_chat REPLICA IDENTITY FULL;
