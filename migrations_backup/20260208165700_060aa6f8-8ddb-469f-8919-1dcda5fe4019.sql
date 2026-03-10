-- Adicionar coluna para rastrear quando o usuário visualizou a tarefa na página /tasks
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;

-- Índice para queries eficientes de tarefas pendentes
CREATE INDEX IF NOT EXISTS idx_notifications_pending_tasks 
ON notifications (user_id, type, viewed_at) 
WHERE type = 'task_assigned' AND viewed_at IS NULL;