-- Recriar função list_all_users com acesso correto ao auth schema
DROP FUNCTION IF EXISTS public.list_all_users();

CREATE OR REPLACE FUNCTION public.list_all_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  last_sign_in_at TIMESTAMP WITH TIME ZONE,
  email_confirmed_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Verificar se o usuário que está chamando é super admin
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas super admins podem listar usuários';
  END IF;

  -- Retornar dados dos usuários da tabela auth.users
  RETURN QUERY
  SELECT 
    u.id,
    u.email::TEXT,
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at
  FROM auth.users u
  ORDER BY u.created_at DESC;
END;
$$;