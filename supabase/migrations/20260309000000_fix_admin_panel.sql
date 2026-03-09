-- Remove as funções antigas para evitar erro de conflito de nomes de parâmetros
DROP FUNCTION IF EXISTS public.safe_get_user_subscription(text, uuid);
DROP FUNCTION IF EXISTS public.check_admin_password(text, text);

-- Cria safe_get_user_subscription com os parâmetros corretos
CREATE OR REPLACE FUNCTION public.safe_get_user_subscription(
  p_token TEXT,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub RECORD;
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  SELECT s.status, s.plan_id, s.user_id as sub_user_id, s.organization_id
  INTO v_sub
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id
    AND s.status = 'authorized'
  ORDER BY s.created_at DESC
  LIMIT 1;
  
  IF v_sub IS NULL THEN
    SELECT s.status, s.plan_id, s.user_id as sub_user_id, s.organization_id
    INTO v_sub
    FROM public.subscriptions s
    JOIN public.organization_members om ON om.organization_id = s.organization_id
    WHERE om.user_id = p_user_id
      AND s.status = 'authorized'
    ORDER BY s.created_at DESC
    LIMIT 1;
  END IF;
  
  IF v_sub IS NULL THEN
    RETURN jsonb_build_object('status', 'none', 'plan_id', null, 'user_id', p_user_id);
  END IF;
  
  RETURN jsonb_build_object(
    'status', v_sub.status,
    'plan_id', v_sub.plan_id,
    'user_id', v_sub.sub_user_id,
    'organization_id', v_sub.organization_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.safe_get_user_subscription(TEXT, UUID) TO authenticated, anon;

-- Cria check_admin_password para validação na edge function
CREATE OR REPLACE FUNCTION public.check_admin_password(p_email TEXT, p_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_hash TEXT;
BEGIN
  SELECT password_hash INTO v_hash FROM public.admin_credentials WHERE email = lower(p_email);
  IF v_hash IS NULL THEN RETURN false; END IF;
  RETURN v_hash = crypt(p_password, v_hash);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_admin_password(TEXT, TEXT) TO authenticated, anon, service_role;
