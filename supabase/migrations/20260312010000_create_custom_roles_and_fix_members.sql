-- Cria a tabela de cargos personalizados e adiciona custom_role_id em organization_members
-- Esta migration corrige o que a 20260311000000_final_fix_v2.sql não aplicou corretamente

-- 1. Extensão necessária para funções de criptografia (admin panel)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Criar tabela de cargos personalizados
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

-- 3. Adicionar custom_role_id em organization_members (FK para organization_custom_roles)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organization_members'
      AND column_name = 'custom_role_id'
  ) THEN
    ALTER TABLE public.organization_members
      ADD COLUMN custom_role_id UUID REFERENCES public.organization_custom_roles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Criar tabela admin_credentials se não existir
CREATE TABLE IF NOT EXISTS public.admin_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Criar tabela admin_sessions se não existir
CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Habilitar RLS nas novas tabelas
ALTER TABLE public.organization_custom_roles ENABLE ROW LEVEL SECURITY;

-- 7. Políticas RLS para organization_custom_roles
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view custom roles in their org" ON public.organization_custom_roles;
  CREATE POLICY "Users can view custom roles in their org" ON public.organization_custom_roles
    FOR SELECT TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    ));

  DROP POLICY IF EXISTS "Only owners can create custom roles" ON public.organization_custom_roles;
  CREATE POLICY "Only owners can create custom roles" ON public.organization_custom_roles
    FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role = 'owner'
    ));

  DROP POLICY IF EXISTS "Only owners can update custom roles" ON public.organization_custom_roles;
  CREATE POLICY "Only owners can update custom roles" ON public.organization_custom_roles
    FOR UPDATE TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role = 'owner'
    ));

  DROP POLICY IF EXISTS "Only owners can delete custom roles" ON public.organization_custom_roles;
  CREATE POLICY "Only owners can delete custom roles" ON public.organization_custom_roles
    FOR DELETE TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role = 'owner'
    ));
END $$;

-- 8. Funções necessárias para o sistema admin e para criação de colaboradores
CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_email(p_email TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1;
  RETURN v_user_id;
END $$;

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

-- 9. Grants
GRANT EXECUTE ON FUNCTION public.get_auth_user_id_by_email(TEXT) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_admin_token(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_admin_password(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_login_system(TEXT, TEXT) TO anon, authenticated, service_role;

-- 10. Bootstrap admin
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_credentials WHERE email = 'mateusabcck@gmail.com') THEN
    INSERT INTO public.admin_credentials (email, password_hash)
      VALUES ('mateusabcck@gmail.com', crypt('britO151515@', gen_salt('bf', 10)));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
