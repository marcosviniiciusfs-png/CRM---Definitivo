-- Create enum for organization roles
CREATE TYPE public.organization_role AS ENUM ('owner', 'admin', 'member');

-- Create organizations table
CREATE TABLE public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create organization_members table
CREATE TABLE public.organization_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role organization_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

-- Enable RLS on new tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Create security definer function to get user's organization
CREATE OR REPLACE FUNCTION public.get_user_organization_id(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = _user_id
  LIMIT 1;
$$;

-- Create security definer function to check if user is in same organization
CREATE OR REPLACE FUNCTION public.is_same_organization(_user_id UUID, _organization_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id = _user_id
      AND organization_id = _organization_id
  );
$$;

-- Add organization_id to leads table
ALTER TABLE public.leads ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Create index for better performance
CREATE INDEX idx_leads_organization_id ON public.leads(organization_id);
CREATE INDEX idx_organization_members_user_id ON public.organization_members(user_id);
CREATE INDEX idx_organization_members_org_id ON public.organization_members(organization_id);

-- RLS Policies for organizations
CREATE POLICY "Users can view their organization"
  ON public.organizations
  FOR SELECT
  USING (id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update their organization"
  ON public.organizations
  FOR UPDATE
  USING (id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- RLS Policies for organization_members
CREATE POLICY "Users can view members of their organization"
  ON public.organization_members
  FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Owners and admins can insert members"
  ON public.organization_members
  FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE POLICY "Owners and admins can update members"
  ON public.organization_members
  FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE POLICY "Owners and admins can delete members"
  ON public.organization_members
  FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- Drop existing RLS policies on leads table
DROP POLICY IF EXISTS "Usuários autenticados podem ver todos os leads" ON public.leads;
DROP POLICY IF EXISTS "Usuários autenticados podem criar leads" ON public.leads;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar leads" ON public.leads;
DROP POLICY IF EXISTS "Usuários autenticados podem deletar leads" ON public.leads;

-- Create new RLS policies for leads based on organization
CREATE POLICY "Users can view leads in their organization"
  ON public.leads
  FOR SELECT
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
  );

CREATE POLICY "Users can create leads in their organization"
  ON public.leads
  FOR INSERT
  WITH CHECK (
    organization_id = public.get_user_organization_id(auth.uid())
  );

CREATE POLICY "Users can update leads in their organization"
  ON public.leads
  FOR UPDATE
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
  );

CREATE POLICY "Users can delete leads in their organization"
  ON public.leads
  FOR DELETE
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
  );

-- Drop existing RLS policies on mensagens_chat table
DROP POLICY IF EXISTS "Usuários autenticados podem ver todas as mensagens" ON public.mensagens_chat;
DROP POLICY IF EXISTS "Usuários autenticados podem criar mensagens" ON public.mensagens_chat;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar mensagens" ON public.mensagens_chat;
DROP POLICY IF EXISTS "Usuários autenticados podem deletar mensagens" ON public.mensagens_chat;

-- Create new RLS policies for mensagens_chat based on organization
CREATE POLICY "Users can view messages from their organization leads"
  ON public.mensagens_chat
  FOR SELECT
  USING (
    id_lead IN (
      SELECT id FROM public.leads WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  );

CREATE POLICY "Users can create messages for their organization leads"
  ON public.mensagens_chat
  FOR INSERT
  WITH CHECK (
    id_lead IN (
      SELECT id FROM public.leads WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  );

CREATE POLICY "Users can update messages from their organization leads"
  ON public.mensagens_chat
  FOR UPDATE
  USING (
    id_lead IN (
      SELECT id FROM public.leads WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  );

CREATE POLICY "Users can delete messages from their organization leads"
  ON public.mensagens_chat
  FOR DELETE
  USING (
    id_lead IN (
      SELECT id FROM public.leads WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  );

-- Create function to auto-create organization on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id UUID;
BEGIN
  -- Create a new organization for the user
  INSERT INTO public.organizations (name)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'name', NEW.email) || '''s Organization')
  RETURNING id INTO new_org_id;
  
  -- Add user as owner of the organization
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'owner');
  
  RETURN NEW;
END;
$$;

-- Create trigger to auto-create organization on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Create function to auto-set organization_id on lead creation
CREATE OR REPLACE FUNCTION public.set_lead_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Set the organization_id to the user's organization
  NEW.organization_id := public.get_user_organization_id(auth.uid());
  RETURN NEW;
END;
$$;

-- Create trigger to auto-set organization_id on lead creation
DROP TRIGGER IF EXISTS on_lead_created ON public.leads;
CREATE TRIGGER on_lead_created
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_lead_organization();

-- Update trigger for updated_at on organizations
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();