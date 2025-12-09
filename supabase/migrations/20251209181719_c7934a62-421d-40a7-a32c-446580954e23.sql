-- Drop existing SELECT policy for leads
DROP POLICY IF EXISTS "Authenticated users can view leads from their organization" ON public.leads;
DROP POLICY IF EXISTS "Users can view leads from their organization" ON public.leads;
DROP POLICY IF EXISTS "Members can only view assigned leads" ON public.leads;

-- Create new role-based SELECT policy
-- Owners and Admins can see all leads in their organization
-- Members can only see leads assigned to them
CREATE POLICY "Role-based lead visibility"
ON public.leads
FOR SELECT
TO authenticated
USING (
  -- Owners and Admins can see all leads in their organization
  (organization_id IN (
    SELECT om.organization_id
    FROM organization_members om
    WHERE om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
  ))
  OR
  -- Members can only see leads assigned to them
  (responsavel_user_id = auth.uid())
  OR
  -- Members can also see unassigned leads in their organization (for claiming)
  (
    responsavel_user_id IS NULL
    AND organization_id IN (
      SELECT om.organization_id
      FROM organization_members om
      WHERE om.user_id = auth.uid()
    )
  )
);