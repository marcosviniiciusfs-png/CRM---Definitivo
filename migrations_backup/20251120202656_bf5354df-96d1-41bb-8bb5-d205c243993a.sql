-- Remove a política restritiva que está bloqueando todas as operações
DROP POLICY IF EXISTS "Deny public access to goals" ON public.goals;

-- As outras políticas já protegem adequadamente os dados:
-- - Users can view goals from their organization
-- - Users can create goals in their organization
-- - Users can update their own goals
-- - Users can delete their own goals