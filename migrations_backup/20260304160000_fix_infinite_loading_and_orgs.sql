
-- ============================================================
-- FINAL FIX: ENSURE ORGANIZATION & FREE SUBSCRIPTION
-- ============================================================

-- 1. RPC para garantir que o usuário tenha uma organização (evita loop infinito)
CREATE OR REPLACE FUNCTION public.ensure_user_organization()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_email TEXT;
    v_name TEXT;
    v_org_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    -- 1. Verificar se o usuário já tem uma organização ativa
    SELECT organization_id INTO v_org_id 
    FROM public.organization_members 
    WHERE user_id = v_user_id 
      AND is_active = true
    LIMIT 1;

    IF v_org_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'organization_id', v_org_id, 'message', 'User already has organization');
    END IF;

    -- 2. Pegar informações do usuário do auth.users
    SELECT email, COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1)) 
    INTO v_email, v_name
    FROM auth.users
    WHERE id = v_user_id;

    -- 3. Criar organização
    INSERT INTO public.organizations (name)
    VALUES (v_name || '''s Organization')
    RETURNING id INTO v_org_id;

    -- 4. Adicionar o usuário como dono
    INSERT INTO public.organization_members (organization_id, user_id, email, role, is_active)
    VALUES (v_org_id, v_user_id, v_email, 'owner', true);

    -- 5. Garantir assinatura free (Isso disparará o trigger ensure_free_subscription se ele existir)
    INSERT INTO public.subscriptions (user_id, organization_id, plan_id, status, amount, start_date)
    VALUES (v_user_id, v_org_id, 'enterprise_free', 'authorized', 0, now())
    ON CONFLICT (user_id) DO UPDATE SET 
        plan_id = 'enterprise_free',
        status = 'authorized',
        updated_at = now();

    RETURN jsonb_build_object('success', true, 'organization_id', v_org_id, 'message', 'Organization and subscription created');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 2. Garantir permissões de execução
GRANT EXECUTE ON FUNCTION public.ensure_user_organization() TO authenticated, anon;

-- 3. CORRIGIR USUÁRIOS EXISTENTES (Catch-all)
DO $$
DECLARE
    user_record RECORD;
    new_org_id UUID;
BEGIN
    FOR user_record IN 
        SELECT id, email, raw_user_meta_data 
        FROM auth.users u
        WHERE NOT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.user_id = u.id)
          AND u.email != 'mateusabcck@gmail.com'
    LOOP
        BEGIN
            -- Criar organização
            INSERT INTO public.organizations (name)
            VALUES (COALESCE(user_record.raw_user_meta_data->>'name', split_part(user_record.email, '@', 1)) || '''s Organization')
            RETURNING id INTO new_org_id;
            
            -- Adicionar membro
            INSERT INTO public.organization_members (organization_id, user_id, email, role, is_active)
            VALUES (new_org_id, user_record.id, user_record.email, 'owner', true);
            
            -- Garantir assinatura
            INSERT INTO public.subscriptions (user_id, organization_id, plan_id, status, amount, start_date)
            VALUES (user_record.id, new_org_id, 'enterprise_free', 'authorized', 0, now())
            ON CONFLICT (user_id) DO NOTHING;
        EXCEPTION WHEN OTHERS THEN
            CONTINUE;
        END;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
