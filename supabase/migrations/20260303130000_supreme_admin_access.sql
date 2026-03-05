
-- SUPREME ADMIN ACCESS RESTORATION
-- TARGET: mateusabcck@gmail.com

DO $$
DECLARE
    v_user_id UUID;
BEGIN
    -- 1. Find the user ID
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'mateusabcck@gmail.com';
    
    IF v_user_id IS NULL THEN
        RAISE NOTICE 'Usuário não encontrado!';
    ELSE
        -- 2. Ensure super_admin role
        INSERT INTO public.user_roles (user_id, role)
        VALUES (v_user_id, 'super_admin')
        ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin';
        
        -- 3. Ensure the user has an organization (if they don't already)
        -- This ensures they can pass the "isReady" check in the frontend
        IF NOT EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = v_user_id) THEN
            DECLARE
                v_org_id UUID;
            BEGIN
                INSERT INTO public.organizations (name)
                VALUES ('Mateus Supreme Admin Org')
                RETURNING id INTO v_org_id;
                
                INSERT INTO public.organization_members (organization_id, user_id, role)
                VALUES (v_org_id, v_user_id, 'owner');
            END;
        END IF;

        -- 4. Give supreme plan (Elite) to bypass payment screens
        -- And set it to authorized/0 to ensure it's "subscribed"
        INSERT INTO public.subscriptions (user_id, plan_id, status, amount, start_date)
        VALUES (v_user_id, 'elite', 'authorized', 0, now())
        ON CONFLICT (user_id) DO UPDATE SET 
            plan_id = 'elite', 
            status = 'authorized', 
            amount = 0;

        RAISE NOTICE 'Poder Supremo concedido a mateusabcck@gmail.com';
    END IF;
END $$;

-- 5. Bypass RLS for Super Admins on ALL critical tables
-- This ensures that even if a policy is restrictive, the Super Admin can still work
DO $$ 
DECLARE 
    tbl RECORD;
BEGIN 
    FOR tbl IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename IN ('subscriptions', 'organizations', 'organization_members', 'user_roles', 'profiles', 'user_section_access')
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Super_Admin_Bypass_All" ON public.%I', tbl.tablename);
        EXECUTE format('CREATE POLICY "Super_Admin_Bypass_All" ON public.%I FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()))', tbl.tablename);
    END LOOP;
END $$;
