-- ============================================================
-- FIX: Remover trigger duplicado de funil padrão e limpar funis
--      duplicados existentes.
--
-- CAUSA RAIZ IDENTIFICADA:
--   Existem DOIS triggers ativos na tabela `organizations` que
--   criam funis padrão ao inserir uma nova organização:
--
--   1. `create_default_funnel_trigger`  →  create_default_funnel_for_organization()
--      (presente desde o schema original)
--
--   2. `trigger_auto_create_default_funnel` → auto_create_default_funnel()
--      (adicionado pelo emergency_recovery em 20260317)
--
--   Ambos disparam a cada INSERT em organizations, gerando 2 funis
--   com is_default = TRUE para cada nova organização.
--
-- CONSEQUÊNCIAS:
--   a) FunnelSelector exibe dois "Funil Padrão" na lista de seleção.
--   b) facebook-leads-webhook usa .maybeSingle() → retorna null
--      quando há 2 rows com is_default = true → lead criado sem
--      funnel_id/funnel_stage_id → não aparece em nenhum funil.
--
-- CORREÇÕES APLICADAS:
--   1. Remover o trigger duplicado (trigger_auto_create_default_funnel).
--   2. Recriar create_default_funnel_for_organization() com guard
--      idempotente (só cria se não existe funil padrão).
--   3. Limpeza: para orgs com 2 funis padrão, manter apenas o mais
--      completo (mais etapas), marcar o outro is_default = false.
--   4. Adicionar índice único parcial para prevenir futuros duplicados.
-- ============================================================

-- ============================================================
-- 1. REMOVER O TRIGGER DUPLICADO
-- ============================================================

DROP TRIGGER IF EXISTS trigger_auto_create_default_funnel ON public.organizations;
-- A função pode continuar existindo, apenas não é mais acionada como trigger.
-- Mantemos a função pois pode ser usada manualmente se necessário.

-- ============================================================
-- 2. RECRIAR create_default_funnel_for_organization() COM GUARD
--    Idempotente: não cria segundo funil se já existe um padrão.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_default_funnel_for_organization()
RETURNS TRIGGER AS $$
DECLARE
  new_funnel_id UUID;
  existing_funnel_count INT;
BEGIN
  -- Guard: só cria se a org ainda não tem nenhum funil padrão
  SELECT COUNT(*) INTO existing_funnel_count
  FROM public.sales_funnels
  WHERE organization_id = NEW.id
    AND is_default = true;

  IF existing_funnel_count > 0 THEN
    RAISE NOTICE '[FUNNEL-TRIGGER] Org % já possui funil padrão, pulando criação.', NEW.id;
    RETURN NEW;
  END IF;

  INSERT INTO public.sales_funnels (
    organization_id, name, description, is_default, is_active, icon
  ) VALUES (
    NEW.id, 'Funil Padrão', 'Funil padrão do sistema', true, true, 'Target'
  ) RETURNING id INTO new_funnel_id;

  INSERT INTO public.funnel_stages (
    funnel_id, name, description, color, icon, position, stage_type, is_final
  ) VALUES
    (new_funnel_id, 'Novo Lead',              'Leads recém-chegados',                '#3B82F6', '📋', 0,   'custom', false),
    (new_funnel_id, 'Qualificação / Aquecido', 'Leads sendo qualificados',            '#06B6D4', '🔥', 1,   'custom', false),
    (new_funnel_id, 'Agendamento Realizado',  'Reunião agendada',                    '#EAB308', '📅', 2,   'custom', false),
    (new_funnel_id, 'Reunião Feita',          'Reunião realizada com o lead',        '#F97316', '🤝', 3,   'custom', false),
    (new_funnel_id, 'Proposta / Negociação',  'Proposta enviada, em negociação',     '#8B5CF6', '📝', 4,   'custom', false),
    (new_funnel_id, 'Aprovação / Análise',    'Aguardando aprovação do cliente',     '#6366F1', '🔍', 5,   'custom', false),
    (new_funnel_id, 'Venda Realizada',        'Negócio fechado com sucesso',         '#10B981', '🎉', 6,   'won',    true),
    (new_funnel_id, 'Pós-venda / Ativação',  'Cliente em processo de ativação',     '#34D399', '✨', 7,   'custom', false),
    (new_funnel_id, 'Perdido',               'Negócio não concretizado',            '#EF4444', '❌', 999, 'lost',   true);

  RAISE NOTICE '[FUNNEL-TRIGGER] Funil padrão criado para org %, funnel_id=%', NEW.id, new_funnel_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- ============================================================
-- 3. LIMPEZA: DESATIVAR is_default NOS FUNIS EXCEDENTES
--    Para cada org com 2+ funis padrão:
--      - Manter o funil com MAIS etapas (mais completo) como padrão
--      - Marcar os demais is_default = false
-- ============================================================

DO $$
DECLARE
  org_rec    RECORD;
  keep_id    UUID;
  dup_count  INT;
