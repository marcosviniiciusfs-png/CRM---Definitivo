-- Adicionar coluna stage à tabela leads
ALTER TABLE public.leads 
ADD COLUMN stage TEXT DEFAULT 'NOVO';

-- Criar índice para melhor performance em queries por stage
CREATE INDEX idx_leads_stage ON public.leads(stage);