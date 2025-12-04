-- Adicionar coluna responsavel_user_id (UUID) na tabela leads
-- Mantém responsavel (TEXT) para compatibilidade durante transição

-- 1. Adicionar nova coluna UUID
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS responsavel_user_id UUID;

-- 2. Criar índice de performance na nova coluna
CREATE INDEX IF NOT EXISTS idx_leads_org_responsavel_user_id 
ON public.leads(organization_id, responsavel_user_id);

-- 3. Adicionar comentário explicativo
COMMENT ON COLUMN public.leads.responsavel_user_id IS 'UUID do usuário responsável - substitui campo TEXT responsavel';
COMMENT ON COLUMN public.leads.responsavel IS 'DEPRECATED: Use responsavel_user_id. Mantido para compatibilidade.';