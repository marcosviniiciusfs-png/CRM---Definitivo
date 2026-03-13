-- ============================================================
-- FIX: Recursão Infinita nas Políticas RLS de organization_members
--
-- Problema: As políticas da tabela organization_members faziam
-- SELECT na própria tabela organization_members para verificar
-- permissões, causando recursão infinita (erro código 42P17).
--
-- Solução: Criar uma função SECURITY DEFINER que bypassa o RLS
-- para verificar se o usuário é membro de uma organização,
-- e recriar todas as políticas usando essa função.
-- ============================================================

-- 1. Criar função auxiliar SECURITY DEFINER que verifica membresia
--    sem entrar em recursão (executa com privilégios do owner, bypassing RLS)
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id = _user_id
      AND organization_id = _org_id
  );
$$;

-- Função para verificar se o usuário é owner/admin de uma organização
CREATE OR REPLACE FUNCTION public.is_org_admin(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND role IN ('owner', 'admin')
  );
$$;

-- Função para verificar se o usuário é owner de uma organização
CREATE OR REPLACE FUNCTION public.is_org_owner(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND role = 'owner'
  );
$$;

-- Função para obter todas as org_ids do usuário atual (sem RLS)
CREATE OR REPLACE FUNCTION public.get_user_org_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = _user_id;
$$;

-- 2. Remover TODAS as políticas existentes da tabela organization_members
DROP POLICY IF EXISTS "Members can view their organization members" ON public.organization_members;
DROP POLICY IF EXISTS "Owners and admins can add members" ON public.organization_members;
DROP POLICY IF EXISTS "Owners and admins can update members" ON public.organization_members;
DROP POLICY IF EXISTS "Only owners can delete members" ON public.organization_members;
DROP POLICY IF EXISTS "organization_members_select_policy" ON public.organization_members;
DROP POLICY IF EXISTS "organization_members_insert_policy" ON public.organization_members;
DROP POLICY IF EXISTS "organization_members_update_policy" ON public.organization_members;
DROP POLICY IF EXISTS "organization_members_delete_policy" ON public.organization_members;
DROP POLICY IF EXISTS "Users can view org members" ON public.organization_members;
DROP POLICY IF EXISTS "Allow users to view their own membership" ON public.organization_members;
DROP POLICY IF EXISTS "Enable read access for org members" ON public.organization_members;

-- 3. Recriar políticas usando as funções SECURITY DEFINER (sem recursão)

-- SELECT: membros podem ver outros membros da mesma organização
CREATE POLICY "org_members_can_view_members"
  ON public.organization_members
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
  );

-- INSERT: apenas owners/admins podem adicionar membros
CREATE POLICY "org_admins_can_add_members"
  ON public.organization_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_admin(auth.uid(), organization_id)
  );

-- UPDATE: apenas owners/admins podem atualizar membros
CREATE POLICY "org_admins_can_update_members"
  ON public.organization_members
  FOR UPDATE
  TO authenticated
  USING (
    public.is_org_admin(auth.uid(), organization_id)
  )
  WITH CHECK (
    public.is_org_admin(auth.uid(), organization_id)
  );

-- DELETE: apenas owners podem remover membros (não podem se remover)
CREATE POLICY "org_owners_can_delete_members"
  ON public.organization_members
  FOR DELETE
  TO authenticated
  USING (
    public.is_org_owner(auth.uid(), organization_id)
    AND user_id != auth.uid()
  );

-- 4. Garantir que RLS está habilitado
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- 5. Notificar PostgREST para recarregar o schema
NOTIFY pgrst, 'reload schema';
