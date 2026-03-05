
-- ==========================================================
-- GERAÇÃO DE ACESSO SUPREMO - FIX FINAL DINÂMICO
-- RESOLVE: IDs Hardcoded, RLS, e Function Not Found
-- ==========================================================

-- 1. IDENTIFICAÇÃO DINÂMICA DO SUPER ADMIN
DO $$
DECLARE
    v_mateus_id UUID;
BEGIN
    -- Tenta encontrar o ID do Mateus pelo email
    SELECT id INTO v_mateus_id FROM auth.users WHERE email = 'mateusabcck@gmail.com';
    
    -- Criar tabela de imunidade se não existir
    CREATE TABLE IF NOT EXISTS public.super_admins_list (
        user_id UUID PRIMARY KEY,
        email TEXT UNIQUE
    );

    -- Inserir Mateus na lista de imunidade (usando o ID real encontrado ou o hardcoded como fallback)
    -- O hardcoded 'd70f265d-0fc6-4ef9-800d-7734bd2ea107' ainda é mantido como fallback histórico
    IF v_mateus_id IS NOT NULL THEN
        INSERT INTO public.super_admins_list (user_id, email) 
        VALUES (v_mateus_id, 'mateusabcck@gmail.com')
        ON CONFLICT (user_id) DO NOTHING;
    END IF;
    
    INSERT INTO public.super_admins_list (user_id, email) 
    VALUES ('d70f265d-0fc6-4ef9-800d-7734bd2ea107', 'mateusabcck@gmail.com')
    ON CONFLICT (user_id) DO NOTHING;

    -- Garantir que ele tenha o role no user_roles também
    IF v_mateus_id IS NOT NULL THEN
        INSERT INTO public.user_roles (user_id, role)
        VALUES (v_mateus_id, 'super_admin')
        ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin';
    END IF;
END $$;

-- 2. LIMPEZA TOTAL DE FUNÇÕES CONFLITANTES
DO $$ BEGIN
    -- Remover versões variadas para evitar "ambiguous function"
    DROP FUNCTION IF EXISTS public.has_role(UUID, TEXT) CASCADE;
    DROP FUNCTION IF EXISTS public.has_role(UUID, public.app_role) CASCADE;
    DROP FUNCTION IF EXISTS public.admin_manage_user_subscription(UUID, TEXT, UUID) CASCADE;
    DROP FUNCTION IF EXISTS public.admin_manage_user_subscription(TEXT, TEXT, TEXT) CASCADE;
    DROP FUNCTION IF EXISTS public.admin_manage_user_subscription(JSONB) CASCADE;
    DROP FUNCTION IF EXISTS public.admin_get_user_subscription(UUID) CASCADE;
    DROP FUNCTION IF EXISTS public.is_super_admin() CASCADE;
    DROP FUNCTION IF EXISTS public.is_super_admin(UUID) CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 3. FUNÇÃO DE VERIFICAÇÃO DE ROLE (O ÚNICO LUGAR DA VERDADE)
-- Aceita TEXT para o role para ser compatível com chamadas RPC simples
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role TEXT)
RETURNS BOOLEAN LANGUAGE PLPGSQL STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
BEGIN
    -- Se estiver checando super_admin, aplica as regras de imunidade
    IF _role = 'super_admin' THEN
        IF _user_id = 'd70f265d-0fc6-4ef9-800d-7734bd2ea107' THEN RETURN TRUE; END IF;
        IF EXISTS (SELECT 1 FROM public.super_admins_list WHERE user_id = _user_id) THEN RETURN TRUE; END IF;
    END IF;
    
    -- Checagem padrão na tabela user_roles
    RETURN EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = _user_id 
        AND role::TEXT = _role
    );
END;
$$;

-- 4. BYPASS GLOBAL DE RLS (O PODER REAL)
DO $$ 
DECLARE 
    tbl RECORD;
BEGIN 
    FOR tbl IN (
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' 
        AND tablename IN ('subscriptions', 'organizations', 'organization_members', 'user_roles', 'profiles', 'leads', 'mensagens_chat', 'teams', 'lead_distribution_configs', 'whatsapp_instances', 'user_section_access')
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Super_Admin_Supreme_Bypass" ON public.%I', tbl.tablename);
        EXECUTE format('DROP POLICY IF EXISTS "Super_Admin_Bypass_All" ON public.%I', tbl.tablename);
        EXECUTE format('DROP POLICY IF EXISTS "Super_Admin_Full_Access" ON public.%I', tbl.tablename);
        
        EXECUTE format('CREATE POLICY "Super_Admin_Supreme_Bypass" ON public.%I FOR ALL TO authenticated 
            USING (public.has_role(auth.uid(), ''super_admin'')) 
            WITH CHECK (public.has_role(auth.uid(), ''super_admin''))', tbl.tablename);
    END LOOP;
END $$;

-- 5. FUNÇÕES RPC PARA O FRONTEND

-- A. Manage Subscription (Versão JSONB - Mais flexível para o client do Supabase)
CREATE OR REPLACE FUNCTION public.admin_manage_user_subscription(params JSONB)
RETURNS JSONB LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_plan_id TEXT;
    v_org_id UUID;
BEGIN
    -- Extrair valores do JSON (com casts seguros)
    v_user_id := (params->>'p_user_id')::UUID;
    v_plan_id := params->>'p_plan_id';
    v_org_id := (params->>'p_organization_id')::UUID;

    -- SEGURANÇA: Só Super Admin
    IF NOT public.has_role(auth.uid(), 'super_admin') THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Não autorizado (Poder Supremo não detectado)');
    END IF;

    -- Tentar achar organização se não fornecida
    IF v_org_id IS NULL THEN
        SELECT organization_id INTO v_org_id FROM public.organization_members WHERE user_id = v_user_id LIMIT 1;
    END IF;

    IF v_plan_id = 'none' THEN
        DELETE FROM public.subscriptions WHERE user_id = v_user_id;
        RETURN jsonb_build_object('status', 'success', 'message', 'Plano removido');
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

-- B. Get User Subscription (Necessário para carregar os detalhes do usuário)
CREATE OR REPLACE FUNCTION public.admin_get_user_subscription(p_user_id UUID)
RETURNS JSONB LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
    v_sub RECORD;
BEGIN
    -- Validar super_admin
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

-- C. Get All Subscriptions (Necessário para o Dashboard Admin)
CREATE OR REPLACE FUNCTION public.admin_get_all_subscriptions()
RETURNS TABLE(user_id UUID, plan_id TEXT, status TEXT) LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public, auth
AS $$
BEGIN
    -- Validar super_admin usando a nova função unificada
    IF NOT public.has_role(auth.uid(), 'super_admin') THEN
        RAISE EXCEPTION 'Acesso negado: apenas para super administradores.';
    END IF;

    RETURN QUERY
    SELECT s.user_id, s.plan_id, s.status
    FROM public.subscriptions s;
END;
$$;

-- 6. PERMISSÕES E RELOAD
GRANT EXECUTE ON FUNCTION public.has_role(UUID, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_manage_user_subscription(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_user_subscription(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_all_subscriptions() TO authenticated;

-- Forçar reload do schema no Postgrest
NOTIFY pgrst, 'reload schema';
