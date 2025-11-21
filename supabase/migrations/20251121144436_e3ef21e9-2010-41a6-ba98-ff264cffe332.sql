-- Remover política antiga que permite admins excluírem
DROP POLICY IF EXISTS "Owners and admins can remove members" ON public.organization_members;

-- Criar nova política que permite APENAS proprietários excluírem
CREATE POLICY "Only owners can remove members" 
ON public.organization_members 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1
    FROM get_user_organization_role(auth.uid()) role_info
    WHERE role_info.organization_id = organization_members.organization_id
    AND role_info.role = 'owner'
  )
);