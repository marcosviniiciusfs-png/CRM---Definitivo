-- Create table for Meta Pixel/Conversions API integrations
CREATE TABLE public.meta_pixel_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  funnel_id UUID NOT NULL REFERENCES public.sales_funnels(id) ON DELETE CASCADE,
  pixel_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, funnel_id)
);

-- Enable RLS
ALTER TABLE public.meta_pixel_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Deny public access to meta pixel integrations"
ON public.meta_pixel_integrations
AS RESTRICTIVE
FOR ALL
USING (false);

CREATE POLICY "Users can view their organization's pixel integrations"
ON public.meta_pixel_integrations
FOR SELECT
USING (organization_id IN (
  SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
));

CREATE POLICY "Admins can create pixel integrations"
ON public.meta_pixel_integrations
FOR INSERT
WITH CHECK (organization_id IN (
  SELECT organization_id FROM organization_members 
  WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
));

CREATE POLICY "Admins can update pixel integrations"
ON public.meta_pixel_integrations
FOR UPDATE
USING (organization_id IN (
  SELECT organization_id FROM organization_members 
  WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
));

CREATE POLICY "Admins can delete pixel integrations"
ON public.meta_pixel_integrations
FOR DELETE
USING (organization_id IN (
  SELECT organization_id FROM organization_members 
  WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
));

-- Trigger for updated_at
CREATE TRIGGER update_meta_pixel_integrations_updated_at
BEFORE UPDATE ON public.meta_pixel_integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();