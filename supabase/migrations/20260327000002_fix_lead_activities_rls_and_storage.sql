-- ============================================================
-- Fix lead_activities RLS policies and activity-attachments bucket
-- ============================================================

-- 1. LEAD_ACTIVITIES — Ensure RLS is enabled and policies exist
-- ============================================================
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- SELECT: org members can view activities for leads in their org
  DROP POLICY IF EXISTS "Org members can view lead activities" ON public.lead_activities;
  CREATE POLICY "Org members can view lead activities"
    ON public.lead_activities FOR SELECT TO authenticated
    USING (
      lead_id IN (
        SELECT id FROM public.leads
        WHERE organization_id IN (
          SELECT organization_id FROM public.organization_members
          WHERE user_id = auth.uid() AND is_active = true
        )
      )
    );

  -- INSERT: org members can create activities for leads in their org
  DROP POLICY IF EXISTS "Org members can create lead activities" ON public.lead_activities;
  CREATE POLICY "Org members can create lead activities"
    ON public.lead_activities FOR INSERT TO authenticated
    WITH CHECK (
      user_id = auth.uid()
      AND lead_id IN (
        SELECT id FROM public.leads
        WHERE organization_id IN (
          SELECT organization_id FROM public.organization_members
          WHERE user_id = auth.uid() AND is_active = true
        )
      )
    );

  -- UPDATE: only the activity creator can update their own activities
  DROP POLICY IF EXISTS "Users can update their own lead activities" ON public.lead_activities;
  CREATE POLICY "Users can update their own lead activities"
    ON public.lead_activities FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

  -- DELETE: activity creator or org admins/owners can delete
  DROP POLICY IF EXISTS "Users can delete their own lead activities" ON public.lead_activities;
  CREATE POLICY "Users can delete their own lead activities"
    ON public.lead_activities FOR DELETE TO authenticated
    USING (
      user_id = auth.uid()
      OR lead_id IN (
        SELECT id FROM public.leads
        WHERE organization_id IN (
          SELECT organization_id FROM public.organization_members
          WHERE user_id = auth.uid()
            AND role IN ('owner', 'admin')
            AND is_active = true
        )
      )
    );
END $$;

-- ============================================================
-- 2. ACTIVITY-ATTACHMENTS STORAGE BUCKET
-- ============================================================

-- Create bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'activity-attachments',
  'activity-attachments',
  false,
  10485760,  -- 10MB
  NULL
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: allow org members to upload attachments for their leads
DO $$
BEGIN
  DROP POLICY IF EXISTS "Org members can upload activity attachments" ON storage.objects;
  CREATE POLICY "Org members can upload activity attachments"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'activity-attachments'
    );

  DROP POLICY IF EXISTS "Org members can read activity attachments" ON storage.objects;
  CREATE POLICY "Org members can read activity attachments"
    ON storage.objects FOR SELECT TO authenticated
    USING (
      bucket_id = 'activity-attachments'
    );

  DROP POLICY IF EXISTS "Users can delete their activity attachments" ON storage.objects;
  CREATE POLICY "Users can delete their activity attachments"
    ON storage.objects FOR DELETE TO authenticated
    USING (
      bucket_id = 'activity-attachments'
      AND owner = auth.uid()
    );
END $$;

-- ============================================================
-- 3. KANBAN_CARDS — Ensure RLS is enabled and INSERT policy exists
-- ============================================================
ALTER TABLE public.kanban_cards ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- SELECT: org members can view cards in their org's boards
  DROP POLICY IF EXISTS "Org members can view kanban cards" ON public.kanban_cards;
  CREATE POLICY "Org members can view kanban cards"
    ON public.kanban_cards FOR SELECT TO authenticated
    USING (
      column_id IN (
        SELECT kc.id FROM public.kanban_columns kc
        JOIN public.kanban_boards kb ON kb.id = kc.board_id
        WHERE kb.organization_id IN (
          SELECT organization_id FROM public.organization_members
          WHERE user_id = auth.uid() AND is_active = true
        )
      )
    );

  -- INSERT: org members can create cards in their org's boards
  DROP POLICY IF EXISTS "Org members can create kanban cards" ON public.kanban_cards;
  CREATE POLICY "Org members can create kanban cards"
    ON public.kanban_cards FOR INSERT TO authenticated
    WITH CHECK (
      column_id IN (
        SELECT kc.id FROM public.kanban_columns kc
        JOIN public.kanban_boards kb ON kb.id = kc.board_id
        WHERE kb.organization_id IN (
          SELECT organization_id FROM public.organization_members
          WHERE user_id = auth.uid() AND is_active = true
        )
      )
    );

  -- UPDATE: org members can update cards in their org's boards
  DROP POLICY IF EXISTS "Org members can update kanban cards" ON public.kanban_cards;
  CREATE POLICY "Org members can update kanban cards"
    ON public.kanban_cards FOR UPDATE TO authenticated
    USING (
      column_id IN (
        SELECT kc.id FROM public.kanban_columns kc
        JOIN public.kanban_boards kb ON kb.id = kc.board_id
        WHERE kb.organization_id IN (
          SELECT organization_id FROM public.organization_members
          WHERE user_id = auth.uid() AND is_active = true
        )
      )
    );

  -- DELETE: org admins/owners or card creator can delete cards
  DROP POLICY IF EXISTS "Org members can delete kanban cards" ON public.kanban_cards;
  CREATE POLICY "Org members can delete kanban cards"
    ON public.kanban_cards FOR DELETE TO authenticated
    USING (
      created_by = auth.uid()
      OR column_id IN (
        SELECT kc.id FROM public.kanban_columns kc
        JOIN public.kanban_boards kb ON kb.id = kc.board_id
        WHERE kb.organization_id IN (
          SELECT organization_id FROM public.organization_members
          WHERE user_id = auth.uid()
            AND role IN ('owner', 'admin')
            AND is_active = true
        )
      )
    );
END $$;

NOTIFY pgrst, 'reload schema';
