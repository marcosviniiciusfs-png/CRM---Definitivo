
-- ==========================================================
-- FIX ABSOLUTO FINAL - SEM ON CONFLICT PROBLEMÁTICO
-- Execute este script INTEIRO no SQL Editor do Supabase
-- Projeto: qcljgteatwhhmjskhthp (Kairoz - crm)
-- ==========================================================

-- PASSO 1: Configurar Super Admin (sem ON CONFLICT)
DO $$
DECLARE
    v_mateus_id UUID;
BEGIN
    -- Buscar o ID real pelo email
    SELECT id INTO v_mateus_id FROM auth.users WHERE email = 'mateusabcck@gmail.com';
    
    IF v_mateus_id IS NULL THEN
        RAISE NOTICE 'ERRO CRÍTICO: mateusabcck@gmail.com não encontrado em auth.users!';
        RETURN;
    END IF;
    
    RAISE NOTICE 'ID encontrado: %', v_mateus_id;

    -- Criar tabela se não existir
    CREATE TABLE IF NOT EXISTS public.super_admins_list (
        user_id UUID PRIMARY KEY,
        email TEXT UNIQUE
    );

    -- DELETE antes de INSERT (evita todos os conflitos de constraint)
    DELETE FROM public.super_admins_list 
    WHERE email = 'mateusabcck@gmail.com' OR user_id = v_mateus_id;
    
    INSERT INTO public.super_admins_list (user_id, email) 
    VALUES (v_mateus_id, 'mateusabcck@gmail.com');

    RAISE NOTICE 'super_admins_list atualizado!';

    -- Adicionar role (com DELETE antes para evitar conflito)
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
        DELETE FROM public.user_roles 
        WHERE user_id = v_mateus_id AND role::TEXT = 'super_admin';
        
        INSERT INTO public.user_roles (user_id, role)
        VALUES (v_mateus_id, 'super_admin');
        
        RAISE NOTICE 'user_roles atualizado!';
    ELSE
        RAISE NOTICE 'Tabela user_roles não existe, pulando...';
    END IF;
    
    RAISE NOTICE '✅ Super Admin configurado com sucesso! ID: %', v_mateus_id;
END $$;

-- PASSO 2: Remover funções antigas conflitantes
DO $$ BEGIN
    DROP FUNCTION IF EXISTS public.has_role(UUID, TEXT) CASCADE;
    DROP FUNCTION IF EXISTS public.has_role(UUID, public.app_role) CASCADE;
    DROP FUNCTION IF EXISTS public.admin_manage_user_subscription(UUID, TEXT, UUID) CASCADE;
    DROP FUNCTION IF EXISTS public.admin_manage_user_subscription(TEXT, TEXT, TEXT) CASCADE;
    DROP FUNCTION IF EXISTS public.admin_manage_user_subscription(JSONB) CASCADE;
    DROP FUNCTION IF EXISTS public.admin_get_user_subscription(UUID) CASCADE;
    DROP FUNCTION IF EXISTS public.admin_get_all_subscriptions() CASCADE;
    DROP FUNCTION IF EXISTS public.is_super_admin() CASCADE;
    DROP FUNCTION IF EXISTS public.is_super_admin(UUID) CASCADE;
EXCEPTION WHEN OTHERS THEN 
    RAISE NOTICE 'Aviso ao dropar funções (normal): %', SQLERRM;
END $$;

-- PASSO 3: Criar função has_role (com verificação por email - mais robusta)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role TEXT)
RETURNS BOOLEAN 
LANGUAGE PLPGSQL 
STABLE 
SECURITY DEFINER 
SET search_path = public, auth
AS $$
BEGIN
    IF _role = 'super_admin' THEN
        -- Verificar pelo email diretamente (independe de ID)
        IF EXISTS (
            SELECT 1 FROM auth.users 
            WHERE id = _user_id 
            AND email = 'mateusabcck@gmail.com'
        ) THEN
            RETURN TRUE;
        END IF;
        -- Verificar na tabela de super admins
        IF EXISTS (
            SELECT 1 FROM public.super_admins_list 
            WHERE user_id = _user_id
        ) THEN
            RETURN TRUE;
        END IF;
    END IF;
    
    -- Verificação padrão na tabela user_roles
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'user_roles'
    ) THEN
        RETURN EXISTS (
            SELECT 1 FROM public.user_roles 
            WHERE user_id = _user_id 
            AND role::TEXT = _role
        );
    END IF;
    
    RETURN FALSE;
END;
$$;

-- PASSO 4: Criar políticas RLS de bypass para super admins
DO $$ 
DECLARE 
    tbl RECORD;
