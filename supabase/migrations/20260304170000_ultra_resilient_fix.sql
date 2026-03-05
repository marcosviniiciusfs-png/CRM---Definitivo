
-- ============================================================
-- SCRIPT DE CORREÇÃO FINAL E DEFINITIVO (BLOCOS SEGUROS)
-- ============================================================

-- BLOCK 1: SCHEMA FIX
ALTER TABLE public.organization_members ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.organization_members ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- BLOCK 2: RESILIENT TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $body$
DECLARE
  v_oid UUID;
BEGIN
  -- Evitar duplicados
  IF EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Criar nova organização
  INSERT INTO public.organizations (name)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)) || ' Organization')
  RETURNING id INTO v_oid;

  -- Adicionar como dono
  INSERT INTO public.organization_members (organization_id, user_id, email, role, is_active)
  VALUES (v_oid, NEW.id, NEW.email, 'owner', true);

  -- Assinatura free automática
  INSERT INTO public.subscriptions (user_id, organization_id, plan_id, status, amount, start_date)
  VALUES (NEW.id, v_oid, 'enterprise_free', 'authorized', 0, now())
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Seguranca: nunca bloquear o auth.users
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- BLOCO 3: RE-APPLY TRIGGER
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- BLOCO 4: RPC DE SEGURANÇA PARA O FRONTEND
CREATE OR REPLACE FUNCTION public.ensure_user_organization()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $body$
DECLARE
    v_uid UUID;
    v_mail TEXT;
    v_oid UUID;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Logue novamente'); END IF;

    -- Tentar encontrar
    SELECT organization_id INTO v_oid FROM public.organization_members WHERE user_id = v_uid LIMIT 1;

    IF v_oid IS NOT NULL THEN
        -- Garantir assinatura
        INSERT INTO public.subscriptions (user_id, organization_id, plan_id, status, amount, start_date)
        VALUES (v_uid, v_oid, 'enterprise_free', 'authorized', 0, now())
        ON CONFLICT (user_id) DO NOTHING;
        RETURN jsonb_build_object('success', true, 'organization_id', v_oid);
    END IF;

    -- Criar se necessário
    SELECT email INTO v_mail FROM auth.users WHERE id = v_uid;
    
    INSERT INTO public.organizations (name)
    VALUES (split_part(v_mail, '@', 1) || ' Organization')
    RETURNING id INTO v_oid;

    INSERT INTO public.organization_members (organization_id, user_id, email, role, is_active)
    VALUES (v_oid, v_uid, v_mail, 'owner', true);

    INSERT INTO public.subscriptions (user_id, organization_id, plan_id, status, amount, start_date)
    VALUES (v_uid, v_oid, 'enterprise_free', 'authorized', 0, now())
    ON CONFLICT (user_id) DO NOTHING;

    RETURN jsonb_build_object('success', true, 'organization_id', v_oid);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$body$;

-- BLOCO 5: PERMISSÕES
GRANT EXECUTE ON FUNCTION public.ensure_user_organization() TO authenticated, anon;

-- BLOCO 6: CORREÇÃO RETROATIVA (Para quem já criou e deu erro)
DO $body$
DECLARE r RECORD; o UUID;
BEGIN
    FOR r IN SELECT id, email, raw_user_meta_data FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.user_id = u.id) AND u.email != 'mateusabcck@gmail.com'
    LOOP
       BEGIN
         INSERT INTO public.organizations (name) VALUES (COALESCE(r.raw_user_meta_data->>'name', split_part(r.email, '@', 1)) || ' Organization') RETURNING id INTO o;
         INSERT INTO public.organization_members (organization_id, user_id, email, role, is_active) VALUES (o, r.id, r.email, 'owner', true);
         INSERT INTO public.subscriptions (user_id, organization_id, plan_id, status, amount, start_date) VALUES (r.id, o, 'enterprise_free', 'authorized', 0, now()) ON CONFLICT DO NOTHING;
       EXCEPTION WHEN OTHERS THEN CONTINUE;
       END;
    END LOOP;
END;
$body$;

NOTIFY pgrst, 'reload schema';
