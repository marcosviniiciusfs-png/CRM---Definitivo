-- ============================================================
-- ADMIN LOGIN SYSTEM: SQL-Only (No Edge Functions required)
-- ============================================================

-- 1. Ensure pgcrypto is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Tabela de credenciais admin (senha bcrypt)
CREATE TABLE IF NOT EXISTS public.admin_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Tabela de sessões admin (tokens arbitrários)
CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Função para criar/atualizar credencial admin
CREATE OR REPLACE FUNCTION public.upsert_admin_credential(
  p_email TEXT,
  p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT;
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
END;
$$;

-- 5. Função de Login Admin (Gera Token)
CREATE OR REPLACE FUNCTION public.admin_login_system(
  p_email TEXT,
  p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Gerar um token aleatório seguro
  v_token := encode(gen_random_bytes(32), 'hex');

  -- Registrar sessão (válida por 8 horas)
  INSERT INTO public.admin_sessions (admin_email, token, expires_at)
  VALUES (lower(trim(p_email)), v_token, NOW() + INTERVAL '8 hours');

  RETURN jsonb_build_object('success', true, 'token', v_token, 'email', lower(trim(p_email)));
END;
$$;

-- 6. Função para validar token admin
CREATE OR REPLACE FUNCTION public.validate_admin_token(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_sessions
    WHERE token = p_token AND expires_at > NOW()
  );
END;
$$;

-- 7. Função de Logout Admin
CREATE OR REPLACE FUNCTION public.admin_logout_system(p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.admin_sessions WHERE token = p_token;
END;
$$;

-- 8. Versões "SEGURAS" das funções administrativas que verificam o token
-- Cada função de admin agora deve ter um prefixo ou parâmetro de token.

-- Listar Admins
CREATE OR REPLACE FUNCTION public.safe_list_admins(p_token TEXT)
RETURNS TABLE(email TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN
    RAISE EXCEPTION 'Acesso negado: token admin invalido ou expirado';
  END IF;

  RETURN QUERY SELECT ac.email, ac.created_at FROM public.admin_credentials ac;
END;
$$;

-- Deletar Admin
CREATE OR REPLACE FUNCTION public.safe_delete_admin(p_token TEXT, p_target_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_email TEXT;
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
END;
$$;

-- Proxy para count_main_users
CREATE OR REPLACE FUNCTION public.safe_count_main_users(p_token TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN public.count_main_users();
END;
$$;

-- Proxy para list_all_users
CREATE OR REPLACE FUNCTION public.safe_list_all_users(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_users JSONB;
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  -- Chamada rpc existente que retorna usuários
  SELECT jsonb_agg(u) INTO v_users FROM public.list_all_users() u;
  RETURN v_users;
END;
$$;

-- Proxy para admin_get_all_subscriptions
CREATE OR REPLACE FUNCTION public.safe_get_all_subscriptions(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subs JSONB;
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  SELECT jsonb_agg(s) INTO v_subs FROM public.admin_get_all_subscriptions() s;
  RETURN v_subs;
END;
$$;

-- Proxy para get_user_details
CREATE OR REPLACE FUNCTION public.safe_get_user_details(p_token TEXT, user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_res JSONB;
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  SELECT jsonb_agg(u) INTO v_res FROM public.get_user_details(user_id) u;
  RETURN v_res;
END;
$$;

-- Proxy para get_organization_members
CREATE OR REPLACE FUNCTION public.safe_get_organization_members(p_token TEXT, organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_res JSONB;
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  SELECT jsonb_agg(m) INTO v_res FROM public.get_organization_members(organization_id) m;
  RETURN v_res;
END;
$$;

-- Proxy para get_section_access
CREATE OR REPLACE FUNCTION public.safe_get_section_access(p_token TEXT, user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_res JSONB;
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  SELECT jsonb_agg(r) INTO v_res 
  FROM public.user_section_access r 
  WHERE r.user_id = safe_get_section_access.user_id;
  
  RETURN v_res;
END;
$$;

-- Proxy para upsert_section_access
CREATE OR REPLACE FUNCTION public.safe_upsert_section_access(p_token TEXT, rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  
  INSERT INTO public.user_section_access (user_id, section_key, is_enabled, updated_at)
  SELECT 
    (val->>'user_id')::UUID,
    (val->>'section_key'),
    (val->>'is_enabled')::BOOLEAN,
    (val->>'updated_at')::TIMESTAMPTZ
  FROM jsonb_array_elements(rows) AS val
  ON CONFLICT (user_id, section_key) DO UPDATE
  SET is_enabled = EXCLUDED.is_enabled,
      updated_at = EXCLUDED.updated_at;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Proxy para admin_manage_user_subscription
CREATE OR REPLACE FUNCTION public.safe_manage_user_subscription(
  p_token TEXT,
  p_user_id UUID,
  p_plan_id TEXT,
  p_organization_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Unauthorized');
  END IF;
  
  RETURN public.admin_manage_user_subscription(
    jsonb_build_object(
      'p_user_id', p_user_id,
      'p_plan_id', p_plan_id,
      'p_organization_id', p_organization_id
    )
  );
END;
$$;

-- bootstrap
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_credentials WHERE email = 'mateusabcck@gmail.com') THEN
    INSERT INTO public.admin_credentials (email, password_hash)
    VALUES ('mateusabcck@gmail.com', crypt('Kairoz@2026', gen_salt('bf', 10)));
  END IF;
END $$;
