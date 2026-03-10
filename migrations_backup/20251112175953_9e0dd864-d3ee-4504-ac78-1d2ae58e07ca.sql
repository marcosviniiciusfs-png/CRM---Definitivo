-- Adicionar colunas para rastreamento de mensagens e origem do lead
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'Manual';

-- Criar índice para melhorar busca por telefone
CREATE INDEX IF NOT EXISTS idx_leads_telefone ON public.leads(telefone_lead);