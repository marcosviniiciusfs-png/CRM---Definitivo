
-- 1. Permitir que super admins visualizem todas as assinaturas
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'subscriptions' 
        AND policyname = 'Super admins can select subscriptions'
    ) THEN
        CREATE POLICY "Super admins can select subscriptions"
        ON public.subscriptions
        FOR SELECT
        TO authenticated
        USING (public.has_role(auth.uid(), 'super_admin'));
    END IF;
END $$;

-- 2. Atualizar a função get_user_details para priorizar a organização onde o usuário é owner
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

  -- Retornar dados completos do usuário, priorizando owner role
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
  ORDER BY 
    CASE WHEN om.role = 'owner' THEN 0 ELSE 1 END,
    om.created_at ASC
  LIMIT 1;
END;
$$;
