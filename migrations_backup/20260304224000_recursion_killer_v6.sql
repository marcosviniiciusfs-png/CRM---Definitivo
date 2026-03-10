
-- ============= LIMPANDO TUDO PARA REPARO FINAL =============
SET check_function_bodies = false;

-- 1. DESATIVAR RLS PARA GARANTIR LIMPEZA SEM ERRO
ALTER TABLE IF EXISTS public.organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.whatsapp_instances DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.facebook_integrations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.leads DISABLE ROW LEVEL SECURITY;

-- 2. REMOVER TODAS AS POLÍTICAS POSSÍVEIS (Limpeza Total)
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- 3. REMOVER FUNÇÕES ANTIGAS
DROP FUNCTION IF EXISTS public.get_my_org_ids_raw() CASCADE;
DROP FUNCTION IF EXISTS public.get_my_orgs_secure() CASCADE;
DROP FUNCTION IF EXISTS public.get_my_organization_memberships() CASCADE;
DROP FUNCTION IF EXISTS public.get_facebook_integrations_masked() CASCADE;
DROP FUNCTION IF EXISTS public.check_org_access(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.set_user_active_organization(UUID) CASCADE;

-- 4. FUNÇÃO MESTRE: QUEBRA DE RECURSÃO (SECURITY DEFINER + PLPGSQL)
-- Esta função é o segredo. Ela roda com privilégios de owner (postgres) e ignora RLS.
CREATE OR REPLACE FUNCTION public.get_my_org_ids_final()
RETURNS UUID[] 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public, auth
STABLE
AS $$
DECLARE
    _ids UUID[];
BEGIN
    SELECT array_agg(organization_id) INTO _ids
    FROM public.organization_members
    WHERE user_id = auth.uid();
    RETURN COALESCE(_ids, ARRAY[]::UUID[]);
END;
$$;

-- 5. FUNÇÃO DE APOIO PARA VERIFICAR ACESSO (Otimizada)
CREATE OR REPLACE FUNCTION public.has_org_access(org_id UUID)
RETURNS BOOLEAN 
LANGUAGE sql 
SECURITY DEFINER 
STABLE
AS $$
    SELECT org_id = ANY(public.get_my_org_ids_final());
$$;

-- 6. CRIAR NOVAS POLÍTICAS ULTRA-SIMPLIFICADAS (Sem Recursão)

-- Organization Members
-- Regra 1: Você vê seu próprio registro (Sempre permitido)
CREATE POLICY "Membership_Own_Access" ON public.organization_members 
FOR SELECT TO authenticated 
USING (user_id = auth.uid());

-- Regra 2: Você vê seus colegas (Usando a função SD para pular o RLS recursivo)
CREATE POLICY "Membership_Org_Access" ON public.organization_members 
FOR SELECT TO authenticated 
USING (organization_id = ANY(public.get_my_org_ids_final()));

-- WhatsApp & Facebook & Leads & Organizations
CREATE POLICY "WhatsApp_Access" ON public.whatsapp_instances FOR ALL TO authenticated USING (public.has_org_access(organization_id) OR user_id = auth.uid());
CREATE POLICY "Facebook_Access" ON public.facebook_integrations FOR ALL TO authenticated USING (public.has_org_access(organization_id));
CREATE POLICY "Leads_Access" ON public.leads FOR ALL TO authenticated USING (public.has_org_access(organization_id));
CREATE POLICY "Organizations_Access" ON public.organizations FOR SELECT TO authenticated USING (id = ANY(public.get_my_org_ids_final()));

-- 7. REATIVAR RLS
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- 8. RECONSTRUIR RPC PARA O FRONTEND
CREATE OR REPLACE FUNCTION public.get_my_organization_memberships()
RETURNS TABLE (
    organization_id UUID,
    organization_name TEXT,
    role TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        om.organization_id,
        o.name as organization_name,
        om.role::TEXT
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE om.user_id = auth.uid();
END; $$;

-- Função set_user_active_organization (Necessária para o frontend)
CREATE OR REPLACE FUNCTION public.set_user_active_organization(_org_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- Simplesmente retorna true para compatibilidade, RLS agora é dinâmico via get_my_org_ids_final
    RETURN TRUE;
END; $$;

-- 9. BYPASS PARA SUPER ADMIN (Seguro)
DO $$ 
DECLARE 
    tbl RECORD;
BEGIN 
    FOR tbl IN (
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' 
        AND tablename IN ('subscriptions', 'organizations', 'organization_members', 'whatsapp_instances', 'facebook_integrations', 'leads')
    ) LOOP
        EXECUTE format('CREATE POLICY "Super_Admin_Bypass_v6" ON public.%I FOR ALL TO authenticated 
            USING (public.has_role(auth.uid(), ''super_admin''))', tbl.tablename);
    END LOOP;
END $$;

-- 10. REPARAR FUNÇÃO MASCARADA DO FACEBOOK
CREATE OR REPLACE FUNCTION public.get_facebook_integrations_masked()
RETURNS TABLE (
    id UUID,
    organization_id UUID,
    page_id TEXT,
    page_name TEXT,
    selected_form_id TEXT,
    selected_form_name TEXT,
    webhook_verified BOOLEAN,
    needs_reconnect BOOLEAN
) 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        fi.id,
        fi.organization_id,
        fi.page_id,
        fi.page_name,
        fi.selected_form_id,
        fi.selected_form_name,
        fi.webhook_verified,
        (fi.expires_at < now()) as needs_reconnect
    FROM public.facebook_integrations fi
    WHERE fi.organization_id = ANY(public.get_my_org_ids_final());
END;
$$;

-- 11. PERMISSÕES FINAIS
GRANT EXECUTE ON FUNCTION public.get_my_org_ids_final() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_organization_memberships() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_facebook_integrations_masked() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_active_organization(UUID) TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;

-- REFRESH FINAL
NOTIFY pgrst, 'reload schema';
