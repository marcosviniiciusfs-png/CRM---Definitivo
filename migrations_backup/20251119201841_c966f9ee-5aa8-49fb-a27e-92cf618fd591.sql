-- ============================================
-- FIX: Infinite recursion in organization_members RLS policies
-- ============================================

-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Authenticated users can view members of their organization" ON public.organization_members;
DROP POLICY IF EXISTS "Authenticated owners and admins can insert members" ON public.organization_members;
DROP POLICY IF EXISTS "Authenticated owners and admins can update members" ON public.organization_members;
DROP POLICY IF EXISTS "Authenticated owners and admins can delete members" ON public.organization_members;

-- ============================================
-- CREATE NEW POLICIES USING SECURITY DEFINER FUNCTIONS
-- ============================================

-- SELECT: Users can view members from their organization
-- Uses get_user_organization_id to avoid recursion
CREATE POLICY "Users can view members from their organization"
ON public.organization_members
FOR SELECT
TO authenticated
USING (
  organization_id = public.get_user_organization_id(auth.uid())
);

-- INSERT: Only owners and admins can add members
-- Uses get_user_organization_role to check permissions without recursion
CREATE POLICY "Owners and admins can add members"
ON public.organization_members
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.get_user_organization_role(auth.uid()) AS role_info
    WHERE role_info.organization_id = organization_members.organization_id
      AND role_info.role IN ('owner', 'admin')
  )
);

-- UPDATE: Only owners and admins can update members
CREATE POLICY "Owners and admins can update members"
ON public.organization_members
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.get_user_organization_role(auth.uid()) AS role_info
    WHERE role_info.organization_id = organization_members.organization_id
      AND role_info.role IN ('owner', 'admin')
  )
);

-- DELETE: Only owners and admins can remove members
CREATE POLICY "Owners and admins can remove members"
ON public.organization_members
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.get_user_organization_role(auth.uid()) AS role_info
    WHERE role_info.organization_id = organization_members.organization_id
      AND role_info.role IN ('owner', 'admin')
  )
);