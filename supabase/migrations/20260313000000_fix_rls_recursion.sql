-- CORREÇÃO: Remove políticas RLS recursivas da tabela organization_members
-- e substitui por políticas seguras usando security definer function

-- 1. Remove todas as políticas problemáticas (IF EXISTS para ser idempotente)
DROP POLICY IF EXISTS "Members can view their organization members" ON public.organization_members;
DROP POLICY IF EXISTS "Owners and admins can add members" ON public.organization_members;
DROP POLICY IF EXISTS "Owners and admins can update members" ON public.organization_members;
DROP POLICY IF EXISTS "Only owners can delete members" ON public.organization_members;

-- 2. Remove funções existentes (que podem ter nomes de parâmetros diferentes)
DROP FUNCTION IF EXISTS public.get_user_organization_id(UUID);
DROP FUNCTION IF EXISTS public.get_user_role_in_org(UUID, UUID);

-- 3. Cria função SECURITY DEFINER para evitar recursão
-- Esta função busca o organization_id do usuário sem acionar RLS
CREATE FUNCTION public.get_user_organization_id(p_user_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = p_user_id
  LIMIT 1;
$$;

CREATE FUNCTION public.get_user_role_in_org(p_user_id UUID, p_org_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role
  FROM public.organization_members
  WHERE user_id = p_user_id
    AND organization_id = p_org_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_organization_id(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_role_in_org(UUID, UUID) TO authenticated, service_role;

-- 4. Recria políticas usando as funções SECURITY DEFINER (sem recursão)

-- SELECT: membros podem ver outros membros da mesma organização
CREATE POLICY "Members can view their organization members"
  ON public.organization_members
  FOR SELECT
  TO authenticated
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
  );

-- INSERT: apenas owner e admin podem adicionar (mas edge function usa service_role, esta é para segurança extra)
CREATE POLICY "Owners and admins can add members"
  ON public.organization_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_role_in_org(auth.uid(), organization_id) IN ('owner', 'admin')
  );

-- UPDATE: owner e admin podem editar membros da sua organização
CREATE POLICY "Owners and admins can update members"
  ON public.organization_members
  FOR UPDATE
  TO authenticated
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND public.get_user_role_in_org(auth.uid(), organization_id) IN ('owner', 'admin')
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id(auth.uid())
    AND public.get_user_role_in_org(auth.uid(), organization_id) IN ('owner', 'admin')
  );

-- DELETE: apenas owner pode remover (e não pode remover a si mesmo)
CREATE POLICY "Only owners can delete members"
  ON public.organization_members
  FOR DELETE
  TO authenticated
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND public.get_user_role_in_org(auth.uid(), organization_id) = 'owner'
    AND user_id != auth.uid()
  );

NOTIFY pgrst, 'reload schema';
