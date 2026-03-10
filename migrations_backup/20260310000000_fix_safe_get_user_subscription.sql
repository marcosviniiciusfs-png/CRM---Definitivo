-- Cria o wrapper safe_ que estava faltando para buscar
-- a assinatura de um usuário específico no painel admin.
CREATE OR REPLACE FUNCTION public.safe_get_user_subscription(
  p_token TEXT,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN public.admin_get_user_subscription(p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.safe_get_user_subscription(TEXT, UUID)
  TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
