-- Create table to store Facebook integration tokens and settings
CREATE TABLE public.facebook_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  page_id TEXT,
  page_name TEXT,
  page_access_token TEXT,
  ad_account_id TEXT,
  webhook_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.facebook_integrations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their organization's Facebook integrations"
  ON public.facebook_integrations FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create Facebook integrations in their organization"
  ON public.facebook_integrations FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can update their organization's Facebook integrations"
  ON public.facebook_integrations FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their organization's Facebook integrations"
  ON public.facebook_integrations FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Trigger to update updated_at
CREATE TRIGGER update_facebook_integrations_updated_at
  BEFORE UPDATE ON public.facebook_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();