-- Fix: kanban_boards, kanban_columns e kanban_cards tinham uma política
-- "Deny public access" sem "AS RESTRICTIVE" e sem "TO anon",
-- bloqueando até usuários autenticados (owners/admins) de criar boards.

-- ─── kanban_boards ───────────────────────────────────────────
DROP POLICY IF EXISTS "Deny public access to kanban boards" ON public.kanban_boards;

CREATE POLICY "Deny public access to kanban boards"
ON public.kanban_boards
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);

-- ─── kanban_columns ──────────────────────────────────────────
DROP POLICY IF EXISTS "Deny public access to kanban columns" ON public.kanban_columns;

CREATE POLICY "Deny public access to kanban columns"
ON public.kanban_columns
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);

-- ─── kanban_cards ────────────────────────────────────────────
DROP POLICY IF EXISTS "Deny public access to kanban cards" ON public.kanban_cards;

CREATE POLICY "Deny public access to kanban cards"
ON public.kanban_cards
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);
