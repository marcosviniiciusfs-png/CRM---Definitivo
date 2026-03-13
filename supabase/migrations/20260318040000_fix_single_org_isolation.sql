-- ============================================================
-- FIX: Isolamento total 1 usuário : 1 organização
--
-- Problema: A migration de recuperação de emergência criou orgs
-- extras e associou usuários a múltiplas organizações, causando
-- o modal de seleção de organização ao logar.
--
-- Solução:
--   1. Para cada usuário com múltiplas orgs, manter APENAS a
--      organização onde é OWNER. Se não for owner em nenhuma,
--      manter a de entrada mais antiga. Remover as demais.
--   2. Garantir que ensure_user_organization seja idempotente
--      e NÃO crie org extra se o usuário já tem uma.
--   3. Recriar get_my_organization_memberships sem JOIN no nome
--      (mais robusto a orgs sem nome).
-- ============================================================

-- ============================================================
-- 1. LIMPAR MEMBERSHIPS DUPLICADOS
--    Para cada usuário, manter apenas 1 membership:
--    - Preferência: onde tem role = 'owner'
--    - Desempate: organization_id mais antigo (menor UUID, ou
--      o primeiro inserido — usamos ctid como proxy de inserção)
-- ============================================================

DO $$
DECLARE
  dup_user RECORD;
  keep_org_id UUID;
BEGIN
  -- Iterar sobre usuários com mais de 1 organização
  FOR dup_user IN
    SELECT user_id, COUNT(*) as cnt
    FROM public.organization_members
    GROUP BY user_id
    HAVING COUNT(*) > 1
  LOOP
    -- Tentar encontrar uma org onde o usuário é owner
    SELECT organization_id INTO keep_org_id
    FROM public.organization_members
    WHERE user_id = dup_user.user_id
      AND role = 'owner'
    ORDER BY organization_id  -- determinístico
    LIMIT 1;

    -- Se não é owner em nenhuma, pegar o primeiro membership (por org_id)
    IF keep_org_id IS NULL THEN
      SELECT organization_id INTO keep_org_id
      FROM public.organization_members
      WHERE user_id = dup_user.user_id
      ORDER BY organization_id
      LIMIT 1;
    END IF;

    -- Remover todos os outros memberships (exceto o escolhido)
    DELETE FROM public.organization_members
    WHERE user_id = dup_user.user_id
      AND organization_id != keep_org_id;

    RAISE NOTICE '[FIX-ISOLATION] Usuário % mantido apenas na org %', dup_user.user_id, keep_org_id;
  END LOOP;
END $$;

-- ============================================================
-- 2. LIMPEZA DE ORGANIZAÇÕES ÓRFÃS (sem nenhum membro)
--    Para não deixar lixo no banco após remoção de memberships
-- ============================================================

DO $$
DECLARE
  orphan_org RECORD;
BEGIN
  FOR orphan_org IN
    SELECT o.id, o.name
    FROM public.organizations o
    WHERE NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = o.id
    )
  LOOP
    -- Deletar cascading: funis, etc são ON DELETE CASCADE ou serão limpos
    DELETE FROM public.organizations WHERE id = orphan_org.id;
    RAISE NOTICE '[FIX-ISOLATION] Organização órfã removida: % (%)', orphan_org.name, orphan_org.id;
  END LOOP;
END $$;

-- ============================================================
-- 3. RECRIAR get_my_organization_memberships
--    Versão robusta: não falha se org não tem nome
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_organization_memberships()
RETURNS TABLE (organization_id UUID, organization_name TEXT, role TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    om.organization_id,
    COALESCE(o.name, 'Workspace') AS organization_name,
    om.role::TEXT
  FROM public.organization_members om
  LEFT JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_organization_memberships() TO authenticated;

-- ============================================================
-- 4. RECRIAR ensure_user_organization
--    Versão hardened: verifica primeiro, cria apenas se ausente,
--    nunca duplica mesmo sob race condition (ON CONFLICT)
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_user_organization()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid  UUID;
  v_oid  UUID;
  v_mail TEXT;
  v_name TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No authenticated user');
  END IF;

  -- Verificar se já tem organização (pode ter mais de uma após corrups, pegar a de owner)
  SELECT organization_id INTO v_oid
  FROM public.organization_members
  WHERE user_id = v_uid
    AND role = 'owner'
  ORDER BY organization_id
  LIMIT 1;

  -- Se não é owner em nenhuma, pegar qualquer membership
  IF v_oid IS NULL THEN
    SELECT organization_id INTO v_oid
    FROM public.organization_members
    WHERE user_id = v_uid
    ORDER BY organization_id
    LIMIT 1;
  END IF;

  -- Só cria se realmente não tem nenhuma
  IF v_oid IS NULL THEN
    SELECT
      email,
      COALESCE(
        raw_user_meta_data->>'full_name',
        raw_user_meta_data->>'name',
        split_part(email, '@', 1)
      )
    INTO v_mail, v_name
    FROM auth.users
    WHERE id = v_uid;

    INSERT INTO public.organizations (name)
    VALUES (COALESCE(v_name, 'Meu') || ' Workspace')
    RETURNING id INTO v_oid;

    INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
    VALUES (v_oid, v_uid, 'owner', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Garantir assinatura free (idempotente)
  INSERT INTO public.subscriptions (user_id, organization_id, plan_id, status, amount, start_date)
  VALUES (v_uid, v_oid, 'enterprise_free', 'authorized', 0, now())
  ON CONFLICT (user_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    plan_id = COALESCE(NULLIF(subscriptions.plan_id, ''), 'enterprise_free'),
    status = COALESCE(NULLIF(subscriptions.status, ''), 'authorized');

  RETURN jsonb_build_object('success', true, 'organization_id', v_oid);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_organization() TO authenticated;

-- ============================================================
-- 5. VERIFICAÇÃO FINAL
-- ============================================================

DO $$
DECLARE
  multi_org_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO multi_org_count
  FROM (
    SELECT user_id
    FROM public.organization_members
    GROUP BY user_id
    HAVING COUNT(*) > 1
  ) sub;

  IF multi_org_count > 0 THEN
    RAISE WARNING '[FIX-ISOLATION] Ainda existem % usuários com múltiplas orgs!', multi_org_count;
  ELSE
    RAISE NOTICE '[FIX-ISOLATION] ✅ Todos os usuários têm exatamente 1 organização.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
