
-- ==========================================================
-- FIX DEFINITIVO - PROJETO CORRETO: qcljgteatwhhmjskhthp
-- Este script deve ser executado no SQL Editor do Supabase
-- do projeto qcljgteatwhhmjskhthp (o usado pelo CRM)
-- ==========================================================

-- 1. IDENTIFICAR O SUPER ADMIN DINAMICAMENTE
DO $$
DECLARE
    v_mateus_id UUID;
BEGIN
    SELECT id INTO v_mateus_id FROM auth.users WHERE email = 'mateusabcck@gmail.com';
    
    IF v_mateus_id IS NULL THEN
        RAISE NOTICE 'AVISO: Usuario mateusabcck@gmail.com nao encontrado em auth.users!';
        RETURN;
    END IF;
    
    RAISE NOTICE 'ID do Super Admin encontrado: %', v_mateus_id;

    -- Criar tabela de imunidade se nao existir
    CREATE TABLE IF NOT EXISTS public.super_admins_list (
        user_id UUID PRIMARY KEY,
        email TEXT UNIQUE
    );

    -- Limpar entradas conflitantes ANTES de inserir (resolve o erro de duplicate key)
    DELETE FROM public.super_admins_list 
    WHERE email = 'mateusabcck@gmail.com' OR user_id = v_mateus_id;
    
    -- Inserir entrada limpa
    INSERT INTO public.super_admins_list (user_id, email) 
    VALUES (v_mateus_id, 'mateusabcck@gmail.com');

    -- Garantir que ele tenha o role na tabela user_roles
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
        INSERT INTO public.user_roles (user_id, role)
        VALUES (v_mateus_id, 'super_admin')
        ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin';
    END IF;
    
    RAISE NOTICE 'Super Admin configurado com sucesso! ID: %', v_mateus_id;
END $$;

-- 2. LIMPEZA DE FUNCOES CONFLITANTES
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
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 3. FUNCAO DE VERIFICACAO DE ROLE (fonte unica da verdade)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role TEXT)
RETURNS BOOLEAN LANGUAGE PLPGSQL STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
BEGIN
    IF _role = 'super_admin' THEN
        -- Checar pelo email diretamente na tabela auth.users (mais seguro)
        IF EXISTS (SELECT 1 FROM auth.users WHERE id = _user_id AND email = 'mateusabcck@gmail.com') THEN
            RETURN TRUE;
        END IF;
        -- Checar na tabela de super admins
        IF EXISTS (SELECT 1 FROM public.super_admins_list WHERE user_id = _user_id) THEN
            RETURN TRUE;
        END IF;
    END IF;
    -- Checagem padrao na tabela user_roles
    RETURN EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = _user_id 
        AND role::TEXT = _role
    );
END;
$$;

-- 4. BYPASS GLOBAL DE RLS PARA SUPER ADMINS
DO $$ 
DECLARE 
    tbl RECORD;
