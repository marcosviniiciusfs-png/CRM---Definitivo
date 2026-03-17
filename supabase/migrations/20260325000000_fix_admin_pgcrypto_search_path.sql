-- =============================================================================
-- FIX ADMIN PGCRYPTO SEARCH PATH
-- No Supabase, pgcrypto fica no schema "extensions".
-- As funções admin precisam do search_path incluindo "extensions" para
-- chamar crypt() e gen_salt() sem qualificação de schema.
-- =============================================================================

-- Garantir extensão pgcrypto no schema extensions (padrão Supabase)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Recriar admin_login_system com search_path correto
CREATE OR REPLACE FUNCTION public.admin_login_system(p_email TEXT, p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash TEXT;
  v_token TEXT;
BEGIN
  SELECT password_hash INTO v_hash
  FROM public.admin_credentials
  WHERE email = lower(trim(p_email));

  IF NOT FOUND OR v_hash != extensions.crypt(p_password, v_hash) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email ou senha invalidos');
  END IF;

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.admin_sessions (admin_email, token, expires_at)
  VALUES (lower(trim(p_email)), v_token, NOW() + INTERVAL '8 hours');

  RETURN jsonb_build_object('success', true, 'token', v_token, 'email', lower(trim(p_email)));
END $$;

-- Recriar upsert_admin_credential com search_path correto
CREATE OR REPLACE FUNCTION public.upsert_admin_credential(
  p_token TEXT,
  p_email TEXT,
  p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  -- Validar token admin
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_sessions
    WHERE token = p_token AND expires_at > NOW()
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token invalido ou expirado');
  END IF;

  IF length(trim(p_email)) < 5 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email invalido');
  END IF;

  IF length(trim(p_password)) < 8 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Senha deve ter pelo menos 8 caracteres');
  END IF;

  v_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));

  INSERT INTO public.admin_credentials (email, password_hash)
  VALUES (lower(trim(p_email)), v_hash)
  ON CONFLICT (email) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        updated_at = NOW();

  RETURN jsonb_build_object('success', true);
END $$;

-- Atualizar hash da senha do admin padrão com crypt do schema extensions
DO $$
DECLARE
  v_new_hash TEXT;
BEGIN
  v_new_hash := extensions.crypt('britO151515@', extensions.gen_salt('bf', 10));

  -- Atualizar ou inserir credencial admin padrão
  INSERT INTO public.admin_credentials (email, password_hash)
  VALUES ('mateusabcck@gmail.com', v_new_hash)
  ON CONFLICT (email) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        updated_at = NOW();
END $$;

-- Limpar sessões expiradas (limpeza)
DELETE FROM public.admin_sessions WHERE expires_at < NOW();

NOTIFY pgrst, 'reload schema';
