-- 1. Primeiro, vamos remover a política restritiva atual
DROP POLICY IF EXISTS "Secure lead visibility by role" ON public.leads;

-- 2. Criar a nova política que permite que TODO membro da organização veja os leads dela,
-- mas ainda garante que apenas o dono/admin ou o mprio responsvel possa deletar/editar.
CREATE POLICY "Team visibility by organization" ON public.leads 
FOR SELECT USING (
  organization_id IN (
    SELECT om.organization_id 
    FROM organization_members om 
    WHERE om.user_id = auth.uid()
  )
);

-- 3. Garantir que o webhook sempre registre o organization_id correto
-- (Isso eu j ajustei no código da Function)
