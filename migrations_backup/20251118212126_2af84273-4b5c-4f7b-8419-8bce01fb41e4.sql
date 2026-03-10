-- Adicionar campos de status de presença na tabela leads
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS is_online boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS last_seen timestamp with time zone DEFAULT NULL;

-- Criar índice para melhorar performance nas consultas de status
CREATE INDEX IF NOT EXISTS idx_leads_last_seen ON public.leads(last_seen);

-- Comentários para documentação
COMMENT ON COLUMN public.leads.is_online IS 'Indica se o lead está online no WhatsApp no momento';
COMMENT ON COLUMN public.leads.last_seen IS 'Data e hora da última vez que o lead foi visto online no WhatsApp';