-- Adicionar coluna para armazenar ID do evento do Google Calendar
ALTER TABLE public.kanban_cards 
ADD COLUMN calendar_event_id text;

-- Adicionar coluna para armazenar link do evento
ALTER TABLE public.kanban_cards 
ADD COLUMN calendar_event_link text;