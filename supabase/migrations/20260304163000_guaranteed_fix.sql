
-- ============================================================
-- SCRIPT DE CORREÇÃO DEFINITIVO: ORGANIZAÇÕES + ASSINATURAS
-- ============================================================

-- 1. GARANTIR COLUNAS NECESSÁRIAS (Evita erro 42703)
DO $$ 
BEGIN 
    -- Adicionar is_active se faltar
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organization_members' AND column_name='is_active') THEN
        ALTER TABLE public.organization_members ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
    
    -- Adicionar email se faltar
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organization_members' AND column_name='email') THEN
        ALTER TABLE public.organization_members ADD COLUMN email TEXT;
    END IF;
END $$;

-- 2. FUNÇÃO MASTER REVISADA (REDER DE SEGURANÇA)
CREATE OR REPLACE FUNCTION public.ensure_user_organization()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_email TEXT;
    v_name TEXT;
    v_org_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Não autenticado');
    END IF;

    -- 1. Verificar se já tem org ativa
    SELECT organization_id INTO v_org_id 
    FROM public.organization_members 
    WHERE user_id = v_user_id 
    LIMIT 1;

    -- Se já tem org, apenas garante a assinatura e retorna
    IF v_org_id IS NOT NULL THEN
        -- Garantir assinatura no plano free
        IF NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = v_user_id) THEN
            INSERT INTO public.subscriptions (user_id, organization_id, plan_id, status, amount, start_date)
            VALUES (v_user_id, v_org_id, 'enterprise_free', 'authorized', 0, now());
        END IF;
        
        RETURN jsonb_build_object('success', true, 'organization_id', v_org_id, 'new', false);
    END IF;

    -- 2. Criar nova org se não existir nenhuma
    SELECT u.email, COALESCE(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)) 
    INTO v_email, v_name
    FROM auth.users u
    WHERE u.id = v_user_id;

    -- Inserir nova organização
    INSERT INTO public.organizations (name)
    VALUES (v_name || '''s Organization')
    RETURNING id INTO v_org_id;

    -- Adicionar membro (Dono)
    INSERT INTO public.organization_members (organization_id, user_id, email, role, is_active)
    VALUES (v_org_id, v_user_id, v_email, 'owner', true);

    -- Garantir assinatura
    INSERT INTO public.subscriptions (user_id, organization_id, plan_id, status, amount, start_date)
    VALUES (v_user_id, v_org_id, 'enterprise_free', 'authorized', 0, now());

    RETURN jsonb_build_object('success', true, 'organization_id', v_org_id, 'new', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 3. PERMISSÕES
GRANT EXECUTE ON FUNCTION public.ensure_user_organization() TO authenticated, anon;

-- 4. FIX PARA USUÁRIOS SEM ORGANIZAÇÃO (LOOP DE LIMPEZA)
DO $$
DECLARE
    r RECORD;
    new_org_id UUID;
BEGIN
    FOR r IN 
        SELECT id, email, raw_user_meta_data 
        FROM auth.users u
        WHERE NOT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.user_id = u.id)
          AND u.email != 'mateusabcck@gmail.com'
    LOOP
        BEGIN
            -- Criar org
            INSERT INTO public.organizations (name)
            VALUES (COALESCE(r.raw_user_meta_data->>'name', split_part(r.email, '@', 1)) || '''s Org')
            RETURNING id INTO new_org_id;
            
            -- Adicionar membro
            INSERT INTO public.organization_members (organization_id, user_id, email, role, is_active)
            VALUES (new_org_id, r.id, r.email, 'owner', true);
            
            -- Assinatura
            IF NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = r.id) THEN
                INSERT INTO public.subscriptions (user_id, organization_id, plan_id, status, amount, start_date)
                VALUES (r.id, new_org_id, 'enterprise_free', 'authorized', 0, now());
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Erro ao processar usuario %: %', r.email, SQLERRM;
        END;
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
