-- =============================================
-- FIX: Corrigir funções que usam coluna inexistente "status"
-- A tabela organization_members usa "is_active" (boolean), não "status"
-- =============================================

-- Dropar políticas dependentes primeiro
DROP POLICY IF EXISTS "Only owners can remove members" ON public.organization_members;
DROP POLICY IF EXISTS "Owners and admins can add members" ON public.organization_members;
DROP POLICY IF EXISTS "Owners and admins can update members" ON public.organization_members;

-- Dropar função existente que tem assinatura diferente
DROP FUNCTION IF EXISTS public.get_user_organization_role(uuid);

-- 1) Recriar get_user_organization_id para usar is_active = true
CREATE OR REPLACE FUNCTION public.get_user_organization_id(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _active_org_id uuid;
  _fallback_org_id uuid;
BEGIN
  -- Primeiro: tentar pegar a organização ativa do usuário (se existir e for válida)
  SELECT uao.active_organization_id INTO _active_org_id
  FROM public.user_active_org uao
  WHERE uao.user_id = _user_id;
  
  -- Se existe uma org ativa registrada, validar que o usuário ainda é membro ativo dela
  IF _active_org_id IS NOT NULL THEN
    -- Verificar se o usuário é membro ATIVO dessa organização
    IF EXISTS (
      SELECT 1 
      FROM public.organization_members om
      WHERE om.user_id = _user_id 
        AND om.organization_id = _active_org_id 
        AND om.is_active = true
    ) THEN
      RETURN _active_org_id;
    END IF;
  END IF;
  
  -- Fallback: retornar a primeira organização ativa do usuário (ordenada por criação)
  SELECT om.organization_id INTO _fallback_org_id
  FROM public.organization_members om
  WHERE om.user_id = _user_id 
    AND om.is_active = true
  ORDER BY om.created_at ASC
  LIMIT 1;
  
  RETURN _fallback_org_id;
END;
$$;

-- 2) Criar get_user_organization_role para usar is_active = true
CREATE FUNCTION public.get_user_organization_role(_user_id uuid)
RETURNS organization_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _active_org_id uuid;
  _role organization_role;
BEGIN
  -- Primeiro: obter a organização ativa usando a função corrigida
  _active_org_id := public.get_user_organization_id(_user_id);
  
  IF _active_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Buscar o role do usuário na organização ativa
  SELECT om.role INTO _role
  FROM public.organization_members om
  WHERE om.user_id = _user_id 
    AND om.organization_id = _active_org_id 
    AND om.is_active = true;
  
  RETURN _role;
END;
$$;

-- 3) Recriar set_user_active_organization para usar is_active = true
CREATE OR REPLACE FUNCTION public.set_user_active_organization(_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_user_id uuid;
  _is_valid_member boolean;
BEGIN
  -- Obter o ID do usuário autenticado
  _current_user_id := auth.uid();
  
  IF _current_user_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Verificar se o usuário é membro ATIVO da organização solicitada
  SELECT EXISTS (
    SELECT 1 
    FROM public.organization_members om
    WHERE om.user_id = _current_user_id 
      AND om.organization_id = _org_id 
      AND om.is_active = true
  ) INTO _is_valid_member;
  
  IF NOT _is_valid_member THEN
    RETURN false;
  END IF;
  
  -- Inserir ou atualizar o registro de organização ativa
  INSERT INTO public.user_active_org (user_id, active_organization_id, updated_at)
  VALUES (_current_user_id, _org_id, now())
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    active_organization_id = EXCLUDED.active_organization_id,
    updated_at = EXCLUDED.updated_at;
  
  RETURN true;
END;
$$;

-- Garantir permissões de execução
GRANT EXECUTE ON FUNCTION public.get_user_organization_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_organization_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_active_organization(uuid) TO authenticated;

-- Recriar as políticas RLS que foram removidas
-- Policy: Only owners can remove members
CREATE POLICY "Only owners can remove members" 
ON public.organization_members 
FOR DELETE 
TO authenticated
USING (
  organization_id IN (
    SELECT om.organization_id 
    FROM public.organization_members om 
    WHERE om.user_id = auth.uid() 
      AND om.role = 'owner'
      AND om.is_active = true
  )
);

-- Policy: Owners and admins can add members
CREATE POLICY "Owners and admins can add members" 
ON public.organization_members 
FOR INSERT 
TO authenticated
WITH CHECK (
  organization_id IN (
    SELECT om.organization_id 
    FROM public.organization_members om 
    WHERE om.user_id = auth.uid() 
      AND om.role IN ('owner', 'admin')
      AND om.is_active = true
  )
);

-- Policy: Owners and admins can update members
CREATE POLICY "Owners and admins can update members" 
ON public.organization_members 
FOR UPDATE 
TO authenticated
USING (
  organization_id IN (
    SELECT om.organization_id 
    FROM public.organization_members om 
    WHERE om.user_id = auth.uid() 
      AND om.role IN ('owner', 'admin')
      AND om.is_active = true
  )
);