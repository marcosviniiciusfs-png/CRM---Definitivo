-- FINAL CONSOLIDATED REPAIR V4
-- This migration ensures ALL critical components for Admin Panel and Collaborators are present in production.

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. TABLES
CREATE TABLE IF NOT EXISTS public.admin_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.organization_custom_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6B7280',
  can_view_kanban BOOLEAN DEFAULT true,
  can_create_tasks BOOLEAN DEFAULT false,
  can_edit_own_tasks BOOLEAN DEFAULT true,
  can_edit_all_tasks BOOLEAN DEFAULT false,
  can_delete_tasks BOOLEAN DEFAULT false,
  can_view_all_leads BOOLEAN DEFAULT false,
  can_view_assigned_leads BOOLEAN DEFAULT true,
  can_create_leads BOOLEAN DEFAULT false,
  can_edit_leads BOOLEAN DEFAULT false,
  can_delete_leads BOOLEAN DEFAULT false,
  can_assign_leads BOOLEAN DEFAULT false,
  can_view_pipeline BOOLEAN DEFAULT true,
  can_move_leads_pipeline BOOLEAN DEFAULT false,
  can_view_chat BOOLEAN DEFAULT true,
  can_send_messages BOOLEAN DEFAULT true,
  can_view_all_conversations BOOLEAN DEFAULT false,
  can_manage_collaborators BOOLEAN DEFAULT false,
  can_manage_integrations BOOLEAN DEFAULT false,
  can_manage_tags BOOLEAN DEFAULT false,
  can_manage_automations BOOLEAN DEFAULT false,
  can_view_reports BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, name)
);

CREATE TABLE IF NOT EXISTS public.kanban_card_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.kanban_cards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  assigned_at timestamp with time zone DEFAULT now() NOT NULL,
  assigned_by uuid,
  UNIQUE (card_id, user_id)
);

-- 3. COLUMNS
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'organization_members' AND column_name = 'custom_role_id') THEN
    ALTER TABLE public.organization_members ADD COLUMN custom_role_id UUID REFERENCES public.organization_custom_roles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. BASIC ADMIN FUNCTIONS
CREATE OR REPLACE FUNCTION public.validate_admin_token(p_token TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.admin_sessions WHERE token = p_token AND expires_at > NOW());
END $$;

