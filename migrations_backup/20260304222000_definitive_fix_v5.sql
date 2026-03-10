
-- ============================================================
-- DEFINITIVE RLS RECURSION FIX (V5)
-- ============================================================

-- 1. DESATIVAR RLS PARA LIMPEZA (Garante que o script rode sem travar)
ALTER TABLE public.organization_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_instances DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_integrations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations DISABLE ROW LEVEL SECURITY;

-- 2. APAGAR TUDO QUE PODE ESTAR CAUSANDO O LOOP
DROP POLICY IF EXISTS "Membership_Basic_Access" ON public.organization_members;
DROP POLICY IF EXISTS "Membership_Core_Access" ON public.organization_members;
DROP POLICY IF EXISTS "Org_Members_Simple_Access" ON public.organization_members;
DROP POLICY IF EXISTS "Colleagues access" ON public.organization_members;
DROP POLICY IF EXISTS "View my org members" ON public.organization_members;

DROP POLICY IF EXISTS "Whatsapp_Org_Access" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "WhatsApp_Core_Access" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "WhatsApp_Simple_Access" ON public.whatsapp_instances;

DROP POLICY IF EXISTS "Facebook_Org_Access" ON public.facebook_integrations;
DROP POLICY IF EXISTS "Facebook_Core_Access" ON public.facebook_integrations;
DROP POLICY IF EXISTS "Facebook_Simple_Access" ON public.facebook_integrations;

DROP POLICY IF EXISTS "Super_Admin_Supreme_Bypass" ON public.organization_members;
DROP POLICY IF EXISTS "Super_Admin_Supreme_Bypass" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Super_Admin_Supreme_Bypass" ON public.facebook_integrations;
DROP POLICY IF EXISTS "Super_Admin_Supreme_Bypass" ON public.organizations;
DROP POLICY IF EXISTS "Super_Admin_Supreme_Bypass" ON public.leads;
DROP POLICY IF EXISTS "Super_Admin_Supreme_Bypass" ON public.subscriptions;

-- 3. FUNÇÕES SECURITY DEFINER (PL/PGSQL) - Única forma de quebrar a recursão 100%
-- Ela roda como 'postgres' (owner) e ignora RLS da tabela consultada internamente.

CREATE OR REPLACE FUNCTION public.get_my_org_ids_raw()
RETURNS UUID[] 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public, auth
STABLE
AS $$
DECLARE
    _org_ids UUID[];
BEGIN
    SELECT array_agg(organization_id) INTO _org_ids
    FROM public.organization_members
    WHERE user_id = auth.uid();
    RETURN COALESCE(_org_ids, ARRAY[]::UUID[]);
END;
$$;

-- 4. REATIVAR RLS COM POLÍTICAS NÃO-RECURSIVAS
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ORGANIZATION MEMBERS: Regra mais simples possível
-- "Você vê seu próprio registro e registros de orgs que você pertence (via função SD)"
CREATE POLICY "Membership_Safe_Access" ON public.organization_members
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR organization_id = ANY(public.get_my_org_ids_raw()));

-- WHATSAPP & FACEBOOK: Acesso via função SD
CREATE POLICY "Whatsapp_Safe_Access" ON public.whatsapp_instances
FOR ALL TO authenticated
USING (organization_id = ANY(public.get_my_org_ids_raw()) OR user_id = auth.uid());

CREATE POLICY "Facebook_Safe_Access" ON public.facebook_integrations
FOR ALL TO authenticated
USING (organization_id = ANY(public.get_my_org_ids_raw()));

-- ORGANIZATIONS
CREATE POLICY "Organizations_Safe_Access" ON public.organizations
FOR SELECT TO authenticated
USING (id = ANY(public.get_my_org_ids_raw()));

-- LEADS
CREATE POLICY "Leads_Safe_Access" ON public.leads
FOR ALL TO authenticated
USING (organization_id = ANY(public.get_my_org_ids_raw()));

-- 5. RPCs PARA O FRONTEND (Garante que o app funcione)
DROP FUNCTION IF EXISTS public.get_my_organization_memberships();
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

-- 6. BYPASS PARA SUPER ADMIN (Sempre no topo, usando a função has_role que é segura)
DO $$ 
DECLARE 
    tbl RECORD;
BEGIN 
    FOR tbl IN (
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' 
        AND tablename IN ('subscriptions', 'organizations', 'organization_members', 'whatsapp_instances', 'facebook_integrations', 'leads')
    ) LOOP
        EXECUTE format('CREATE POLICY "Super_Admin_Bypass_v5" ON public.%I FOR ALL TO authenticated 
            USING (public.has_role(auth.uid(), ''super_admin''))', tbl.tablename);
    END LOOP;
END $$;

-- 7. REPARAR FUNÇÃO MASCARADA (Essencial para a tela de integrações)
DROP FUNCTION IF EXISTS public.get_facebook_integrations_masked();
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
    WHERE fi.organization_id = ANY(public.get_my_org_ids_raw());
END;
$$;

-- 8. PERMISSÕES FINAIS
GRANT EXECUTE ON FUNCTION public.get_my_org_ids_raw() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_organization_memberships() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_facebook_integrations_masked() TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;

-- RECARREGAR REST
NOTIFY pgrst, 'reload schema';
