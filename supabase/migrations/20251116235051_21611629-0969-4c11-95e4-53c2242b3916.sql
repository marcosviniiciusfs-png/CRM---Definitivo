-- Adicionar campos de dados do negócio à tabela leads
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS responsavel TEXT,
ADD COLUMN IF NOT EXISTS data_inicio TIMESTAMP WITH TIME ZONE DEFAULT now(),
ADD COLUMN IF NOT EXISTS data_conclusao TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS descricao_negocio TEXT;