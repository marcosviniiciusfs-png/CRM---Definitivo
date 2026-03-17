-- =============================================================================
-- ADD admin_verify_password RPC
-- Usada pela edge function admin-delete-user para confirmar a senha
-- do administrador antes de executar ações destrutivas.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_verify_password(p_email TEXT, p_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  SELECT password_hash INTO v_hash
  FROM public.admin_credentials
  WHERE email = lower(trim(p_email));

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  RETURN v_hash = extensions.crypt(p_password, v_hash);
END $$;

GRANT EXECUTE ON FUNCTION public.admin_verify_password(TEXT, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