CREATE OR REPLACE FUNCTION public.check_admin_password(p_email TEXT, p_password TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_hash TEXT;
BEGIN
  SELECT password_hash INTO v_hash FROM public.admin_credentials WHERE email = lower(p_email);
  IF v_hash IS NULL THEN RETURN false; END IF;
  RETURN v_hash = crypt(p_password, v_hash);
END $$;

CREATE OR REPLACE FUNCTION public.admin_login_system(p_email TEXT, p_password TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_hash TEXT; v_token TEXT;
BEGIN
  SELECT password_hash INTO v_hash FROM public.admin_credentials WHERE email = lower(trim(p_email));
  IF NOT FOUND OR v_hash != crypt(p_password, v_hash) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email ou senha invalidos');
  END IF;
  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.admin_sessions (admin_email, token, expires_at)
  VALUES (lower(trim(p_email)), v_token, NOW() + INTERVAL '8 hours');
  RETURN jsonb_build_object('success', true, 'token', v_token, 'email', lower(trim(p_email)));
END $$;

-- 5. SAFE PROXY RPC FUNCTIONS
CREATE OR REPLACE FUNCTION public.safe_list_admins(p_token TEXT)
RETURNS TABLE(email TEXT, created_at TIMESTAMPTZ) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN QUERY SELECT ac.email, ac.created_at FROM public.admin_credentials ac;
END $$;

CREATE OR REPLACE FUNCTION public.safe_get_user_details(p_token TEXT, user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_res JSONB;
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  -- Basic user profile info from public.profiles
  SELECT jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'full_name', p.full_name,
    'avatar_url', p.avatar_url,
    'created_at', p.created_at
  ) INTO v_res FROM public.profiles p WHERE p.id = user_id;
  RETURN v_res;
END $$;

CREATE OR REPLACE FUNCTION public.safe_get_user_subscription(p_token TEXT, user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_sub RECORD;
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT s.status, s.plan_id, s.user_id AS uid, s.organization_id INTO v_sub FROM public.subscriptions s WHERE s.user_id = safe_get_user_subscription.user_id AND s.status = 'authorized' ORDER BY s.created_at DESC LIMIT 1;
  IF v_sub IS NULL THEN
    SELECT s.status, s.plan_id, s.user_id AS uid, s.organization_id INTO v_sub FROM public.subscriptions s JOIN public.organization_members om ON om.organization_id = s.organization_id WHERE om.user_id = safe_get_user_subscription.user_id AND s.status = 'authorized' ORDER BY s.created_at DESC LIMIT 1;
  END IF;
  IF v_sub IS NULL THEN RETURN jsonb_build_object('status', 'none', 'plan_id', NULL, 'user_id', user_id); END IF;
  RETURN jsonb_build_object('status', v_sub.status, 'plan_id', v_sub.plan_id, 'user_id', v_sub.uid, 'organization_id', v_sub.organization_id);
END $$;

CREATE OR REPLACE FUNCTION public.safe_manage_user_subscription(p_token TEXT, p_user_id UUID, p_plan_id TEXT, p_organization_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_org_id UUID;
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN RETURN jsonb_build_object('status', 'error', 'message', 'Unauthorized'); END IF;
  v_org_id := p_organization_id;
  IF v_org_id IS NULL THEN SELECT organization_id INTO v_org_id FROM public.organization_members WHERE user_id = p_user_id LIMIT 1; END IF;
  IF p_plan_id = 'none' OR p_plan_id IS NULL THEN
    DELETE FROM public.subscriptions WHERE user_id = p_user_id;
    RETURN jsonb_build_object('status', 'success', 'message', 'Plano removido');
  ELSE
    DELETE FROM public.subscriptions WHERE user_id = p_user_id;
    INSERT INTO public.subscriptions (user_id, plan_id, status, amount, organization_id, start_date, updated_at)
    VALUES (p_user_id, p_plan_id, 'authorized', 0, v_org_id, now(), now());
    RETURN jsonb_build_object('status', 'success', 'message', 'Plano atualizado para: ' || p_plan_id);
  END IF;
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_email(p_email TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
  RETURN v_user_id;
END $$;

-- Enable RLS
ALTER TABLE public.organization_custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_card_assignees ENABLE ROW LEVEL SECURITY;

-- RLS for organization_custom_roles
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view custom roles in their org" ON public.organization_custom_roles;
  CREATE POLICY "Users can view custom roles in their org" ON public.organization_custom_roles
  FOR SELECT TO authenticated USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));

  DROP POLICY IF EXISTS "Only owners can create custom roles" ON public.organization_custom_roles;
  CREATE POLICY "Only owners can create custom roles" ON public.organization_custom_roles
  FOR INSERT TO authenticated WITH CHECK (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role = 'owner'));
END $$;

-- RLS for kanban_card_assignees
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view assignees from their organization" ON public.kanban_card_assignees;
  CREATE POLICY "Users can view assignees from their organization" ON public.kanban_card_assignees
  FOR SELECT TO authenticated USING (card_id IN (SELECT id FROM kanban_cards WHERE column_id IN (SELECT id FROM kanban_columns WHERE board_id IN (SELECT id FROM kanban_boards WHERE organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())))));

  DROP POLICY IF EXISTS "Users can create assignees in their organization" ON public.kanban_card_assignees;
  CREATE POLICY "Users can create assignees in their organization" ON public.kanban_card_assignees
  FOR INSERT TO authenticated WITH CHECK (card_id IN (SELECT id FROM kanban_cards WHERE column_id IN (SELECT id FROM kanban_columns WHERE board_id IN (SELECT id FROM kanban_boards WHERE organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())))));
END $$;

-- 6. PERMISSIONS
GRANT EXECUTE ON FUNCTION public.admin_login_system(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_admin_token(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_admin_password(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.safe_list_admins(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.safe_get_user_details(TEXT, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.safe_get_user_subscription(TEXT, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.safe_manage_user_subscription(TEXT, UUID, TEXT, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_auth_user_id_by_email(TEXT) TO service_role;

-- 7. BOOTSTRAP ADMIN
-- Ensure 'mateusabcck@gmail.com' exists with password 'britO151515@'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_credentials WHERE email = 'mateusabcck@gmail.com') THEN
    INSERT INTO public.admin_credentials (email, password_hash)
    VALUES ('mateusabcck@gmail.com', crypt('britO151515@', gen_salt('bf', 10)));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
