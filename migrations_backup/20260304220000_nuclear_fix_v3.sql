
-- ============================================================
-- NUCLEAR FIX V4: LIMPEZA TOTAL E RECONSTRUÇÃO DE SEGURANÇA
-- ============================================================

-- 1. DESATIVAR RLS TEMPORARIAMENTE PARA EVITAR BLOQUEIOS DURANTE A MUDANÇA
ALTER TABLE public.organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_instances DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_integrations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations DISABLE ROW LEVEL SECURITY;

-- 2. APAGAR FUNÇÕES EXISTENTES (Garante que não haverá erro de "return type")
DROP FUNCTION IF EXISTS public.get_my_organization_memberships() CASCADE;
DROP FUNCTION IF EXISTS public.get_my_org_ids() CASCADE;
DROP FUNCTION IF EXISTS public.get_facebook_integrations_masked() CASCADE;
DROP FUNCTION IF EXISTS public.get_my_orgs_secure() CASCADE;

-- 3. LIMPEZA DE TODAS AS POLÍTICAS (Garante um estado limpo)
DO $$ 
DECLARE
    tbl RECORD;
BEGIN
    FOR tbl IN (
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' 
        AND tablename IN ('organization_members', 'whatsapp_instances', 'facebook_integrations', 'leads', 'subscriptions', 'organizations')
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Super_Admin_Supreme_Bypass" ON public.%I', tbl.tablename);
        EXECUTE format('DROP POLICY IF EXISTS "Membership_Basic_Access" ON public.%I', tbl.tablename);
        EXECUTE format('DROP POLICY IF EXISTS "Whatsapp_Org_Access" ON public.%I', tbl.tablename);
        EXECUTE format('DROP POLICY IF EXISTS "Facebook_Org_Access" ON public.%I', tbl.tablename);
        EXECUTE format('DROP POLICY IF EXISTS "Org_Members_Simple_Access" ON public.%I', tbl.tablename);
        EXECUTE format('DROP POLICY IF EXISTS "WhatsApp_Simple_Access" ON public.%I', tbl.tablename);
        EXECUTE format('DROP POLICY IF EXISTS "Facebook_Simple_Access" ON public.%I', tbl.tablename);
    END LOOP;
END $$;

-- 4. FUNÇÃO MESTRE DE IDENTIFICAÇÃO (FIM DA RECURSÃO)
CREATE OR REPLACE FUNCTION public.get_my_org_ids()
RETURNS UUID[] 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public, auth
STABLE
AS $$
DECLARE
    user_org_ids UUID[];
BEGIN
    SELECT array_agg(organization_id) INTO user_org_ids
    FROM public.organization_members
    WHERE user_id = auth.uid();
    RETURN COALESCE(user_org_ids, ARRAY[]::UUID[]);
END;
$$;

-- 5. REATIVAR E CRIAR NOVAS POLÍTICAS ULTRA-SIMPLIFICADAS
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Regras baseadas no array de IDs (Sem recursão)
CREATE POLICY "Membership_Core_Access" ON public.organization_members FOR SELECT TO authenticated USING (user_id = auth.uid() OR organization_id = ANY(public.get_my_org_ids()));
CREATE POLICY "WhatsApp_Core_Access" ON public.whatsapp_instances FOR ALL TO authenticated USING (organization_id = ANY(public.get_my_org_ids()));
CREATE POLICY "Facebook_Core_Access" ON public.facebook_integrations FOR ALL TO authenticated USING (organization_id = ANY(public.get_my_org_ids()));
CREATE POLICY "Organizations_Core_Access" ON public.organizations FOR SELECT TO authenticated USING (id = ANY(public.get_my_org_ids()));

-- 6. BYPASS SUPREMO PARA SUPER ADMIN (Sempre no topo)
DO $$ 
DECLARE 
    tbl RECORD;
BEGIN 
    FOR tbl IN (
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' 
        AND tablename IN ('subscriptions', 'organizations', 'organization_members', 'whatsapp_instances', 'facebook_integrations', 'leads')
    ) LOOP
        EXECUTE format('CREATE POLICY "Super_Admin_Supreme_Bypass" ON public.%I FOR ALL TO authenticated 
            USING (public.has_role(auth.uid(), ''super_admin''))', tbl.tablename);
    END LOOP;
END $$;

-- 7. RECONSTRUIR RPC PARA O FRONTEND (Necessário para o app funcionar)
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

-- 8. FUNÇÃO MASCARADA DO FACEBOOK
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
    WHERE fi.organization_id = ANY(public.get_my_org_ids());
END;
$$;

-- 9. PERMISSÕES FINAIS
GRANT EXECUTE ON FUNCTION public.get_my_org_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_organization_memberships() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_facebook_integrations_masked() TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;

-- REFRESH
NOTIFY pgrst, 'reload schema';
