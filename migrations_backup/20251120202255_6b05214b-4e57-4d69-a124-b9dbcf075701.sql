-- Add deadline column to goals table
ALTER TABLE public.goals
ADD COLUMN deadline timestamp with time zone;

COMMENT ON COLUMN public.goals.deadline IS 'Prazo para atingir a meta';