
-- 1. LIMPEZA AGRESSIVA DE POLÍTICAS (Prevenir erro "already exists")
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
        EXECUTE format('DROP POLICY IF EXISTS "View my org members" ON public.%I', tbl.tablename);
        EXECUTE format('DROP POLICY IF EXISTS "Access my org whatsapp" ON public.%I', tbl.tablename);
        EXECUTE format('DROP POLICY IF EXISTS "Access my org facebook" ON public.%I', tbl.tablename);
    END LOOP;
END $$;

-- 2. FUNÇÃO DE SEGURANÇA (SECURITY DEFINER) - QUEBRA RECURSÃO
CREATE OR REPLACE FUNCTION public.get_my_orgs_secure()
RETURNS SETOF UUID 
LANGUAGE sql 
SECURITY DEFINER 
SET search_path = public, auth
STABLE
AS $$
  SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid();
$$;

-- 3. RECRIAR POLÍTICAS DE ACESSO
-- ORGANIZATION MEMBERS
CREATE POLICY "Membership_Basic_Access" ON public.organization_members
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR organization_id IN (SELECT public.get_my_orgs_secure()));

-- WHATSAPP INSTANCES
CREATE POLICY "Whatsapp_Org_Access" ON public.whatsapp_instances
FOR ALL TO authenticated
USING (organization_id IN (SELECT public.get_my_orgs_secure()) OR user_id = auth.uid());

-- FACEBOOK INTEGRATIONS
CREATE POLICY "Facebook_Org_Access" ON public.facebook_integrations
FOR ALL TO authenticated
USING (organization_id IN (SELECT public.get_my_orgs_secure()));

-- 4. BYPASS PARA SUPER ADMINS
DO $$ 
DECLARE 
    tbl RECORD;
BEGIN 
    FOR tbl IN (
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' 
        AND tablename IN ('subscriptions', 'organizations', 'organization_members', 'whatsapp_instances', 'facebook_integrations', 'leads')
    ) LOOP
        EXECUTE format('CREATE POLICY "Super_Admin_Supreme_Bypass" ON public.%I FOR ALL TO authenticated 
            USING (public.has_role(auth.uid(), ''super_admin'')) 
            WITH CHECK (public.has_role(auth.uid(), ''super_admin''))', tbl.tablename);
    END LOOP;
END $$;

-- 5. PERMISSÕES FINAIS
GRANT EXECUTE ON FUNCTION public.get_my_orgs_secure() TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;

-- RECARREGAR
NOTIFY pgrst, 'reload schema';
