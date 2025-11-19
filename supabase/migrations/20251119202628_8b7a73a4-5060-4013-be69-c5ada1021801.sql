-- ============================================
-- FIX: Recursion issue in whatsapp_instances RLS policies
-- ============================================

-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Authenticated users can manage instances in their organization" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Deny public access to whatsapp instances" ON public.whatsapp_instances;

-- ============================================
-- CREATE NEW POLICIES USING SECURITY DEFINER FUNCTIONS
-- ============================================

-- SELECT: Users can view instances from their organization
CREATE POLICY "Users can view instances from their organization"
ON public.whatsapp_instances
FOR SELECT
TO authenticated
USING (
  organization_id = public.get_user_organization_id(auth.uid())
  OR user_id = auth.uid()
);

-- INSERT: Users can create instances in their organization
CREATE POLICY "Users can create instances"
ON public.whatsapp_instances
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    organization_id IS NULL 
    OR organization_id = public.get_user_organization_id(auth.uid())
  )
);

-- UPDATE: Users can update instances from their organization
CREATE POLICY "Users can update instances from their organization"
ON public.whatsapp_instances
FOR UPDATE
TO authenticated
USING (
  organization_id = public.get_user_organization_id(auth.uid())
  OR user_id = auth.uid()
);

-- DELETE: Users can delete instances from their organization
CREATE POLICY "Users can delete instances from their organization"
ON public.whatsapp_instances
FOR DELETE
TO authenticated
USING (
  organization_id = public.get_user_organization_id(auth.uid())
  OR user_id = auth.uid()
);

-- Deny public access
CREATE POLICY "Deny public access to whatsapp instances"
ON public.whatsapp_instances
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);