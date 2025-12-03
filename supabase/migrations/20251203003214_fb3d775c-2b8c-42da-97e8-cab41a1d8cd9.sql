-- Remove all existing RLS policies on meta_pixel_integrations
DROP POLICY IF EXISTS "Deny public access to meta pixel integrations" ON public.meta_pixel_integrations;
DROP POLICY IF EXISTS "Users can view their organization's pixel integrations" ON public.meta_pixel_integrations;
DROP POLICY IF EXISTS "Admins can create pixel integrations" ON public.meta_pixel_integrations;
DROP POLICY IF EXISTS "Admins can update pixel integrations" ON public.meta_pixel_integrations;
DROP POLICY IF EXISTS "Admins can delete pixel integrations" ON public.meta_pixel_integrations;

-- Create new PERMISSIVE policies (default behavior)
CREATE POLICY "Users can view org pixel integrations"
ON public.meta_pixel_integrations
FOR SELECT
TO authenticated
USING (organization_id IN (
  SELECT organization_id FROM public.organization_members 
  WHERE user_id = auth.uid()
));

CREATE POLICY "Admins owners can insert pixel integrations"
ON public.meta_pixel_integrations
FOR INSERT
TO authenticated
WITH CHECK (organization_id IN (
  SELECT organization_id FROM public.organization_members 
  WHERE user_id = auth.uid() 
  AND role IN ('owner', 'admin')
));

CREATE POLICY "Admins owners can update pixel integrations"
ON public.meta_pixel_integrations
FOR UPDATE
TO authenticated
USING (organization_id IN (
  SELECT organization_id FROM public.organization_members 
  WHERE user_id = auth.uid() 
  AND role IN ('owner', 'admin')
));

CREATE POLICY "Admins owners can delete pixel integrations"
ON public.meta_pixel_integrations
FOR DELETE
TO authenticated
USING (organization_id IN (
  SELECT organization_id FROM public.organization_members 
  WHERE user_id = auth.uid() 
  AND role IN ('owner', 'admin')
));