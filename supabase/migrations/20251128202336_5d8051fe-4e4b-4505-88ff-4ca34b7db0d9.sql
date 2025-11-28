-- Remover a política atual de visualização do histórico
DROP POLICY IF EXISTS "Users can view their organization's distribution history" ON public.lead_distribution_history;

-- Criar nova política que diferencia por cargo
CREATE POLICY "Members can view only their own distribution history"
ON public.lead_distribution_history
FOR SELECT
USING (
  -- Members só veem distribuições onde eles são o destinatário
  (to_user_id = auth.uid())
  OR
  -- Owners e Admins veem todas as distribuições da organização
  (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  )
);