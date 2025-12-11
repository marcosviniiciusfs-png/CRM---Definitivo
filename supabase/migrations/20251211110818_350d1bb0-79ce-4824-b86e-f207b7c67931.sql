-- Drop existing SELECT policy that allows viewing unassigned leads
DROP POLICY IF EXISTS "Role-based lead visibility" ON public.leads;
DROP POLICY IF EXISTS "Authenticated users can view leads" ON public.leads;
DROP POLICY IF EXISTS "Users can view leads from their organization" ON public.leads;

-- Create secure RLS policy: Admins/Owners see all, Members see only assigned leads
CREATE POLICY "Secure lead visibility by role"
ON public.leads
FOR SELECT
USING (
  -- Check if user belongs to the same organization
  organization_id IN (
    SELECT om.organization_id 
    FROM organization_members om 
    WHERE om.user_id = auth.uid()
  )
  AND (
    -- Admins and Owners can see all leads in their organization
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.user_id = auth.uid()
      AND om.organization_id = leads.organization_id
      AND om.role IN ('owner', 'admin')
    )
    OR
    -- Members can only see leads assigned to them
    responsavel_user_id = auth.uid()
  )
);