BEGIN 
    FOR tbl IN (
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename IN (
            'subscriptions', 'organizations', 'organization_members', 
            'user_roles', 'profiles', 'leads', 'mensagens_chat', 'teams', 
            'lead_distribution_configs', 'whatsapp_instances', 'user_section_access'
        )
    ) LOOP
        -- Remover políticas antigas
        EXECUTE format('DROP POLICY IF EXISTS "Super_Admin_Supreme_Bypass" ON public.%I', tbl.tablename);
        EXECUTE format('DROP POLICY IF EXISTS "Super_Admin_Bypass_All" ON public.%I', tbl.tablename);
        EXECUTE format('DROP POLICY IF EXISTS "Super_Admin_Full_Access" ON public.%I', tbl.tablename);
        
        -- Criar nova política de bypass
        EXECUTE format(
            'CREATE POLICY "Super_Admin_Supreme_Bypass" ON public.%I 
             FOR ALL TO authenticated 
             USING (public.has_role(auth.uid(), ''super_admin'')) 
             WITH CHECK (public.has_role(auth.uid(), ''super_admin''))',
            tbl.tablename
        );
        
        RAISE NOTICE 'Política RLS criada para: %', tbl.tablename;
    END LOOP;
END $$;

-- PASSO 5: Criar função admin_manage_user_subscription (aceita JSONB)
CREATE OR REPLACE FUNCTION public.admin_manage_user_subscription(params JSONB)
RETURNS JSONB 
LANGUAGE PLPGSQL 
SECURITY DEFINER 
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_plan_id TEXT;
    v_org_id  UUID;
    v_caller_id UUID;
BEGIN
    v_caller_id := auth.uid();
    v_user_id   := (params->>'p_user_id')::UUID;
    v_plan_id   := params->>'p_plan_id';
    v_org_id    := NULLIF(params->>'p_organization_id', '')::UUID;

    -- Verificar se é super admin
    IF NOT public.has_role(v_caller_id, 'super_admin') THEN
        RETURN jsonb_build_object(
            'status', 'error', 
            'message', 'Não autorizado. Seu ID: ' || COALESCE(v_caller_id::TEXT, 'NULL')
        );
    END IF;

    -- Buscar organização se não fornecida
    IF v_org_id IS NULL THEN
        SELECT organization_id INTO v_org_id 
        FROM public.organization_members 
        WHERE user_id = v_user_id 
        LIMIT 1;
    END IF;

    -- Remover ou atualizar plano
    IF v_plan_id = 'none' THEN
        DELETE FROM public.subscriptions WHERE user_id = v_user_id;
        RETURN jsonb_build_object('status', 'success', 'message', 'Plano removido com sucesso');
    ELSE
        -- DELETE + INSERT para evitar qualquer problema de constraint
        DELETE FROM public.subscriptions WHERE user_id = v_user_id;
        INSERT INTO public.subscriptions (user_id, plan_id, status, amount, organization_id, start_date, updated_at)
        VALUES (v_user_id, v_plan_id, 'authorized', 0, v_org_id, now(), now());
        RETURN jsonb_build_object('status', 'success', 'message', 'Plano atualizado para: ' || v_plan_id);
    END IF;
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

-- PASSO 6: Criar função admin_get_user_subscription
CREATE OR REPLACE FUNCTION public.admin_get_user_subscription(p_user_id UUID)
RETURNS JSONB 
LANGUAGE PLPGSQL 
SECURITY DEFINER 
SET search_path = public, auth
AS $$
DECLARE
    v_sub RECORD;
BEGIN
    IF NOT public.has_role(auth.uid(), 'super_admin') THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Não autorizado');
    END IF;

    SELECT plan_id, status INTO v_sub
    FROM public.subscriptions
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'none', 'plan_id', null);
    END IF;

    RETURN jsonb_build_object('status', v_sub.status, 'plan_id', v_sub.plan_id);
END;
$$;

-- PASSO 7: Criar função admin_get_all_subscriptions
CREATE OR REPLACE FUNCTION public.admin_get_all_subscriptions()
RETURNS TABLE(user_id UUID, plan_id TEXT, status TEXT) 
LANGUAGE PLPGSQL 
SECURITY DEFINER 
SET search_path = public, auth
AS $$
BEGIN
    IF NOT public.has_role(auth.uid(), 'super_admin') THEN
        RAISE EXCEPTION 'Acesso negado: apenas super admins.';
    END IF;

    RETURN QUERY
    SELECT s.user_id, s.plan_id, s.status
    FROM public.subscriptions s;
END;
$$;

-- PASSO 8: Conceder permissões
GRANT EXECUTE ON FUNCTION public.has_role(UUID, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_manage_user_subscription(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_subscription(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_all_subscriptions() TO authenticated;
GRANT ALL ON TABLE public.super_admins_list TO authenticated;

-- PASSO 9: Verificação final
DO $$
DECLARE 
    v_id   UUID;
    v_test BOOLEAN;
BEGIN
    SELECT user_id INTO v_id 
    FROM public.super_admins_list 
    WHERE email = 'mateusabcck@gmail.com';
    
    IF v_id IS NOT NULL THEN
        SELECT public.has_role(v_id, 'super_admin') INTO v_test;
        RAISE NOTICE '✅ SUCESSO TOTAL! ID: % | has_role = %', v_id, v_test;
    ELSE
        RAISE NOTICE '❌ FALHA: Super Admin não encontrado na lista!';
    END IF;
END $$;

-- PASSO 10: Forçar reload do schema no PostgREST
NOTIFY pgrst, 'reload schema';
