CREATE OR REPLACE FUNCTION public.safe_get_user_subscription(
  p_token TEXT, user_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_sub RECORD;
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT s.status, s.plan_id, s.user_id AS uid, s.organization_id INTO v_sub
  FROM public.subscriptions s WHERE s.user_id = safe_get_user_subscription.user_id AND s.status = 'authorized'
  ORDER BY s.created_at DESC LIMIT 1;
  IF v_sub IS NULL THEN
    SELECT s.status, s.plan_id, s.user_id AS uid, s.organization_id INTO v_sub
    FROM public.subscriptions s JOIN public.organization_members om ON om.organization_id = s.organization_id
    WHERE om.user_id = safe_get_user_subscription.user_id AND s.status = 'authorized'
    ORDER BY s.created_at DESC LIMIT 1;
  END IF;
  IF v_sub IS NULL THEN RETURN jsonb_build_object('status','none','plan_id',NULL,'user_id',user_id); END IF;
  RETURN jsonb_build_object('status',v_sub.status,'plan_id',v_sub.plan_id,'user_id',v_sub.uid,'organization_id',v_sub.organization_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.safe_get_user_subscription(TEXT,UUID) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.safe_manage_user_subscription(
  p_token TEXT, p_user_id UUID, p_plan_id TEXT, p_organization_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org_id UUID;
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN RETURN jsonb_build_object('status','error','message','Unauthorized'); END IF;
  v_org_id := p_organization_id;
  IF v_org_id IS NULL THEN SELECT organization_id INTO v_org_id FROM public.organization_members WHERE user_id = p_user_id LIMIT 1; END IF;
  IF p_plan_id = 'none' OR p_plan_id IS NULL THEN
    DELETE FROM public.subscriptions WHERE user_id = p_user_id;
    RETURN jsonb_build_object('status','success','message','Plano removido');
  ELSE
    DELETE FROM public.subscriptions WHERE user_id = p_user_id;
    INSERT INTO public.subscriptions (user_id,plan_id,status,amount,organization_id,start_date,updated_at)
    VALUES (p_user_id,p_plan_id,'authorized',0,v_org_id,now(),now());
    RETURN jsonb_build_object('status','success','message','Plano atualizado para: ' || p_plan_id);
  END IF;
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status','error','message',SQLERRM);
END; $$;
GRANT EXECUTE ON FUNCTION public.safe_manage_user_subscription(TEXT,UUID,TEXT,UUID) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_email(p_email TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_auth_user_id_by_email(TEXT) TO service_role, authenticated;

CREATE OR REPLACE FUNCTION public.check_admin_password(p_email TEXT, p_password TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_hash TEXT;
BEGIN
  SELECT password_hash INTO v_hash FROM public.admin_credentials WHERE email = lower(p_email);
  IF v_hash IS NULL THEN RETURN false; END IF;
  RETURN v_hash = crypt(p_password, v_hash);
END; $$;
GRANT EXECUTE ON FUNCTION public.check_admin_password(TEXT,TEXT) TO authenticated, anon, service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='admin_sessions' AND column_name='admin_email')
  THEN ALTER TABLE public.admin_sessions ADD COLUMN admin_email TEXT; END IF;
END $$;

NOTIFY pgrst, 'reload schema';
