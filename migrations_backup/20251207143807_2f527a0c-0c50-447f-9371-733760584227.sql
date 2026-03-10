-- Adicionar campos para rastreamento de duplicatas na tabela leads
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS duplicate_attempts_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_duplicate_attempt_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS duplicate_attempts_history JSONB DEFAULT '[]'::jsonb;

-- Índice para busca eficiente por email (para detecção de duplicatas)
CREATE INDEX IF NOT EXISTS idx_leads_org_email_dedup 
ON public.leads(organization_id, email) 
WHERE email IS NOT NULL;

-- Comentário explicativo
COMMENT ON COLUMN public.leads.duplicate_attempts_count IS 'Contador de tentativas de entrada como novo lead';
COMMENT ON COLUMN public.leads.last_duplicate_attempt_at IS 'Data/hora da última tentativa de duplicação';
COMMENT ON COLUMN public.leads.duplicate_attempts_history IS 'Histórico detalhado das tentativas de duplicação';