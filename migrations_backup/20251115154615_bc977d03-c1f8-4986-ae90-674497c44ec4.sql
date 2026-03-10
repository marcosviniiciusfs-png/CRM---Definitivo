-- Adicionar campo para armazenar avatar do lead
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Comentário explicativo
COMMENT ON COLUMN public.leads.avatar_url IS 'URL da foto de perfil do WhatsApp do lead';