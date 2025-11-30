-- Add timer_started_at column to kanban_cards table
ALTER TABLE kanban_cards 
ADD COLUMN timer_started_at TIMESTAMPTZ;