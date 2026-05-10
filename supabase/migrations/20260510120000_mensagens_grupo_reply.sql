-- ============================================================
-- Reply / quoted message em mensagens_grupo
-- ============================================================
-- Espelha o padrao usado em mensagens_chat (chat privado):
--   * quoted_message_id  -> FK opcional para a propria tabela
--   * quoted_message     -> JSONB denormalizado (corpo, direcao, media_type,
--                           sender_pushname, evolution_message_id)
--
-- A denormalizacao evita um JOIN extra em cada render da conversa e mantem
-- o "snapshot" da msg citada caso a original seja apagada futuramente.
--
-- Self-FK e ON DELETE SET NULL para nao perder a mensagem que cita
-- caso a citada seja removida.

ALTER TABLE public.mensagens_grupo
  ADD COLUMN IF NOT EXISTS quoted_message_id UUID
    REFERENCES public.mensagens_grupo(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quoted_message JSONB;

CREATE INDEX IF NOT EXISTS idx_mensagens_grupo_quoted
  ON public.mensagens_grupo (quoted_message_id)
  WHERE quoted_message_id IS NOT NULL;
