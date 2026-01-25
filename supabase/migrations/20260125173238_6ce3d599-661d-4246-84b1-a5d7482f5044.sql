-- Criar função RPC para retornar todas as organizações do usuário autenticado
-- Esta função usa SECURITY DEFINER para contornar as políticas RLS que limitam o SELECT
CREATE OR REPLACE FUNCTION public.get_my_organization_memberships()
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  role organization_role,
  is_owner boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    om.organization_id,
    o.name as organization_name,
    om.role,
    (om.role = 'owner') as is_owner
  FROM organization_members om
  JOIN organizations o ON o.id = om.organization_id
  WHERE om.user_id = auth.uid()
    AND om.is_active = true
  ORDER BY (om.role = 'owner') DESC, o.name;
END;
$$;

-- Criar função RPC para obter o owner de uma organização específica (para verificação de assinatura)
-- Retorna o user_id do owner da organização
CREATE OR REPLACE FUNCTION public.get_organization_owner(p_organization_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_user_id uuid;
BEGIN
  -- Primeiro verificar se o usuário autenticado é membro dessa organização
  IF NOT EXISTS (
    SELECT 1 FROM organization_members 
    WHERE organization_id = p_organization_id 
    AND user_id = auth.uid() 
    AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Usuário não é membro desta organização';
  END IF;

  -- Buscar o owner da organização
  SELECT om.user_id INTO owner_user_id
  FROM organization_members om
  WHERE om.organization_id = p_organization_id
    AND om.role = 'owner'
    AND om.is_active = true
  LIMIT 1;
  
  RETURN owner_user_id;
END;
$$;