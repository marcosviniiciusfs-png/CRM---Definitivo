-- Tabela para registro de pontuação de tarefas
CREATE TABLE public.task_completion_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES public.kanban_cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Critérios de pontuação
  had_due_date BOOLEAN DEFAULT false,
  was_on_time_due_date BOOLEAN DEFAULT false,
  had_timer BOOLEAN DEFAULT false,
  was_on_time_timer BOOLEAN DEFAULT false,
  
  -- Pontos calculados
  base_points INTEGER NOT NULL DEFAULT 2,
  bonus_due_date INTEGER DEFAULT 0,
  bonus_timer INTEGER DEFAULT 0,
  total_points INTEGER GENERATED ALWAYS AS (base_points + bonus_due_date + bonus_timer) STORED,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para consultas eficientes
CREATE INDEX idx_task_completion_logs_org ON public.task_completion_logs(organization_id);
CREATE INDEX idx_task_completion_logs_user ON public.task_completion_logs(user_id);
CREATE INDEX idx_task_completion_logs_completed_at ON public.task_completion_logs(completed_at);
CREATE UNIQUE INDEX idx_task_completion_unique ON public.task_completion_logs(card_id, user_id);

-- Enable RLS
ALTER TABLE public.task_completion_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Deny public access to task completion logs"
ON public.task_completion_logs
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);

CREATE POLICY "Users can view task completion logs from their organization"
ON public.task_completion_logs
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert task completion logs in their organization"
ON public.task_completion_logs
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their own task completion logs"
ON public.task_completion_logs
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid() AND
  organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE user_id = auth.uid()
  )
);