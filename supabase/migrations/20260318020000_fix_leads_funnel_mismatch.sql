-- Fix: Garantir que leads apareçam no Pipeline da organização correta.
--
-- Problema: leads têm organization_id correto mas funnel_id apontando para
-- um funil de OUTRA organização (ou NULL sem funil padrão definido).
-- O Pipeline filtra por funnel_id, então esses leads ficam invisíveis.
--
-- Solução: para cada lead com funnel_id inválido (funil não pertence à org
-- do lead), atribuir ao funil padrão da organização + primeira etapa ativa.

DO $$
DECLARE
  rec               RECORD;
  v_default_funnel  UUID;
  v_first_stage     UUID;
  v_fixed_count     INTEGER := 0;
  v_skipped_count   INTEGER := 0;
BEGIN

  -- Percorrer todos os leads cujo funnel_id não pertence à sua organização
  FOR rec IN
    SELECT
      l.id              AS lead_id,
      l.organization_id AS org_id,
      l.funnel_id       AS bad_funnel_id
    FROM public.leads l
    WHERE l.organization_id IS NOT NULL
      AND l.funnel_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.sales_funnels sf
        WHERE sf.id              = l.funnel_id
          AND sf.organization_id = l.organization_id
      )
  LOOP
    -- Buscar funil padrão da organização
    SELECT id INTO v_default_funnel
    FROM public.sales_funnels
    WHERE organization_id = rec.org_id
      AND is_default       = true
      AND is_active        = true
    LIMIT 1;

    -- Se não houver funil padrão, tentar qualquer funil ativo
    IF v_default_funnel IS NULL THEN
      SELECT id INTO v_default_funnel
      FROM public.sales_funnels
      WHERE organization_id = rec.org_id
        AND is_active        = true
      ORDER BY created_at
      LIMIT 1;
    END IF;

    IF v_default_funnel IS NULL THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    -- Buscar primeira etapa ativa do funil (não final)
    SELECT id INTO v_first_stage
    FROM public.funnel_stages
    WHERE funnel_id = v_default_funnel
      AND COALESCE(is_final, false) = false
    ORDER BY position
    LIMIT 1;

    -- Atualizar lead para apontar para o funil correto
    UPDATE public.leads
    SET
      funnel_id       = v_default_funnel,
      funnel_stage_id = v_first_stage,
      updated_at      = now()
    WHERE id = rec.lead_id;

    v_fixed_count := v_fixed_count + 1;
  END LOOP;

  RAISE NOTICE '[FIX-PIPELINE] ✅ Leads corrigidos: %, sem funil disponível (ignorados): %',
    v_fixed_count, v_skipped_count;

END $$;

-- Também corrigir leads com funnel_id NULL mas que têm funil padrão disponível
-- (garante que leads importados sem funil apareçam no pipeline)
DO $$
DECLARE
  v_fixed_null INTEGER := 0;
BEGIN
  UPDATE public.leads l
  SET
    funnel_id       = sf.id,
    funnel_stage_id = (
      SELECT fs.id
      FROM public.funnel_stages fs
      WHERE fs.funnel_id              = sf.id
        AND COALESCE(fs.is_final, false) = false
      ORDER BY fs.position
      LIMIT 1
    ),
    updated_at = now()
  FROM (
    SELECT DISTINCT ON (organization_id)
      id, organization_id
    FROM public.sales_funnels
    WHERE is_default = true
      AND is_active  = true
    ORDER BY organization_id, created_at
  ) sf
  WHERE l.organization_id = sf.organization_id
    AND l.funnel_id IS NULL;

  GET DIAGNOSTICS v_fixed_null = ROW_COUNT;
  RAISE NOTICE '[FIX-PIPELINE] ✅ Leads sem funil atribuídos ao funil padrão: %', v_fixed_null;
END $$;

-- Relatório final: verificar distribuição de leads por organização e funil
SELECT
  o.name                                              AS organizacao,
  sf.name                                             AS funil,
  COUNT(*)                                            AS total_leads,
  SUM(CASE WHEN l.funnel_id IS NULL THEN 1 ELSE 0 END) AS sem_funil
FROM public.leads l
JOIN public.organizations o ON o.id = l.organization_id
LEFT JOIN public.sales_funnels sf ON sf.id = l.funnel_id
GROUP BY o.name, sf.name
ORDER BY o.name, total_leads DESC;