BEGIN
  -- Iterar sobre orgs com mais de 1 funil padrão
  FOR org_rec IN
    SELECT organization_id, COUNT(*) AS cnt
    FROM public.sales_funnels
    WHERE is_default = true
    GROUP BY organization_id
    HAVING COUNT(*) > 1
  LOOP
    dup_count := org_rec.cnt;

    -- Escolher o funil com mais etapas para manter como padrão
    SELECT sf.id INTO keep_id
    FROM public.sales_funnels sf
    LEFT JOIN (
      SELECT funnel_id, COUNT(*) AS stage_count
      FROM public.funnel_stages
      GROUP BY funnel_id
    ) sc ON sc.funnel_id = sf.id
    WHERE sf.organization_id = org_rec.organization_id
      AND sf.is_default = true
    ORDER BY COALESCE(sc.stage_count, 0) DESC, sf.created_at ASC
    LIMIT 1;

    -- Marcar os outros como não-padrão
    UPDATE public.sales_funnels
    SET is_default = false,
        name = CASE WHEN name = 'Funil Padrão' THEN 'Funil Padrão (legado)' ELSE name END,
        updated_at = now()
    WHERE organization_id = org_rec.organization_id
      AND is_default = true
      AND id != keep_id;

    RAISE NOTICE '[CLEANUP] Org %: % funis padrão → mantido %, demais marcados is_default=false',
      org_rec.organization_id, dup_count, keep_id;
  END LOOP;
END $$;

-- ============================================================
-- 4. ÍNDICE ÚNICO PARCIAL: previne futuros duplicados de funil padrão
-- ============================================================

DROP INDEX IF EXISTS idx_one_default_funnel_per_org;
CREATE UNIQUE INDEX idx_one_default_funnel_per_org
  ON public.sales_funnels (organization_id)
  WHERE is_default = true;

-- ============================================================
-- 5. TAMBÉM RECRIAR auto_create_default_funnel com guard
--    (para não quebrar código que a chama diretamente)
-- ============================================================

CREATE OR REPLACE FUNCTION public.auto_create_default_funnel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_funnel_id UUID;
  existing_count INT;
BEGIN
  -- Guard idempotente
  SELECT COUNT(*) INTO existing_count
  FROM public.sales_funnels
  WHERE organization_id = NEW.id AND is_default = true;

  IF existing_count > 0 THEN
    RAISE NOTICE '[AUTO-FUNNEL] Funil padrão já existe para org %, pulando.', NEW.id;
    RETURN NEW;
  END IF;

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

-- ============================================================
-- 6. GARANTIR ensure_user_organization CRIA FUNIL SE ORG SEM FUNIL
--    (proteção extra: se a org foi criada antes do trigger existir)
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_user_organization()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid         UUID;
  v_oid         UUID;
  v_mail        TEXT;
  v_name        TEXT;
  v_funnel_id   UUID;
  v_funnel_cnt  INT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No authenticated user');
  END IF;

  -- Verificar se já tem organização (preferir owner)
  SELECT organization_id INTO v_oid
  FROM public.organization_members
  WHERE user_id = v_uid AND role = 'owner'
  ORDER BY organization_id
  LIMIT 1;

  IF v_oid IS NULL THEN
    SELECT organization_id INTO v_oid
    FROM public.organization_members
    WHERE user_id = v_uid
    ORDER BY organization_id
    LIMIT 1;
  END IF;

  -- Só cria org se realmente não tem nenhuma
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
    -- NOTA: o trigger create_default_funnel_trigger dispara aqui
    --       e cria o funil padrão automaticamente.

    INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
    VALUES (v_oid, v_uid, 'owner', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Garantir que a org tem pelo menos 1 funil padrão (proteção extra)
  SELECT COUNT(*) INTO v_funnel_cnt
  FROM public.sales_funnels
  WHERE organization_id = v_oid AND is_default = true;

  IF v_funnel_cnt = 0 THEN
    RAISE NOTICE '[ENSURE-ORG] Org % sem funil padrão, criando...', v_oid;

    INSERT INTO public.sales_funnels (organization_id, name, description, is_default, is_active, icon)
    VALUES (v_oid, 'Funil Padrão', 'Funil de vendas principal', true, true, 'Target')
    RETURNING id INTO v_funnel_id;

    INSERT INTO public.funnel_stages (funnel_id, name, description, color, icon, position, stage_type, is_final)
    VALUES
      (v_funnel_id, 'Novo Lead',              'Leads recém-chegados',            '#3B82F6', '📋', 0,   'custom', false),
      (v_funnel_id, 'Qualificação / Aquecido', 'Leads sendo qualificados',        '#06B6D4', '🔥', 1,   'custom', false),
      (v_funnel_id, 'Agendamento Realizado',  'Reunião agendada',                '#EAB308', '📅', 2,   'custom', false),
      (v_funnel_id, 'Reunião Feita',          'Reunião realizada',               '#F97316', '🤝', 3,   'custom', false),
      (v_funnel_id, 'Proposta / Negociação',  'Proposta enviada',                '#8B5CF6', '📝', 4,   'custom', false),
      (v_funnel_id, 'Aprovação / Análise',    'Aguardando aprovação',            '#6366F1', '🔍', 5,   'custom', false),
      (v_funnel_id, 'Venda Realizada',        'Negócio fechado',                 '#10B981', '🎉', 6,   'won',    true),
      (v_funnel_id, 'Pós-venda / Ativação',  'Em processo de ativação',         '#34D399', '✨', 7,   'custom', false),
      (v_funnel_id, 'Perdido',               'Negócio não concretizado',        '#EF4444', '❌', 999, 'lost',   true);
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
-- 7. VERIFICAÇÃO FINAL
-- ============================================================

DO $$
DECLARE
  dup_count INT;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT organization_id
    FROM public.sales_funnels
    WHERE is_default = true
    GROUP BY organization_id
    HAVING COUNT(*) > 1
  ) sub;

  IF dup_count > 0 THEN
    RAISE WARNING '[VERIFY] Ainda existem % orgs com funis padrão duplicados!', dup_count;
  ELSE
    RAISE NOTICE '[VERIFY] ✅ Nenhuma org com funis padrão duplicados. Correção aplicada com sucesso.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
