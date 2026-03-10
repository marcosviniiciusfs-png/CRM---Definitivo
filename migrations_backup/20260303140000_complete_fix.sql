
-- ==========================================================
-- GERAÇÃO DE ACESSO SUPREMO - VERSÃO 13 (BULLETPROOF JSON)
-- RESOLVE DEFINITIVAMENTE: 404 (FUNCTION NOT FOUND) E RLS
-- ==========================================================

-- 1. LIMPEZA TOTAL E RADICAL
DO $$ BEGIN
    -- Remover TODAS as versões da função para evitar conflitos de assinatura
    DROP FUNCTION IF EXISTS public.admin_manage_user_subscription(UUID, TEXT, UUID) CASCADE;
    DROP FUNCTION IF EXISTS public.admin_manage_user_subscription(TEXT, TEXT, TEXT) CASCADE;
    DROP FUNCTION IF EXISTS public.admin_manage_user_subscription(JSONB) CASCADE;
    DROP FUNCTION IF EXISTS public.has_role(UUID, TEXT) CASCADE;
    DROP FUNCTION IF EXISTS public.is_super_admin() CASCADE;
    DROP FUNCTION IF EXISTS public.is_super_admin(UUID) CASCADE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 2. TABELA DE IMUNIDADE (O CORAÇÃO DO ACESSO)
DROP TABLE IF EXISTS public.super_admins_list CASCADE;
CREATE TABLE public.super_admins_list (
    user_id UUID PRIMARY KEY,
    email TEXT UNIQUE
);

-- Inserir ID do Mateus (Confirmado: d70f265d-0fc6-4ef9-800d-7734bd2ea107)
INSERT INTO public.super_admins_list (user_id, email) 
VALUES ('d70f265d-0fc6-4ef9-800d-7734bd2ea107', 'mateusabcck@gmail.com');

-- 3. BYPASS GLOBAL DE RLS (PODER SUPREMO)
DO $$ 
DECLARE 
    tbl RECORD;
BEGIN 
    FOR tbl IN (
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' 
        AND tablename IN ('subscriptions', 'organizations', 'organization_members', 'user_roles', 'profiles', 'leads', 'mensagens_chat', 'teams', 'lead_distribution_configs', 'whatsapp_instances')
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Super_Admin_Supreme_Bypass" ON public.%I', tbl.tablename);
        EXECUTE format('CREATE POLICY "Super_Admin_Supreme_Bypass" ON public.%I FOR ALL TO authenticated 
            USING (auth.uid() = ''d70f265d-0fc6-4ef9-800d-7734bd2ea107'' OR EXISTS (SELECT 1 FROM public.super_admins_list WHERE user_id = auth.uid())) 
            WITH CHECK (auth.uid() = ''d70f265d-0fc6-4ef9-800d-7734bd2ea107'' OR EXISTS (SELECT 1 FROM public.super_admins_list WHERE user_id = auth.uid()))', tbl.tablename);
    END LOOP;
END $$;

-- 4. FUNÇÕES RPC (VERSÃO ROBUSTA)

--has_role (Usada pelo AuthContext)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role TEXT)
RETURNS BOOLEAN LANGUAGE PLPGSQL STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
BEGIN
    IF _role = 'super_admin' AND (_user_id = 'd70f265d-0fc6-4ef9-800d-7734bd2ea107' OR EXISTS (SELECT 1 FROM public.super_admins_list WHERE user_id = _user_id)) THEN
        RETURN TRUE;
    END IF;
    RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role::TEXT = _role);
END;
$$;

-- FUNÇÃO MESTRE JSON (Ignora problemas de tipos e assinaturas)
-- Esta função aceita QUALQUER objeto JSON e o processa internamente
CREATE OR REPLACE FUNCTION public.admin_manage_user_subscription(params JSONB)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_plan_id TEXT;
    v_org_id UUID;
BEGIN
    -- Extrair valores do JSON
    v_user_id := (params->>'p_user_id')::UUID;
    v_plan_id := params->>'p_plan_id';
    v_org_id := (params->>'p_organization_id')::UUID;

    -- SEGURANÇA: Só Super Admin
    IF NOT public.has_role(auth.uid(), 'super_admin') THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Não autorizado');
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
            plan_id = EXCLUDED.plan_id, status = 'authorized', updated_at = now(), organization_id = COALESCE(v_org_id, public.subscriptions.organization_id);
        RETURN jsonb_build_object('status', 'success', 'message', 'Plano atualizado');
    END IF;
END;
$$;

-- 5. PERMISSÕES E RELOAD
GRANT EXECUTE ON FUNCTION public.has_role(UUID, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_manage_user_subscription(JSONB) TO authenticated;
NOTIFY pgrst, 'reload schema';
