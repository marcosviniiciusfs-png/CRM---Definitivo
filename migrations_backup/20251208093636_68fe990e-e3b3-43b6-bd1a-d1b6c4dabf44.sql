-- Habilitar REPLICA IDENTITY FULL para realtime funcionar corretamente
ALTER TABLE mensagens_chat REPLICA IDENTITY FULL;
ALTER TABLE message_reactions REPLICA IDENTITY FULL;
ALTER TABLE pinned_messages REPLICA IDENTITY FULL;