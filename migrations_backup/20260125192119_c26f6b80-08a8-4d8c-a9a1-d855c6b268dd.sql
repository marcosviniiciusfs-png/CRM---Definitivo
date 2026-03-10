-- Adicionar coluna de status de conclusão individual na tabela de assignees
ALTER TABLE public.kanban_card_assignees 
ADD COLUMN IF NOT EXISTS is_completed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone DEFAULT null;

-- Adicionar flags para tarefas colaborativas na tabela de cards
ALTER TABLE public.kanban_cards 
ADD COLUMN IF NOT EXISTS is_collaborative boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS requires_all_approval boolean DEFAULT true;

-- Criar índice para buscar assignees com status
CREATE INDEX IF NOT EXISTS idx_kanban_card_assignees_completed 
ON public.kanban_card_assignees(card_id, is_completed);

-- Criar índice para tarefas colaborativas
CREATE INDEX IF NOT EXISTS idx_kanban_cards_collaborative 
ON public.kanban_cards(is_collaborative) WHERE is_collaborative = true;