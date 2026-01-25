-- Add color column to kanban_cards for task priority/importance indication
ALTER TABLE public.kanban_cards
ADD COLUMN color TEXT DEFAULT NULL;

COMMENT ON COLUMN public.kanban_cards.color IS 'Optional color hex code to indicate task priority/importance';