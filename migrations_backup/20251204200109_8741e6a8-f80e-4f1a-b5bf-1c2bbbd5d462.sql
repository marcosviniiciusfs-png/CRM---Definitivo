-- Índices de Performance para tabela leads

-- 1. Pipeline: Listar leads por funil e etapa
CREATE INDEX IF NOT EXISTS idx_leads_org_funnel_stage 
ON public.leads(organization_id, funnel_id, funnel_stage_id);

-- 2. Vendedor: Listar leads por responsável
CREATE INDEX IF NOT EXISTS idx_leads_org_responsavel 
ON public.leads(organization_id, responsavel);

-- 3. Relatórios: Filtrar por data e status
CREATE INDEX IF NOT EXISTS idx_leads_org_created_stage 
ON public.leads(organization_id, created_at DESC, funnel_stage_id);

-- 4. WhatsApp: Buscar lead por telefone (webhook)
CREATE INDEX IF NOT EXISTS idx_leads_org_phone 
ON public.leads(organization_id, telefone_lead);