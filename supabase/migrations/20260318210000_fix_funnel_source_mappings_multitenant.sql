-- Fix funnel_source_mappings: add organization_id for proper multi-tenant isolation
--
-- ROOT CAUSE: a GLOBAL unique index on (source_type, source_identifier) meant only
-- ONE organization in the entire system could map any given Facebook form_id.
-- When Org B mapped form X, it overwrote Org A's mapping (the FunnelSelector
-- was doing a global UPDATE to avoid hitting the unique constraint on INSERT).
-- Result: Org A's leads fell back to the default funnel instead of the configured one.
--
-- FIX: add organization_id column, change constraint to per-org uniqueness, so each
-- org can independently map the same form_id to their own funnel.

-- 1. Add organization_id column (nullable initially to allow backfill)
ALTER TABLE public.funnel_source_mappings
  ADD COLUMN IF NOT EXISTS organization_id UUID;

-- 2. Backfill organization_id from the related funnel's organization
UPDATE public.funnel_source_mappings fsm
SET organization_id = sf.organization_id
FROM public.sales_funnels sf
WHERE fsm.funnel_id = sf.id
  AND fsm.organization_id IS NULL;

-- 3. Remove rows that can't be backfilled (orphaned - funnel was deleted)
DELETE FROM public.funnel_source_mappings WHERE organization_id IS NULL;

-- 4. Set NOT NULL now that all rows are populated
ALTER TABLE public.funnel_source_mappings
  ALTER COLUMN organization_id SET NOT NULL;

-- 5. Drop the old GLOBAL unique index (was blocking per-org mappings)
DROP INDEX IF EXISTS funnel_source_mappings_source_unique;

-- 6. Create new PER-ORG unique index
--    Each org can independently map any form_id to their own funnel.
--    Partial: only enforced when source_identifier IS NOT NULL (same as before).
CREATE UNIQUE INDEX funnel_source_mappings_org_source_unique
  ON public.funnel_source_mappings(organization_id, source_type, source_identifier)
  WHERE source_identifier IS NOT NULL;

-- 7. Update existing RLS policies to use organization_id directly for better performance.
--    The old policies used funnel_id -> sales_funnels.organization_id (indirect join).
--    With organization_id on the table, we can filter directly.

-- Drop old policies (names may vary — try all known names)
DROP POLICY IF EXISTS "Enable all access for org members" ON public.funnel_source_mappings;
DROP POLICY IF EXISTS "Users can view funnel source mappings" ON public.funnel_source_mappings;
DROP POLICY IF EXISTS "Users can insert funnel source mappings" ON public.funnel_source_mappings;
DROP POLICY IF EXISTS "Users can update funnel source mappings" ON public.funnel_source_mappings;
DROP POLICY IF EXISTS "Users can delete funnel source mappings" ON public.funnel_source_mappings;
DROP POLICY IF EXISTS "org_members_can_manage_funnel_source_mappings" ON public.funnel_source_mappings;
DROP POLICY IF EXISTS "org members can manage funnel source mappings" ON public.funnel_source_mappings;

-- Create unified policy: org members can fully manage their own org's mappings
CREATE POLICY "org_members_can_manage_funnel_source_mappings"
  ON public.funnel_source_mappings
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
