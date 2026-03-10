-- Adicionar campos de mídia à tabela mensagens_chat
ALTER TABLE public.mensagens_chat 
ADD COLUMN IF NOT EXISTS media_url TEXT,
ADD COLUMN IF NOT EXISTS media_type TEXT,
ADD COLUMN IF NOT EXISTS media_metadata JSONB;

-- Adicionar índice para facilitar busca por tipo de mídia
CREATE INDEX IF NOT EXISTS idx_mensagens_media_type ON public.mensagens_chat(media_type) WHERE media_type IS NOT NULL;