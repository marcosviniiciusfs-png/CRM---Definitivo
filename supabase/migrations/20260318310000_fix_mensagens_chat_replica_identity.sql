-- Complemento: configura REPLICA IDENTITY FULL na mensagens_chat
-- (a migration anterior errou antes de chegar nesta linha)
-- Necessário para que os filtros de Realtime recebam todos os campos no payload.
ALTER TABLE mensagens_chat REPLICA IDENTITY FULL;
