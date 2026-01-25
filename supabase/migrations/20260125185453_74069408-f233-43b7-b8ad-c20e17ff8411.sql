-- Tabela de atribuição de tarefas (suporta múltiplos responsáveis)
CREATE TABLE public.kanban_card_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.kanban_cards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  assigned_at timestamp with time zone DEFAULT now() NOT NULL,
  assigned_by uuid,
  UNIQUE (card_id, user_id)
);

-- Indexes para performance
CREATE INDEX idx_card_assignees_card_id ON public.kanban_card_assignees(card_id);
CREATE INDEX idx_card_assignees_user_id ON public.kanban_card_assignees(user_id);

-- Enable RLS
ALTER TABLE public.kanban_card_assignees ENABLE ROW LEVEL SECURITY;

-- Deny public access
CREATE POLICY "Deny public access to card assignees"
ON public.kanban_card_assignees
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);

-- Users can view assignees from their organization
CREATE POLICY "Users can view assignees from their organization"
ON public.kanban_card_assignees
FOR SELECT
TO authenticated
USING (
  card_id IN (
    SELECT kc.id FROM kanban_cards kc
    JOIN kanban_columns kcol ON kc.column_id = kcol.id
    JOIN kanban_boards kb ON kcol.board_id = kb.id
    WHERE kb.organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  )
);

-- Users can create assignees in their organization
CREATE POLICY "Users can create assignees in their organization"
ON public.kanban_card_assignees
FOR INSERT
TO authenticated
WITH CHECK (
  card_id IN (
    SELECT kc.id FROM kanban_cards kc
    JOIN kanban_columns kcol ON kc.column_id = kcol.id
    JOIN kanban_boards kb ON kcol.board_id = kb.id
    WHERE kb.organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  )
);

-- Users can delete assignees in their organization
CREATE POLICY "Users can delete assignees in their organization"
ON public.kanban_card_assignees
FOR DELETE
TO authenticated
USING (
  card_id IN (
    SELECT kc.id FROM kanban_cards kc
    JOIN kanban_columns kcol ON kc.column_id = kcol.id
    JOIN kanban_boards kb ON kcol.board_id = kb.id
    WHERE kb.organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  )
);