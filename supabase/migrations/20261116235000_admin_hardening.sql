-- Segurança do painel de admin (pré-requisito da Fase 6 do roteiro de consórcio).
--
-- 1. Tabelas de admin e sobras de recuperação: RLS ligado e nenhum acesso pela API.
--    funnel_stage_history: só funções do servidor leem e gravam.
-- 2. organizations e organization_members: ninguém de fora lê; usuários logados continuam lendo,
--    mas não gravam direto (o app grava por Edge Functions e funções do servidor).
--    funnel_stages: fecha para anon; a reescrita das políticas fica para depois.
-- 3. Funções de admin que não conferem quem chama: só a service role executa
--    (o painel já passa pela Edge Function admin-panel-rpc).
-- 4. has_role passa a ler só user_roles (antes aceitava um e-mail fixo e a tabela super_admins_list,
--    que estava aberta para escrita).
-- 5. Super admins do CRM: Mateus (já era) e Marcos.
-- 6. Login do painel: só pela Edge Function admin-login, que exige estar logado no CRM como super
--    admin com o mesmo e-mail, e limita tentativas por e-mail e por IP.

SET LOCAL lock_timeout = '5s';

-- ------------------------------------------------------------
-- 1. Tabelas fechadas
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'admin_credentials', 'admin_sessions', 'super_admins_list', 'funnel_stage_history',
    'recovery_cclions_assign_467_to_carla_20260723', 'recovery_cclions_manual_redistribution_20260723',
    'recovery_cclions_redistribute_new_lead_20260723', 'recovery_william_lost_redistribution_20260610'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 2. Organizações
-- ------------------------------------------------------------
REVOKE ALL ON public.organizations, public.organization_members, public.funnel_stages FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.organizations, public.organization_members FROM authenticated;

-- ------------------------------------------------------------
-- 3. Funções de admin só para a service role
-- ------------------------------------------------------------
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.admin_check_facebook_integration_status()',
    'public.admin_count_main_users()',
    'public.admin_get_all_subscriptions_fn()',
    'public.admin_get_org_members_fn(uuid)',
    'public.admin_get_user_details_fn(uuid)',
    'public.admin_get_user_sub_fn(uuid)',
    'public.admin_get_user_subscription(uuid)',
    'public.admin_list_all_users()',
    'public.admin_list_owners_fn()',
    'public.admin_manage_user_sub_fn(uuid, text, uuid)',
    'public.admin_toggle_user_active(uuid, boolean)',
    'public.admin_login_system(text, text)',
    'public.check_admin_password(text, text)',
    'public.admin_verify_password(text, text)',
    'public.get_auth_user_id_by_email(text)',
    'public.upsert_admin_credential(text, text)'
  ] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END IF;
  END LOOP;

  -- Estas conferem super admin por dentro: continuam para usuários logados, não para anon.
  FOREACH f IN ARRAY ARRAY[
    'public.admin_manage_user_subscription(jsonb)',
    'public.admin_update_subscription(uuid, text, uuid, numeric)',
    'public.has_role(uuid, text)'
  ] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 4. has_role lê só user_roles
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = _role
  );
$$;

-- ------------------------------------------------------------
-- 5. Super admins do CRM
-- ------------------------------------------------------------
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'super_admin'
FROM auth.users u
WHERE lower(u.email) = 'marcosviniicius.fs@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.role::text = 'super_admin');

-- ------------------------------------------------------------
-- 6. Login do painel com limite de tentativas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_login_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL,
  ip text,
  user_id uuid,
  success boolean NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_login_attempts_email_idx ON public.admin_login_attempts (email, attempted_at DESC);
CREATE INDEX IF NOT EXISTS admin_login_attempts_ip_idx ON public.admin_login_attempts (ip, attempted_at DESC);
ALTER TABLE public.admin_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_login_attempts FROM anon, authenticated;

-- Chamada só pela Edge Function admin-login (service role), que já conferiu o JWT do usuário.
CREATE OR REPLACE FUNCTION public.admin_login_secure(p_user_id uuid, p_email text, p_password text, p_ip text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user_email text;
  v_failed_email integer;
  v_failed_ip integer;
  v_result jsonb;
BEGIN
  SELECT count(*) INTO v_failed_email FROM public.admin_login_attempts
  WHERE email = v_email AND NOT success AND attempted_at > now() - interval '15 minutes';
  SELECT count(*) INTO v_failed_ip FROM public.admin_login_attempts
  WHERE ip = p_ip AND NOT success AND attempted_at > now() - interval '15 minutes';
  IF v_failed_email >= 5 OR v_failed_ip >= 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Muitas tentativas. Espere 15 minutos e tente de novo.');
  END IF;

  SELECT lower(email) INTO v_user_email FROM auth.users WHERE id = p_user_id;
  IF NOT public.has_role(p_user_id, 'super_admin') OR v_user_email IS DISTINCT FROM v_email THEN
    INSERT INTO public.admin_login_attempts (email, ip, user_id, success) VALUES (v_email, p_ip, p_user_id, false);
    RETURN jsonb_build_object('success', false, 'error', 'Entre no CRM com a mesma conta de super admin do painel.');
  END IF;

  v_result := public.admin_login_system(v_email, p_password);
  INSERT INTO public.admin_login_attempts (email, ip, user_id, success)
  VALUES (v_email, p_ip, p_user_id, coalesce((v_result ->> 'success')::boolean, false) AND v_result ? 'token');
  IF NOT (v_result ? 'token') THEN
    RETURN jsonb_build_object('success', false, 'error', 'E-mail ou senha do painel incorretos.');
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_login_secure(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_login_secure(uuid, text, text, text) TO service_role;
