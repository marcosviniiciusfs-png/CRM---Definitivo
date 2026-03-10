-- Add stage configuration columns to kanban_columns
ALTER TABLE public.kanban_columns
ADD COLUMN is_completion_stage BOOLEAN DEFAULT false,
ADD COLUMN block_backward_movement BOOLEAN DEFAULT false,
ADD COLUMN auto_delete_enabled BOOLEAN DEFAULT false,
ADD COLUMN auto_delete_hours INTEGER DEFAULT NULL,
ADD COLUMN stage_color TEXT DEFAULT NULL;

-- Add comments
COMMENT ON COLUMN public.kanban_columns.is_completion_stage IS 'Se true, tarefas nesta etapa são consideradas concluídas (borda verde)';
COMMENT ON COLUMN public.kanban_columns.block_backward_movement IS 'Se true, impede mover tarefas desta etapa para etapas anteriores';
COMMENT ON COLUMN public.kanban_columns.auto_delete_enabled IS 'Se true, tarefas são automaticamente excluídas após X horas';
COMMENT ON COLUMN public.kanban_columns.auto_delete_hours IS 'Horas após as quais a tarefa será excluída automaticamente';
COMMENT ON COLUMN public.kanban_columns.stage_color IS 'Cor opcional para identificar visualmente a etapa';