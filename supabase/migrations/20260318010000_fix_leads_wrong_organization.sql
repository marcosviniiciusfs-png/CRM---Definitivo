-- Fix: Mover leads importados que caíram na organização errada.
-- leaodonorte94@gmail.com importou leads que foram parar em falconempreendimentos9@gmail.com

DO $$
DECLARE
  v_leao_user_id      UUID;
  v_falcon_user_id    UUID;
  v_leao_org_id       UUID;
  v_falcon_org_id     UUID;
  v_moved_count       INTEGER := 0;
BEGIN
  -- Buscar user IDs pelos emails
  SELECT id INTO v_leao_user_id   FROM auth.users WHERE email = 'leaodonorte94@gmail.com'   LIMIT 1;
  SELECT id INTO v_falcon_user_id FROM auth.users WHERE email = 'falconempreendimentos9@gmail.com' LIMIT 1;

  IF v_leao_user_id IS NULL THEN
    RAISE NOTICE '[FIX-LEADS] Usuário leaodonorte94@gmail.com NÃO encontrado — nada a fazer.';
    RETURN;
  END IF;
  IF v_falcon_user_id IS NULL THEN
    RAISE NOTICE '[FIX-LEADS] Usuário falconempreendimentos9@gmail.com NÃO encontrado — nada a fazer.';
    RETURN;
  END IF;

  -- Buscar organization_id de cada conta (papel de owner preferencial)
  SELECT om.organization_id INTO v_leao_org_id
  FROM public.organization_members om
  WHERE om.user_id = v_leao_user_id
  ORDER BY CASE WHEN om.role = 'owner' THEN 0 ELSE 1 END
  LIMIT 1;

  SELECT om.organization_id INTO v_falcon_org_id
  FROM public.organization_members om
  WHERE om.user_id = v_falcon_user_id
  ORDER BY CASE WHEN om.role = 'owner' THEN 0 ELSE 1 END
  LIMIT 1;

  RAISE NOTICE '[FIX-LEADS] leao org: %, falcon org: %', v_leao_org_id, v_falcon_org_id;

  IF v_leao_org_id IS NULL THEN
    RAISE NOTICE '[FIX-LEADS] Organização do leao NÃO encontrada — abortando.';
    RETURN;
  END IF;
  IF v_falcon_org_id IS NULL THEN
    RAISE NOTICE '[FIX-LEADS] Organização do falcon NÃO encontrada — abortando.';
    RETURN;
  END IF;
  IF v_leao_org_id = v_falcon_org_id THEN
    RAISE NOTICE '[FIX-LEADS] As duas contas compartilham a mesma organização — nada a mover.';
    RETURN;
  END IF;

  -- Mover leads que:
  --   1. Estão na organização do falcon, E
  --   2. Foram importados com source = 'Importação', E
  --   3. Foram criados nas últimas 72 horas (janela de segurança)
  --      OU o responsavel_user_id aponta para leao
  UPDATE public.leads
  SET organization_id = v_leao_org_id
  WHERE organization_id = v_falcon_org_id
    AND (
      source = 'Importação'
      OR responsavel_user_id = v_leao_user_id
    )
    AND created_at >= now() - interval '72 hours';

  GET DIAGNOSTICS v_moved_count = ROW_COUNT;
  RAISE NOTICE '[FIX-LEADS] ✅ % leads movidos de % para %', v_moved_count, v_falcon_org_id, v_leao_org_id;

  -- Leads órfãos (sem organization_id) criados pelo leao → atribuir à org correta
  UPDATE public.leads
  SET organization_id = v_leao_org_id
  WHERE organization_id IS NULL
    AND responsavel_user_id = v_leao_user_id;

  GET DIAGNOSTICS v_moved_count = ROW_COUNT;
  RAISE NOTICE '[FIX-LEADS] ✅ % leads órfãos reconectados à org do leao', v_moved_count;

END $$;

-- Verificação final
SELECT
  o.name            AS organizacao,
  l.source,
  COUNT(*)          AS total,
  MIN(l.created_at) AS mais_antigo,
  MAX(l.created_at) AS mais_recente
FROM public.leads l
JOIN public.organizations o ON o.id = l.organization_id
JOIN public.organization_members om ON om.organization_id = o.id
JOIN auth.users u ON u.id = om.user_id
WHERE u.email IN ('leaodonorte94@gmail.com', 'falconempreendimentos9@gmail.com')
  AND l.source = 'Importação'
GROUP BY o.name, l.source
ORDER BY o.name;
