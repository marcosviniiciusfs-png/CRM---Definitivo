-- =============================================================================
-- FIX: Preencher organization_id em leads importados via planilha
-- que ficaram com organization_id NULL por bug na versão anterior.
--
-- Estratégia (em 2 passadas):
--   1) Leads que têm funnel_id → herdar organization_id do funil
--   2) Leads que têm funnel_stage_id mas não funnel_id → herdar pelo stage→funil
-- =============================================================================

-- Passada 1: leads com funnel_id linkado a um funil que tem organization_id
UPDATE public.leads l
SET    organization_id = sf.organization_id
FROM   public.sales_funnels sf
WHERE  l.funnel_id        = sf.id
  AND  l.organization_id  IS NULL
  AND  sf.organization_id IS NOT NULL;

-- Passada 2: leads com funnel_stage_id (mas sem funnel_id direto)
UPDATE public.leads l
SET    organization_id = sf.organization_id,
       funnel_id       = sf.id
FROM   public.funnel_stages  fs
JOIN   public.sales_funnels  sf ON sf.id = fs.funnel_id
WHERE  l.funnel_stage_id   = fs.id
  AND  l.organization_id   IS NULL
  AND  sf.organization_id  IS NOT NULL;
