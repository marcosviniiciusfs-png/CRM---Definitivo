-- Corrigir função get_user_details com referências de coluna qualificadas
DROP FUNCTION IF EXISTS public.get_user_details(UUID);

CREATE OR REPLACE FUNCTION public.get_user_details(_target_user_id UUID)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  last_sign_in_at TIMESTAMP WITH TIME ZONE,
  email_confirmed_at TIMESTAMP WITH TIME ZONE,
  full_name TEXT,
  avatar_url TEXT,
  job_title TEXT,
  organization_id UUID,
  organization_name TEXT,
  user_role TEXT
)
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Verificar se o usuário é super admin
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() 
    AND ur.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas super admins podem ver detalhes de usuários';
  END IF;

  -- Retornar dados completos do usuário
  RETURN QUERY
  SELECT 
    u.id AS user_id,
    u.email::TEXT,
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at,
    p.full_name,
    p.avatar_url,
    p.job_title,
    om.organization_id,
    o.name AS organization_name,
    om.role::TEXT AS user_role
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.user_id = u.id
  LEFT JOIN public.organization_members om ON om.user_id = u.id
  LEFT JOIN public.organizations o ON o.id = om.organization_id
  WHERE u.id = _target_user_id
  LIMIT 1;
END;
$$;

-- Corrigir função get_organization_members com referências de coluna qualificadas
DROP FUNCTION IF EXISTS public.get_organization_members(UUID);

CREATE OR REPLACE FUNCTION public.get_organization_members(_organization_id UUID)
RETURNS TABLE (
  member_id UUID,
  user_id UUID,
  email TEXT,
  role TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  last_sign_in_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Verificar se o usuário é super admin
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() 
    AND ur.role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas super admins podem ver membros da organização';
  END IF;

  -- Retornar membros da organização
  RETURN QUERY
  SELECT 
    om.id AS member_id,
    om.user_id,
    COALESCE(u.email::TEXT, om.email) AS email,
    om.role::TEXT,
    p.full_name,
    p.avatar_url,
    u.created_at,
    u.last_sign_in_at
  FROM public.organization_members om
  LEFT JOIN auth.users u ON u.id = om.user_id
  LEFT JOIN public.profiles p ON p.user_id = om.user_id
  WHERE om.organization_id = _organization_id
  ORDER BY om.created_at ASC;
END;
$$;