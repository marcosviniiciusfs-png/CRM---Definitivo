-- Adicionar coluna para definir em qual coluna o timer deve começar
ALTER TABLE kanban_cards 
ADD COLUMN IF NOT EXISTS timer_start_column_id uuid REFERENCES kanban_columns(id) ON DELETE SET NULL;

COMMENT ON COLUMN kanban_cards.timer_start_column_id IS 'Define em qual coluna o timer deve começar a contar. Se NULL, começa imediatamente.';