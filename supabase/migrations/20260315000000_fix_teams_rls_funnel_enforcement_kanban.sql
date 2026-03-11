-- ============================================================
-- 1. TEAMS TABLE — RLS POLICIES
--    The table has RLS enabled but NO policies, causing 403 on all ops.
-- ============================================================
DO $$
BEGIN
  -- SELECT: any org member can view teams in their organization
  DROP POLICY IF EXISTS "Org members can view their teams" ON public.teams;
  CREATE POLICY "Org members can view their teams"
    ON public.teams FOR SELECT TO authenticated
    USING (
      organization_id IN (
        SELECT organization_id FROM public.organization_members
        WHERE user_id = auth.uid()
      )
    );

  -- INSERT: only owners and admins can create teams
  DROP POLICY IF EXISTS "Owners and admins can create teams" ON public.teams;
  CREATE POLICY "Owners and admins can create teams"
    ON public.teams FOR INSERT TO authenticated
    WITH CHECK (
      organization_id IN (
        SELECT organization_id FROM public.organization_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    );

  -- UPDATE: owners, admins, or the team leader can update
  DROP POLICY IF EXISTS "Owners admins and leaders can update teams" ON public.teams;
  CREATE POLICY "Owners admins and leaders can update teams"
    ON public.teams FOR UPDATE TO authenticated
    USING (
      organization_id IN (
        SELECT organization_id FROM public.organization_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
      OR leader_id = auth.uid()
    )
    WITH CHECK (
      organization_id IN (
        SELECT organization_id FROM public.organization_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    );

  -- DELETE: only owners and admins can delete teams
  DROP POLICY IF EXISTS "Owners and admins can delete teams" ON public.teams;
  CREATE POLICY "Owners and admins can delete teams"
    ON public.teams FOR DELETE TO authenticated
    USING (
      organization_id IN (
        SELECT organization_id FROM public.organization_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    );
END $$;

-- ============================================================
-- 2. TEAM_MEMBERS TABLE — RLS POLICIES
-- ============================================================
DO $$
BEGIN
  -- SELECT: any org member can view team members in their org
  DROP POLICY IF EXISTS "Org members can view team members" ON public.team_members;
  CREATE POLICY "Org members can view team members"
    ON public.team_members FOR SELECT TO authenticated
    USING (
      team_id IN (
        SELECT id FROM public.teams
        WHERE organization_id IN (
          SELECT organization_id FROM public.organization_members
          WHERE user_id = auth.uid()
        )
      )
    );

  -- INSERT: owners, admins, or team leader can add members
  DROP POLICY IF EXISTS "Owners admins and leaders can add team members" ON public.team_members;
  CREATE POLICY "Owners admins and leaders can add team members"
    ON public.team_members FOR INSERT TO authenticated
    WITH CHECK (
      team_id IN (
        SELECT t.id FROM public.teams t
        JOIN public.organization_members om
          ON om.organization_id = t.organization_id
         AND om.user_id = auth.uid()
         AND (om.role IN ('owner', 'admin') OR t.leader_id = auth.uid())
      )
    );

  -- DELETE: owners, admins, or team leader can remove members
  DROP POLICY IF EXISTS "Owners admins and leaders can remove team members" ON public.team_members;
  CREATE POLICY "Owners admins and leaders can remove team members"
    ON public.team_members FOR DELETE TO authenticated
    USING (
      team_id IN (
        SELECT t.id FROM public.teams t
        JOIN public.organization_members om
          ON om.organization_id = t.organization_id
         AND om.user_id = auth.uid()
         AND (om.role IN ('owner', 'admin') OR t.leader_id = auth.uid())
      )
    );
END $$;

-- ============================================================
-- 3. TEAM_GOALS TABLE — RLS (if it exists)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'team_goals' AND table_schema = 'public') THEN
    DROP POLICY IF EXISTS "Org members can view team goals" ON public.team_goals;
    CREATE POLICY "Org members can view team goals"
      ON public.team_goals FOR SELECT TO authenticated
      USING (
        team_id IN (
          SELECT id FROM public.teams
          WHERE organization_id IN (
            SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
          )
        )
      );

    DROP POLICY IF EXISTS "Owners admins can manage team goals" ON public.team_goals;
    CREATE POLICY "Owners admins can manage team goals"
      ON public.team_goals FOR ALL TO authenticated
      USING (
        team_id IN (
          SELECT t.id FROM public.teams t
          JOIN public.organization_members om ON om.organization_id = t.organization_id
           AND om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
        )
      )
      WITH CHECK (
        team_id IN (
          SELECT t.id FROM public.teams t
          JOIN public.organization_members om ON om.organization_id = t.organization_id
           AND om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
        )
      );
  END IF;
END $$;

-- ============================================================
-- 4. SALES_FUNNELS — RESTRICTIVE RLS for funnel_permissions
--    This ensures the DB-level enforcement even if frontend fails.
--    RESTRICTIVE policy: row is BLOCKED unless this condition passes.
-- ============================================================
-- Enable RLS on sales_funnels (safe if already enabled)
ALTER TABLE public.sales_funnels ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Remove old restrictive policy if re-running
  DROP POLICY IF EXISTS "enforce_funnel_permissions" ON public.sales_funnels;

  CREATE POLICY "enforce_funnel_permissions"
    ON public.sales_funnels
    AS RESTRICTIVE
    FOR SELECT TO authenticated
    USING (
      -- Owners and admins always see all funnels in their org
      EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE user_id = auth.uid()
          AND organization_id = sales_funnels.organization_id
          AND role IN ('owner', 'admin')
      )
      OR
      -- Funnel is open: no entries in funnel_permissions
      NOT EXISTS (
        SELECT 1 FROM public.funnel_permissions fp
        WHERE fp.funnel_id = sales_funnels.id
      )
      OR
      -- User has explicit permission
      EXISTS (
        SELECT 1 FROM public.funnel_permissions fp
        WHERE fp.funnel_id = sales_funnels.id
          AND fp.user_id = auth.uid()
      )
    );
END $$;

-- ============================================================
-- 5. KANBAN_CARD_ASSIGNEES — Create table + RLS policies
--    The table may not exist yet in production.
-- ============================================================

-- Create table first
CREATE TABLE IF NOT EXISTS public.kanban_card_assignees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id     UUID NOT NULL REFERENCES public.kanban_cards(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  UNIQUE (card_id, user_id)
);

ALTER TABLE public.kanban_card_assignees ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Simpler SELECT policy: authenticated users in the same org can see assignees
  DROP POLICY IF EXISTS "Users can view assignees from their organization" ON public.kanban_card_assignees;
  CREATE POLICY "Users can view assignees from their organization"
    ON public.kanban_card_assignees FOR SELECT TO authenticated
    USING (
      -- User can see assignees where they are the assignee
      user_id = auth.uid()
      OR
      -- OR where the card is in a board in the user's org
      card_id IN (
        SELECT kc.id FROM public.kanban_cards kc
        JOIN public.kanban_columns kcol ON kcol.id = kc.column_id
        JOIN public.kanban_boards kb ON kb.id = kcol.board_id
        WHERE kb.organization_id IN (
          SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
      )
    );

  DROP POLICY IF EXISTS "Users can create assignees in their organization" ON public.kanban_card_assignees;
  CREATE POLICY "Users can create assignees in their organization"
    ON public.kanban_card_assignees FOR INSERT TO authenticated
    WITH CHECK (
      card_id IN (
        SELECT kc.id FROM public.kanban_cards kc
        JOIN public.kanban_columns kcol ON kcol.id = kc.column_id
        JOIN public.kanban_boards kb ON kb.id = kcol.board_id
        WHERE kb.organization_id IN (
          SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
        )
      )
    );

  DROP POLICY IF EXISTS "Users can delete their own assignees" ON public.kanban_card_assignees;
  CREATE POLICY "Users can delete their own assignees"
    ON public.kanban_card_assignees FOR DELETE TO authenticated
    USING (
      user_id = auth.uid()
      OR
      card_id IN (
        SELECT kc.id FROM public.kanban_cards kc
        JOIN public.kanban_columns kcol ON kcol.id = kc.column_id
        JOIN public.kanban_boards kb ON kb.id = kcol.board_id
        WHERE kb.organization_id IN (
          SELECT organization_id FROM public.organization_members
          WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
      )
    );

  -- Allow UPDATE (for is_completed toggle)
  DROP POLICY IF EXISTS "Users can update their own assignee status" ON public.kanban_card_assignees;
  CREATE POLICY "Users can update their own assignee status"
    ON public.kanban_card_assignees FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
END $$;

NOTIFY pgrst, 'reload schema';
