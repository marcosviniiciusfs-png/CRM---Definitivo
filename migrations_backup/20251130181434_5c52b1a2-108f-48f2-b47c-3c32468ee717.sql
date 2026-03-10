-- Criar tabela de quadros Kanban
CREATE TABLE public.kanban_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Quadro de Tarefas',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Criar tabela de colunas do Kanban
CREATE TABLE public.kanban_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES public.kanban_boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Criar tabela de cartões/tarefas
CREATE TABLE public.kanban_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  column_id UUID NOT NULL REFERENCES public.kanban_columns(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  estimated_time INTEGER, -- em minutos
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Adicionar colunas na tabela notifications para tarefas Kanban
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS card_id UUID REFERENCES public.kanban_cards(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS time_estimate INTEGER;

-- Habilitar RLS
ALTER TABLE public.kanban_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_cards ENABLE ROW LEVEL SECURITY;

-- Policies para kanban_boards
CREATE POLICY "Deny public access to kanban boards"
ON public.kanban_boards
FOR ALL
USING (false);

CREATE POLICY "Users can view boards from their organization"
ON public.kanban_boards
FOR SELECT
USING (organization_id IN (
  SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
));

CREATE POLICY "Users can create boards in their organization"
ON public.kanban_boards
FOR INSERT
WITH CHECK (organization_id IN (
  SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
));

CREATE POLICY "Users can update boards in their organization"
ON public.kanban_boards
FOR UPDATE
USING (organization_id IN (
  SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
));

CREATE POLICY "Users can delete boards in their organization"
ON public.kanban_boards
FOR DELETE
USING (organization_id IN (
  SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
));

-- Policies para kanban_columns
CREATE POLICY "Deny public access to kanban columns"
ON public.kanban_columns
FOR ALL
USING (false);

CREATE POLICY "Users can view columns from their organization"
ON public.kanban_columns
FOR SELECT
USING (board_id IN (
  SELECT id FROM public.kanban_boards WHERE organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
));

CREATE POLICY "Users can create columns in their organization"
ON public.kanban_columns
FOR INSERT
WITH CHECK (board_id IN (
  SELECT id FROM public.kanban_boards WHERE organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
));

CREATE POLICY "Users can update columns in their organization"
ON public.kanban_columns
FOR UPDATE
USING (board_id IN (
  SELECT id FROM public.kanban_boards WHERE organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
));

CREATE POLICY "Users can delete columns in their organization"
ON public.kanban_columns
FOR DELETE
USING (board_id IN (
  SELECT id FROM public.kanban_boards WHERE organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
));

-- Policies para kanban_cards
CREATE POLICY "Deny public access to kanban cards"
ON public.kanban_cards
FOR ALL
USING (false);

CREATE POLICY "Users can view cards from their organization"
ON public.kanban_cards
FOR SELECT
USING (column_id IN (
  SELECT id FROM public.kanban_columns WHERE board_id IN (
    SELECT id FROM public.kanban_boards WHERE organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  )
));

CREATE POLICY "Users can create cards in their organization"
ON public.kanban_cards
FOR INSERT
WITH CHECK (column_id IN (
  SELECT id FROM public.kanban_columns WHERE board_id IN (
    SELECT id FROM public.kanban_boards WHERE organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  )
) AND created_by = auth.uid());

CREATE POLICY "Users can update cards in their organization"
ON public.kanban_cards
FOR UPDATE
USING (column_id IN (
  SELECT id FROM public.kanban_columns WHERE board_id IN (
    SELECT id FROM public.kanban_boards WHERE organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  )
));

CREATE POLICY "Users can delete cards in their organization"
ON public.kanban_cards
FOR DELETE
USING (column_id IN (
  SELECT id FROM public.kanban_columns WHERE board_id IN (
    SELECT id FROM public.kanban_boards WHERE organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  )
));

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_kanban_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_kanban_boards_updated_at
BEFORE UPDATE ON public.kanban_boards
FOR EACH ROW
EXECUTE FUNCTION public.update_kanban_updated_at();

CREATE TRIGGER update_kanban_cards_updated_at
BEFORE UPDATE ON public.kanban_cards
FOR EACH ROW
EXECUTE FUNCTION public.update_kanban_updated_at();