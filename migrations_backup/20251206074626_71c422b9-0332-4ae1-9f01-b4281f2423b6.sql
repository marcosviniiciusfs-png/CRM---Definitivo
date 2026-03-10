-- Drop the current SELECT policy that allows all members
DROP POLICY IF EXISTS "Users can view their organization's Facebook integrations" ON public.facebook_integrations;

-- Create a new SELECT policy that only allows owners/admins
CREATE POLICY "Only owners and admins can view Facebook integrations"
ON public.facebook_integrations
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id 
    FROM public.organization_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Also restrict UPDATE to owners/admins only
DROP POLICY IF EXISTS "Users can update their organization's Facebook integrations" ON public.facebook_integrations;

CREATE POLICY "Only owners and admins can update Facebook integrations"
ON public.facebook_integrations
FOR UPDATE
USING (
  organization_id IN (
    SELECT organization_id 
    FROM public.organization_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Also restrict DELETE to owners/admins only
DROP POLICY IF EXISTS "Users can delete their organization's Facebook integrations" ON public.facebook_integrations;

CREATE POLICY "Only owners and admins can delete Facebook integrations"
ON public.facebook_integrations
FOR DELETE
USING (
  organization_id IN (
    SELECT organization_id 
    FROM public.organization_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Restrict INSERT to owners/admins only
DROP POLICY IF EXISTS "Users can create Facebook integrations in their organization" ON public.facebook_integrations;

CREATE POLICY "Only owners and admins can create Facebook integrations"
ON public.facebook_integrations
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id 
    FROM public.organization_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
  AND user_id = auth.uid()
);