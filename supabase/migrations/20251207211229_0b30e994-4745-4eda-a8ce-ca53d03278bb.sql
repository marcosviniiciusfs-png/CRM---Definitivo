-- Add lead_id column to kanban_cards for linking tasks to leads
ALTER TABLE public.kanban_cards 
ADD COLUMN lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX idx_kanban_cards_lead_id ON public.kanban_cards(lead_id);