BEGIN 
    FOR tbl IN (
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' 
        AND tablename IN (
            'subscriptions', 'organizations', 'organization_members', 
            'user_roles', 'profiles', 'leads', 'mensagens_chat', 'teams', 
            'lead_distribution_configs', 'whatsapp_instances', 'user_section_access'
        )
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Super_Admin_Supreme_Bypass" ON public.%I', tbl.tablename);
        EXECUTE format('DROP POLICY IF EXISTS "Super_Admin_Bypass_All" ON public.%I', tbl.tablename);
        EXECUTE format('DROP POLICY IF EXISTS "Super_Admin_Full_Access" ON public.%I', tbl.tablename);
        
        EXECUTE format('CREATE POLICY "Super_Admin_Supreme_Bypass" ON public.%I FOR ALL TO authenticated 
            USING (public.has_role(auth.uid(), ''super_admin'')) 
            WITH CHECK (public.has_role(auth.uid(), ''super_admin''))', tbl.tablename);
        
        RAISE NOTICE 'Politica criada para tabela: %', tbl.tablename;
    END LOOP;
END $$;

-- 5. FUNCOES RPC PARA O FRONTEND

-- A. Gerenciar Assinatura (aceita JSONB - compativel com Supabase JS v2)
CREATE OR REPLACE FUNCTION public.admin_manage_user_subscription(params JSONB)
RETURNS JSONB LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_plan_id TEXT;
    v_org_id UUID;
BEGIN
    -- Extrair valores do JSON
    v_user_id := (params->>'p_user_id')::UUID;
    v_plan_id := params->>'p_plan_id';
    v_org_id := NULLIF(params->>'p_organization_id', '')::UUID;

    -- SEGURANCA: Apenas Super Admin
    IF NOT public.has_role(auth.uid(), 'super_admin') THEN
        RETURN jsonb_build_object(
            'status', 'error', 
            'message', 'Nao autorizado. Apenas super admins podem gerenciar planos. Seu ID: ' || auth.uid()::TEXT
        );
    END IF;

    -- Tentar encontrar organizacao se nao fornecida
    IF v_org_id IS NULL THEN
        SELECT organization_id INTO v_org_id 
        FROM public.organization_members 
        WHERE user_id = v_user_id 
        LIMIT 1;
    END IF;

    -- Remover plano
    IF v_plan_id = 'none' THEN
        DELETE FROM public.subscriptions WHERE user_id = v_user_id;
        RETURN jsonb_build_object('status', 'success', 'message', 'Plano removido com sucesso');
    -- Atualizar/Criar plano
    ELSE
        INSERT INTO public.subscriptions (user_id, plan_id, status, amount, organization_id, start_date, updated_at)
        VALUES (v_user_id, v_plan_id, 'authorized', 0, v_org_id, now(), now())
        ON CONFLICT (user_id) DO UPDATE SET 
            plan_id = EXCLUDED.plan_id, 
            status = 'authorized', 
            updated_at = now(), 
            organization_id = COALESCE(v_org_id, public.subscriptions.organization_id);
        RETURN jsonb_build_object('status', 'success', 'message', 'Plano atualizado com sucesso');
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

-- B. Buscar Assinatura de Usuario Especifico
CREATE OR REPLACE FUNCTION public.admin_get_user_subscription(p_user_id UUID)
RETURNS JSONB LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
    v_sub RECORD;
BEGIN
    IF NOT public.has_role(auth.uid(), 'super_admin') THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Nao autorizado');
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

-- C. Buscar Todas as Assinaturas (para o Dashboard Admin)
CREATE OR REPLACE FUNCTION public.admin_get_all_subscriptions()
RETURNS TABLE(user_id UUID, plan_id TEXT, status TEXT) 
LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public, auth
AS $$
BEGIN
    IF NOT public.has_role(auth.uid(), 'super_admin') THEN
        RAISE EXCEPTION 'Acesso negado: apenas para super administradores.';
    END IF;

    RETURN QUERY
    SELECT s.user_id, s.plan_id, s.status
    FROM public.subscriptions s;
END;
$$;

-- 6. PERMISSOES
GRANT EXECUTE ON FUNCTION public.has_role(UUID, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_manage_user_subscription(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_subscription(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_all_subscriptions() TO authenticated;
GRANT ALL ON TABLE public.super_admins_list TO authenticated;

-- 7. VERIFICACAO FINAL
DO $$
DECLARE 
    v_id UUID;
    v_test BOOLEAN;
BEGIN
    SELECT user_id INTO v_id FROM public.super_admins_list WHERE email = 'mateusabcck@gmail.com';
    
    IF v_id IS NOT NULL THEN
        SELECT public.has_role(v_id, 'super_admin') INTO v_test;
        RAISE NOTICE 'SUCESSO! Super Admin ID: % | has_role retorna: %', v_id, v_test;
    ELSE
        RAISE NOTICE 'FALHA: Super Admin nao encontrado na lista!';
    END IF;
END $$;

-- 8. FORCAR RELOAD DO SCHEMA
NOTIFY pgrst, 'reload schema';
