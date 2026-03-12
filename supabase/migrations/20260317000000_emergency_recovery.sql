-- ============================================================
-- EMERGENCY RECOVERY: Restaurar organizações, funis e RPCs
--
-- Problema 1: RPCs críticas (ensure_user_organization,
--   get_my_organization_memberships, set_user_active_organization)
--   podem não existir em produção — causam organizationId = null.
--
-- Problema 2: Usuários sem organização → sistema inutilizável.
--
-- Problema 3: Organizações sem funil padrão → erro ao carregar.
--
-- Problema 4: Leads órfãos (organization_id IS NULL).
--
-- Este script é IDEMPOTENTE — seguro executar múltiplas vezes.
-- ============================================================

-- ============================================================
-- 1. RPCs CRÍTICAS (necessárias para OrganizationContext.tsx)
-- ============================================================

-- Retorna todas as organizações do usuário autenticado
DROP FUNCTION IF EXISTS public.get_my_organization_memberships();
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
    o.name AS organization_name,
    om.role::TEXT
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_organization_memberships() TO authenticated;

-- Stub de compatibilidade — RLS é dinâmico via organization_members
CREATE OR REPLACE FUNCTION public.set_user_active_organization(_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_active_organization(UUID) TO authenticated;

-- Cria organização para o usuário autenticado caso não tenha
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

  -- Verificar se já tem organização
  SELECT organization_id INTO v_oid
  FROM public.organization_members
  WHERE user_id = v_uid
  LIMIT 1;

  IF v_oid IS NULL THEN
    -- Buscar dados do usuário para nomear a org
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

    -- Criar organização
    INSERT INTO public.organizations (name)
    VALUES (COALESCE(v_name, 'Meu') || ' Workspace')
    RETURNING id INTO v_oid;

    -- Adicionar como owner
    INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
    VALUES (v_oid, v_uid, 'owner', true);
  END IF;

  -- Garantir assinatura free
  INSERT INTO public.subscriptions (user_id, organization_id, plan_id, status, amount, start_date)
  VALUES (v_uid, v_oid, 'enterprise_free', 'authorized', 0, now())
  ON CONFLICT (user_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    plan_id = 'enterprise_free',
    status = 'authorized';

  RETURN jsonb_build_object('success', true, 'organization_id', v_oid);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_organization() TO authenticated;

-- ============================================================
-- 2. RECUPERAR USUÁRIOS ÓRFÃOS (sem organização)
-- ============================================================

DO $$
DECLARE
  user_record RECORD;
  new_org_id  UUID;
BEGIN
  FOR user_record IN
    SELECT
      u.id,
      u.email,
      COALESCE(
        u.raw_user_meta_data->>'full_name',
        u.raw_user_meta_data->>'name',
        split_part(u.email, '@', 1),
        'Usuário'
      ) AS display_name
    FROM auth.users u
    WHERE NOT EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = u.id
    )
    AND u.email_confirmed_at IS NOT NULL
  LOOP
    -- Criar organização
    INSERT INTO public.organizations (name)
    VALUES (user_record.display_name || ' Workspace')
    RETURNING id INTO new_org_id;

    -- Adicionar como owner
    INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
    VALUES (new_org_id, user_record.id, 'owner', true)
    ON CONFLICT DO NOTHING;

    -- Garantir assinatura
    INSERT INTO public.subscriptions (user_id, organization_id, plan_id, status, amount, start_date)
    VALUES (user_record.id, new_org_id, 'enterprise_free', 'authorized', 0, now())
    ON CONFLICT (user_id) DO UPDATE SET
      organization_id = EXCLUDED.organization_id,
      plan_id = 'enterprise_free',
      status = 'authorized';

    RAISE NOTICE '[RECOVERY] Organização criada para: %', user_record.email;
  END LOOP;
END $$;

-- ============================================================
-- 3. CRIAR FUNIL PADRÃO PARA ORGANIZAÇÕES SEM FUNIL
-- ============================================================

DO $$
DECLARE
  org_record     RECORD;
  new_funnel_id  UUID;
BEGIN
  FOR org_record IN
    SELECT o.id, o.name
    FROM public.organizations o
    WHERE NOT EXISTS (
      SELECT 1 FROM public.sales_funnels sf
      WHERE sf.organization_id = o.id
    )
  LOOP
    -- Criar funil padrão
    INSERT INTO public.sales_funnels (organization_id, name, description, is_default, is_active)
    VALUES (org_record.id, 'Funil Padrão', 'Funil de vendas principal', true, true)
    RETURNING id INTO new_funnel_id;

    -- Criar etapas padrão
    INSERT INTO public.funnel_stages (funnel_id, name, color, position, stage_type)
    VALUES
      (new_funnel_id, 'Novo Lead',       '#3B82F6', 0, 'active'),
      (new_funnel_id, 'Qualificação',    '#06B6D4', 1, 'active'),
      (new_funnel_id, 'Proposta',        '#8B5CF6', 2, 'active'),
      (new_funnel_id, 'Negociação',      '#EAB308', 3, 'active'),
      (new_funnel_id, 'Venda Realizada', '#10B981', 4, 'won'),
      (new_funnel_id, 'Perdido',         '#EF4444', 5, 'lost');

    RAISE NOTICE '[RECOVERY] Funil padrão criado para org: %', org_record.name;
  END LOOP;
END $$;

-- ============================================================
-- 4. RECONECTAR LEADS ÓRFÃOS (organization_id IS NULL)
-- ============================================================

UPDATE public.leads l
SET organization_id = om.organization_id
FROM public.organization_members om
WHERE l.organization_id IS NULL
  AND l.responsavel_user_id = om.user_id
  AND om.role = 'owner';

-- ============================================================
-- 5. TRIGGER: Auto-criar funil padrão em novas organizações
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_create_default_funnel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_funnel_id UUID;
BEGIN
  INSERT INTO public.sales_funnels (organization_id, name, description, is_default, is_active)
  VALUES (NEW.id, 'Funil Padrão', 'Funil de vendas principal', true, true)
  RETURNING id INTO new_funnel_id;

  INSERT INTO public.funnel_stages (funnel_id, name, color, position, stage_type)
  VALUES
    (new_funnel_id, 'Novo Lead',       '#3B82F6', 0, 'active'),
    (new_funnel_id, 'Qualificação',    '#06B6D4', 1, 'active'),
    (new_funnel_id, 'Proposta',        '#8B5CF6', 2, 'active'),
    (new_funnel_id, 'Negociação',      '#EAB308', 3, 'active'),
    (new_funnel_id, 'Venda Realizada', '#10B981', 4, 'won'),
    (new_funnel_id, 'Perdido',         '#EF4444', 5, 'lost');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_create_default_funnel ON public.organizations;
CREATE TRIGGER trigger_auto_create_default_funnel
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_default_funnel();

NOTIFY pgrst, 'reload schema';
