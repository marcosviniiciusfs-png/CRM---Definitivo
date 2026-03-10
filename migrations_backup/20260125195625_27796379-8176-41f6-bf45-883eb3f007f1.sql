-- Criar política que permite UPDATE apenas para o próprio usuário em tarefas da sua organização
CREATE POLICY "Users can update their own completion status"
ON public.kanban_card_assignees
FOR UPDATE
TO authenticated
USING (
  -- Somente se o usuário for o assignee
  user_id = auth.uid()
  AND
  -- E a tarefa pertencer à organização do usuário
  card_id IN (
    SELECT kc.id
    FROM kanban_cards kc
    JOIN kanban_columns kcol ON kc.column_id = kcol.id
    JOIN kanban_boards kb ON kcol.board_id = kb.id
    WHERE kb.organization_id IN (
      SELECT organization_id
      FROM organization_members
      WHERE user_id = auth.uid()
    )
  )
)
WITH CHECK (
  -- Garantir que o usuário só pode atualizar sua própria linha
  user_id = auth.uid()
);