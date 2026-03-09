-- Garante que as políticas permissivas do kanban existem em produção
-- (a migration anterior só criou a política restrictiva TO anon,
-- mas as permissivas podem não ter sido aplicadas)

-- ─── kanban_boards ───────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view boards from their organization"
  ON public.kanban_boards;
CREATE POLICY "Users can view boards from their organization"
ON public.kanban_boards FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can create boards in their organization"
  ON public.kanban_boards;
CREATE POLICY "Users can create boards in their organization"
ON public.kanban_boards FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update boards in their organization"
  ON public.kanban_boards;
CREATE POLICY "Users can update boards in their organization"
ON public.kanban_boards FOR UPDATE
USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE user_id = auth.uid()
  )
);

-- ─── kanban_columns ──────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view columns from their boards"
  ON public.kanban_columns;
CREATE POLICY "Users can view columns from their boards"
ON public.kanban_columns FOR SELECT
USING (
  board_id IN (
    SELECT kb.id FROM public.kanban_boards kb
    JOIN public.organization_members om ON kb.organization_id = om.organization_id
    WHERE om.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can create columns in their boards"
  ON public.kanban_columns;
CREATE POLICY "Users can create columns in their boards"
ON public.kanban_columns FOR INSERT
WITH CHECK (
  board_id IN (
    SELECT kb.id FROM public.kanban_boards kb
    JOIN public.organization_members om ON kb.organization_id = om.organization_id
    WHERE om.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update columns in their boards"
  ON public.kanban_columns;
CREATE POLICY "Users can update columns in their boards"
ON public.kanban_columns FOR UPDATE
USING (
  board_id IN (
    SELECT kb.id FROM public.kanban_boards kb
    JOIN public.organization_members om ON kb.organization_id = om.organization_id
    WHERE om.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can delete columns in their boards"
  ON public.kanban_columns;
CREATE POLICY "Users can delete columns in their boards"
ON public.kanban_columns FOR DELETE
USING (
  board_id IN (
    SELECT kb.id FROM public.kanban_boards kb
    JOIN public.organization_members om ON kb.organization_id = om.organization_id
    WHERE om.user_id = auth.uid()
  )
);

-- ─── kanban_cards ────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view cards from their org"
  ON public.kanban_cards;
CREATE POLICY "Users can view cards from their org"
ON public.kanban_cards FOR SELECT
USING (
  column_id IN (
    SELECT kc.id FROM public.kanban_columns kc
    JOIN public.kanban_boards kb ON kc.board_id = kb.id
    JOIN public.organization_members om ON kb.organization_id = om.organization_id
    WHERE om.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can create cards in their org"
  ON public.kanban_cards;
CREATE POLICY "Users can create cards in their org"
ON public.kanban_cards FOR INSERT
WITH CHECK (
  column_id IN (
    SELECT kc.id FROM public.kanban_columns kc
    JOIN public.kanban_boards kb ON kc.board_id = kb.id
    JOIN public.organization_members om ON kb.organization_id = om.organization_id
    WHERE om.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update cards in their org"
  ON public.kanban_cards;
CREATE POLICY "Users can update cards in their org"
ON public.kanban_cards FOR UPDATE
USING (
  column_id IN (
    SELECT kc.id FROM public.kanban_columns kc
    JOIN public.kanban_boards kb ON kc.board_id = kb.id
    JOIN public.organization_members om ON kb.organization_id = om.organization_id
    WHERE om.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can delete cards in their org"
  ON public.kanban_cards;
CREATE POLICY "Users can delete cards in their org"
ON public.kanban_cards FOR DELETE
USING (
  column_id IN (
    SELECT kc.id FROM public.kanban_columns kc
    JOIN public.kanban_boards kb ON kc.board_id = kb.id
    JOIN public.organization_members om ON kb.organization_id = om.organization_id
    WHERE om.user_id = auth.uid()
  )
);
