-- Add quoted_message_id column to mensagens_chat for reply functionality
ALTER TABLE mensagens_chat 
ADD COLUMN quoted_message_id UUID REFERENCES mensagens_chat(id);

-- Add index for performance when loading quoted messages
CREATE INDEX idx_mensagens_chat_quoted ON mensagens_chat(quoted_message_id) WHERE quoted_message_id IS NOT NULL;