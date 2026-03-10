-- RLS policies for organization_members table
-- Ensures proper access control for collaborators feature

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- SELECT: all authenticated members of the organization can view org members
  DROP POLICY IF EXISTS "Members can view their organization members" ON public.organization_members;
  CREATE POLICY "Members can view their organization members"
    ON public.organization_members
    FOR SELECT
    TO authenticated
    USING (
      organization_id IN (
        SELECT organization_id
        FROM public.organization_members
        WHERE user_id = auth.uid()
      )
    );

  -- INSERT: only owner and admin can insert (edge function uses service role, but this covers direct inserts)
  DROP POLICY IF EXISTS "Owners and admins can add members" ON public.organization_members;
  CREATE POLICY "Owners and admins can add members"
    ON public.organization_members
    FOR INSERT
    TO authenticated
    WITH CHECK (
      organization_id IN (
        SELECT organization_id
        FROM public.organization_members
        WHERE user_id = auth.uid()
          AND role IN ('owner', 'admin')
      )
    );

  -- UPDATE: owner and admin can update members of their org
  DROP POLICY IF EXISTS "Owners and admins can update members" ON public.organization_members;
  CREATE POLICY "Owners and admins can update members"
    ON public.organization_members
    FOR UPDATE
    TO authenticated
    USING (
      organization_id IN (
        SELECT organization_id
        FROM public.organization_members
        WHERE user_id = auth.uid()
          AND role IN ('owner', 'admin')
      )
    )
    WITH CHECK (
      organization_id IN (
        SELECT organization_id
        FROM public.organization_members
        WHERE user_id = auth.uid()
          AND role IN ('owner', 'admin')
      )
    );

  -- DELETE: only owner can delete members (not themselves)
  DROP POLICY IF EXISTS "Only owners can delete members" ON public.organization_members;
  CREATE POLICY "Only owners can delete members"
    ON public.organization_members
    FOR DELETE
    TO authenticated
    USING (
      organization_id IN (
        SELECT organization_id
        FROM public.organization_members
        WHERE user_id = auth.uid()
          AND role = 'owner'
      )
      AND user_id != auth.uid()
    );
END;
$$;
