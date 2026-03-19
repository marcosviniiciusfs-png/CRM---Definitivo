-- ============================================================
-- FIX DEFINITIVO: RLS, colunas e storage
-- Resolve: notas de lead, tarefas e anexos
-- ============================================================

-- ============================================================
-- 1. LEAD_ACTIVITIES — Criar políticas RLS (estavam ausentes)
-- ============================================================
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_activities_select_policy" ON public.lead_activities;
DROP POLICY IF EXISTS "lead_activities_insert_policy" ON public.lead_activities;
DROP POLICY IF EXISTS "lead_activities_update_policy" ON public.lead_activities;
DROP POLICY IF EXISTS "lead_activities_delete_policy" ON public.lead_activities;
DROP POLICY IF EXISTS "Org members can view lead activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Org members can create lead activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Users can update their own lead activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Users can delete their own lead activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Users can view activities for their org leads" ON public.lead_activities;
DROP POLICY IF EXISTS "Users can insert activities for their org leads" ON public.lead_activities;
DROP POLICY IF EXISTS "Users can update their own activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Users can delete their own activities" ON public.lead_activities;

CREATE POLICY "lead_activities_select_policy"
ON public.lead_activities FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    JOIN public.organization_members om ON om.organization_id = l.organization_id
    WHERE l.id = lead_activities.lead_id
      AND om.user_id = auth.uid()
  )
);

CREATE POLICY "lead_activities_insert_policy"
ON public.lead_activities FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.leads l
    JOIN public.organization_members om ON om.organization_id = l.organization_id
    WHERE l.id = lead_activities.lead_id
      AND om.user_id = auth.uid()
  )
);

CREATE POLICY "lead_activities_update_policy"
ON public.lead_activities FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "lead_activities_delete_policy"
ON public.lead_activities FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- ============================================================
-- 2. KANBAN — Remover políticas RESTRITIVAS que bloqueavam tudo
-- (kanban_cards, kanban_boards, kanban_columns)
-- ============================================================
DROP POLICY IF EXISTS "Deny public access to kanban cards" ON public.kanban_cards;
DROP POLICY IF EXISTS "Deny public access to kanban boards" ON public.kanban_boards;
DROP POLICY IF EXISTS "Deny public access to kanban columns" ON public.kanban_columns;

ALTER TABLE public.kanban_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. KANBAN_CARDS — Adicionar colunas faltantes
-- ============================================================
ALTER TABLE public.kanban_cards
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS is_collaborative BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_all_approval BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS timer_start_column_id UUID REFERENCES public.kanban_columns(id) ON DELETE SET NULL;

-- ============================================================
-- 4. ACTIVITY-ATTACHMENTS — Bucket de storage
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'activity-attachments',
  'activity-attachments',
  false,
  10485760,
  NULL
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Org members can upload activity attachments" ON storage.objects;
CREATE POLICY "Org members can upload activity attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'activity-attachments');

DROP POLICY IF EXISTS "Org members can read activity attachments" ON storage.objects;
CREATE POLICY "Org members can read activity attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'activity-attachments');

DROP POLICY IF EXISTS "Users can delete their activity attachments" ON storage.objects;
CREATE POLICY "Users can delete their activity attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'activity-attachments'
    AND owner = auth.uid()
  );

NOTIFY pgrst, 'reload schema';
