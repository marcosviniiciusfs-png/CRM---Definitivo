
-- Migration to fix admin subscription management
-- This migration ensures super_admins can manage subscriptions for ANY user (owner or not)

-- 1. Redefine the RPC function to be more robust and ensure it exists with correct parameters
CREATE OR REPLACE FUNCTION public.admin_manage_user_subscription(
    p_user_id UUID,
    p_plan_id TEXT,
    p_organization_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER -- Runs with superuser privileges, bypasses RLS
SET search_path = public, auth
AS $$
DECLARE
    v_admin_id UUID;
    v_exists BOOLEAN;
    v_user_role TEXT;
BEGIN
    -- Get caller ID
    v_admin_id := auth.uid();

    -- Safety check: caller must be super_admin in user_roles
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = v_admin_id AND role = 'super_admin'::public.app_role
    ) THEN
        RETURN jsonb_build_object('status', 'error', 'message', 'Acesso negado: apenas para super administradores.');
    END IF;

    -- If plan is 'none', remove the subscription
    IF p_plan_id = 'none' THEN
        DELETE FROM public.subscriptions WHERE user_id = p_user_id;
        RETURN jsonb_build_object('status', 'success', 'message', 'Assinatura removida', 'action', 'deleted');
    ELSE
        -- Check if it already exists
        SELECT EXISTS(SELECT 1 FROM public.subscriptions WHERE user_id = p_user_id) INTO v_exists;

        IF v_exists THEN
            -- Update existing subscription
            UPDATE public.subscriptions 
            SET 
                plan_id = p_plan_id,
                status = 'authorized',
                amount = 0,
                -- Preserve organization_id if not provided, or update it
                organization_id = COALESCE(p_organization_id, organization_id),
                updated_at = now()
            WHERE user_id = p_user_id;
            
            RETURN jsonb_build_object('status', 'success', 'message', 'Plano atualizado', 'plan', p_plan_id, 'action', 'updated');
        ELSE
            -- Insert new subscription
            INSERT INTO public.subscriptions (
                user_id, 
                plan_id, 
                status, 
                amount, 
                organization_id, 
                start_date, 
                updated_at
            )
            VALUES (
                p_user_id,
                p_plan_id,
                'authorized',
                0,
                p_organization_id,
                now(),
                now()
            );
            
            RETURN jsonb_build_object('status', 'success', 'message', 'Plano criado', 'plan', p_plan_id, 'action', 'inserted');
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

-- Ensure execution permission
GRANT EXECUTE ON FUNCTION public.admin_manage_user_subscription(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_manage_user_subscription(UUID, TEXT, UUID) TO service_role;

-- 2. Cleanup and Re-apply RLS Policies for super_admin
-- We use a very broad policy to ensure admins are never blocked by owner-specific rules
DROP POLICY IF EXISTS "Super Admin Select All" ON public.subscriptions;
DROP POLICY IF EXISTS "Super Admin Insert All" ON public.subscriptions;
DROP POLICY IF EXISTS "Super Admin Update All" ON public.subscriptions;
DROP POLICY IF EXISTS "Super Admin Delete All" ON public.subscriptions;
DROP POLICY IF EXISTS "Super admins can select subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Super admins can insert subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Super admins can update subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Super admins can delete subscriptions" ON public.subscriptions;

-- Unified permissive policy for super_admin
CREATE POLICY "Super Admin Full Access" ON public.subscriptions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- 3. Ensure has_role is robust
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 4. Create another helper specifically for checking super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = p_user_id
      AND role = 'super_admin'::public.app_role
  )
$$;

-- 5. Allow super admins to see all organizations (needed for FK checks in some contexts)
DROP POLICY IF EXISTS "Super Admin View All Organizations" ON public.organizations;
CREATE POLICY "Super Admin View All Organizations" ON public.organizations
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));
