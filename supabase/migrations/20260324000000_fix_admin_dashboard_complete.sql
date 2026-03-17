-- =============================================================================
-- FIX ADMIN DASHBOARD COMPLETE
-- Corrige todos os erros do painel admin:
-- 1. Cria funções safe_* ausentes chamadas diretamente pelo AdminDashboard
-- 2. Cria funções auxiliares para admin-panel-rpc (sem verificação de super_admin
--    pois a edge function já valida o token via validate_admin_token + service_role)
-- 3. Garante que user_section_access existe
-- 4. Garante que upsert_admin_credential e admin_logout_system existem
-- =============================================================================

-- 1. Garantir extensão pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Garantir tabelas necessárias
CREATE TABLE IF NOT EXISTS public.admin_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_section_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, section_key)
);

ALTER TABLE public.user_section_access ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can read own section access" ON public.user_section_access;
  CREATE POLICY "Users can read own section access"
    ON public.user_section_access FOR SELECT TO authenticated
    USING (user_id = auth.uid());
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 3. Funções de autenticação admin (garantir que existem)

CREATE OR REPLACE FUNCTION public.validate_admin_token(p_token TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_sessions
    WHERE token = p_token AND expires_at > NOW()
  );
END $$;

CREATE OR REPLACE FUNCTION public.admin_login_system(p_email TEXT, p_password TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hash TEXT;
  v_token TEXT;
BEGIN
  SELECT password_hash INTO v_hash
  FROM public.admin_credentials
  WHERE email = lower(trim(p_email));

  IF NOT FOUND OR v_hash != crypt(p_password, v_hash) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email ou senha invalidos');
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.admin_sessions (admin_email, token, expires_at)
  VALUES (lower(trim(p_email)), v_token, NOW() + INTERVAL '8 hours');

  RETURN jsonb_build_object('success', true, 'token', v_token, 'email', lower(trim(p_email)));
END $$;

CREATE OR REPLACE FUNCTION public.admin_logout_system(p_token TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.admin_sessions WHERE token = p_token;
END $$;

CREATE OR REPLACE FUNCTION public.check_admin_password(p_email TEXT, p_password TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hash TEXT;
BEGIN
  SELECT password_hash INTO v_hash FROM public.admin_credentials WHERE email = lower(p_email);
  IF v_hash IS NULL THEN RETURN false; END IF;
  RETURN v_hash = crypt(p_password, v_hash);
END $$;

-- 4. upsert_admin_credential (criar/atualizar admin)
CREATE OR REPLACE FUNCTION public.upsert_admin_credential(p_email TEXT, p_password TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hash TEXT;
BEGIN
  IF length(trim(p_password)) < 8 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Senha deve ter pelo menos 8 caracteres');
  END IF;

  v_hash := crypt(p_password, gen_salt('bf', 10));

  INSERT INTO public.admin_credentials (email, password_hash)
  VALUES (lower(trim(p_email)), v_hash)
  ON CONFLICT (email) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        updated_at = NOW();

  RETURN jsonb_build_object('success', true);
END $$;

-- 5. safe_list_admins
CREATE OR REPLACE FUNCTION public.safe_list_admins(p_token TEXT)
RETURNS TABLE(email TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN
    RAISE EXCEPTION 'Acesso negado: token admin invalido ou expirado';
  END IF;
  RETURN QUERY SELECT ac.email::TEXT, ac.created_at FROM public.admin_credentials ac ORDER BY ac.created_at DESC;
END $$;

-- 6. safe_delete_admin
CREATE OR REPLACE FUNCTION public.safe_delete_admin(p_token TEXT, p_target_email TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller_email TEXT;
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT admin_email INTO v_caller_email FROM public.admin_sessions WHERE token = p_token;

  IF lower(trim(p_target_email)) = v_caller_email THEN
    RETURN jsonb_build_object('success', false, 'error', 'Voce nao pode remover a si mesmo');
  END IF;

  DELETE FROM public.admin_credentials WHERE email = lower(trim(p_target_email));
  RETURN jsonb_build_object('success', true);
END $$;

-- 7. safe_count_main_users
CREATE OR REPLACE FUNCTION public.safe_count_main_users(p_token TEXT)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN (SELECT count(*) FROM auth.users);
END $$;

-- 8. safe_list_all_users
CREATE OR REPLACE FUNCTION public.safe_list_all_users(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_res JSONB;
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'created_at', u.created_at,
      'last_sign_in_at', u.last_sign_in_at,
      'email_confirmed_at', u.email_confirmed_at
    ) ORDER BY u.created_at DESC
  ) INTO v_res FROM auth.users u;
  RETURN COALESCE(v_res, '[]'::jsonb);
END $$;

-- 9. safe_get_all_subscriptions
CREATE OR REPLACE FUNCTION public.safe_get_all_subscriptions(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_res JSONB;
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT jsonb_agg(
    jsonb_build_object(
      'user_id', s.user_id,
      'plan_id', s.plan_id,
      'status', s.status,
      'organization_id', s.organization_id
    )
  ) INTO v_res FROM public.subscriptions s WHERE s.status = 'authorized';
  RETURN COALESCE(v_res, '[]'::jsonb);
END $$;

-- 10. safe_count_paying_users
CREATE OR REPLACE FUNCTION public.safe_count_paying_users(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN jsonb_build_object(
    'count',
    (SELECT count(*) FROM public.subscriptions WHERE status = 'authorized')
  );
END $$;

-- 11. safe_calculate_mrr
CREATE OR REPLACE FUNCTION public.safe_calculate_mrr(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mrr DECIMAL := 0;
  v_plan_data JSONB;
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_mrr
  FROM public.subscriptions WHERE status = 'authorized';

  SELECT jsonb_agg(
    jsonb_build_object('name', plan_id, 'count', cnt, 'color', '#3b82f6')
  ) INTO v_plan_data
  FROM (
    SELECT plan_id, count(*) AS cnt
    FROM public.subscriptions WHERE status = 'authorized'
    GROUP BY plan_id
  ) t;

  RETURN jsonb_build_object(
    'mrr', v_mrr,
    'planChartData', COALESCE(v_plan_data, '[]'::jsonb)
  );
END $$;

-- 12. safe_calculate_daily_revenue
CREATE OR REPLACE FUNCTION public.safe_calculate_daily_revenue(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN jsonb_build_object(
    'dailyRevenue',
    (SELECT COALESCE(SUM(amount), 0) FROM public.subscriptions
     WHERE status = 'authorized' AND created_at > now() - interval '7 days')
  );
END $$;

-- 13. safe_subscription_growth
CREATE OR REPLACE FUNCTION public.safe_subscription_growth(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_chart JSONB;
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT jsonb_agg(
    jsonb_build_object('date', month_label, 'count', cnt)
    ORDER BY month_label
  ) INTO v_chart
  FROM (
    SELECT
      to_char(date_trunc('month', created_at), 'Mon/YY') AS month_label,
      count(*) AS cnt
    FROM auth.users
    WHERE created_at > now() - interval '12 months'
    GROUP BY date_trunc('month', created_at)
  ) t;
  RETURN jsonb_build_object('chartData', COALESCE(v_chart, '[]'::jsonb));
END $$;

-- =============================================================================
-- 14. Funções para admin-panel-rpc edge function (sem verificação de super_admin
--     pois são chamadas via service_role KEY após validação do token na edge fn)
-- =============================================================================

-- admin_list_all_users (chamada pela edge function)
CREATE OR REPLACE FUNCTION public.admin_list_all_users()
RETURNS TABLE (
  id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT id, email, created_at, last_sign_in_at, email_confirmed_at
  FROM auth.users
  ORDER BY created_at DESC;
$$;

-- admin_count_main_users (chamada pela edge function)
CREATE OR REPLACE FUNCTION public.admin_count_main_users()
RETURNS BIGINT LANGUAGE sql SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT count(*) FROM auth.users;
$$;

-- admin_get_all_subscriptions_fn (chamada pela edge function)
CREATE OR REPLACE FUNCTION public.admin_get_all_subscriptions_fn()
RETURNS TABLE (user_id uuid, organization_id uuid, plan_id text, status text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id, organization_id, plan_id, status
  FROM public.subscriptions
  WHERE status = 'authorized';
$$;

-- admin_get_user_details_fn (chamada pela edge function)
CREATE OR REPLACE FUNCTION public.admin_get_user_details_fn(_target_user_id UUID)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  email_confirmed_at TIMESTAMPTZ,
  full_name TEXT,
  avatar_url TEXT,
  job_title TEXT,
  organization_id UUID,
  organization_name TEXT,
  user_role TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email::TEXT,
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at,
    p.full_name,
    p.avatar_url,
    p.job_title,
    om.organization_id,
    o.name AS organization_name,
    om.role::TEXT AS user_role
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  LEFT JOIN public.organization_members om ON om.user_id = u.id
  LEFT JOIN public.organizations o ON o.id = om.organization_id
  WHERE u.id = _target_user_id
  LIMIT 1;
END $$;

-- admin_get_org_members_fn (chamada pela edge function)
CREATE OR REPLACE FUNCTION public.admin_get_org_members_fn(_organization_id UUID)
RETURNS TABLE (
  member_id UUID,
  user_id UUID,
  email TEXT,
  role TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  RETURN QUERY
  SELECT
    om.id AS member_id,
    om.user_id,
    COALESCE(u.email::TEXT, om.email) AS email,
    om.role::TEXT,
    p.full_name,
    p.avatar_url,
    u.created_at,
    u.last_sign_in_at
  FROM public.organization_members om
  LEFT JOIN auth.users u ON u.id = om.user_id
  LEFT JOIN public.profiles p ON p.user_id = om.user_id
  WHERE om.organization_id = _organization_id
  ORDER BY om.created_at ASC;
END $$;

-- admin_get_user_sub_fn (chamada pela edge function)
CREATE OR REPLACE FUNCTION public.admin_get_user_sub_fn(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sub RECORD;
BEGIN
  -- Tentar encontrar assinatura direta
  SELECT plan_id, status INTO v_sub
  FROM public.subscriptions
  WHERE user_id = p_user_id AND status = 'authorized'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    -- Tentar via organização
    SELECT s.plan_id, s.status INTO v_sub
    FROM public.subscriptions s
    JOIN public.organization_members om ON om.organization_id = s.organization_id
    WHERE om.user_id = p_user_id AND s.status = 'authorized'
    ORDER BY s.created_at DESC
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'none', 'plan_id', NULL);
  END IF;

  RETURN jsonb_build_object('status', v_sub.status, 'plan_id', v_sub.plan_id);
END $$;

-- admin_manage_user_sub_fn (chamada pela edge function)
CREATE OR REPLACE FUNCTION public.admin_manage_user_sub_fn(
  p_user_id UUID,
  p_plan_id TEXT,
  p_organization_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org_id UUID;
BEGIN
  v_org_id := p_organization_id;
  IF v_org_id IS NULL THEN
    SELECT organization_id INTO v_org_id
    FROM public.organization_members
    WHERE user_id = p_user_id
    LIMIT 1;
  END IF;

  IF p_plan_id = 'none' OR p_plan_id IS NULL THEN
    DELETE FROM public.subscriptions WHERE user_id = p_user_id;
    RETURN jsonb_build_object('status', 'success', 'message', 'Plano removido');
  ELSE
    DELETE FROM public.subscriptions WHERE user_id = p_user_id;
    INSERT INTO public.subscriptions (user_id, plan_id, status, amount, organization_id, start_date, updated_at)
    VALUES (p_user_id, p_plan_id, 'authorized', 0, v_org_id, now(), now());
    RETURN jsonb_build_object('status', 'success', 'message', 'Plano atualizado: ' || p_plan_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END $$;

-- =============================================================================
-- 15. PERMISSÕES
-- =============================================================================
GRANT EXECUTE ON FUNCTION public.validate_admin_token(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_login_system(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_logout_system(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_admin_password(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_admin_credential(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.safe_list_admins(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.safe_delete_admin(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.safe_count_main_users(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.safe_list_all_users(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.safe_get_all_subscriptions(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.safe_count_paying_users(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.safe_calculate_mrr(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.safe_calculate_daily_revenue(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.safe_subscription_growth(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_all_users() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_count_main_users() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_all_subscriptions_fn() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_user_details_fn(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_org_members_fn(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_user_sub_fn(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_manage_user_sub_fn(UUID, TEXT, UUID) TO service_role;

-- 16. Bootstrap admin padrão
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_credentials WHERE email = 'mateusabcck@gmail.com') THEN
    INSERT INTO public.admin_credentials (email, password_hash)
    VALUES ('mateusabcck@gmail.com', crypt('britO151515@', gen_salt('bf', 10)));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
