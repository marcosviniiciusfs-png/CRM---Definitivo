-- Adicionar colunas faltantes na tabela kanban_cards
ALTER TABLE public.kanban_cards
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS is_collaborative BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_all_approval BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS timer_start_column_id UUID REFERENCES public.kanban_columns(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
