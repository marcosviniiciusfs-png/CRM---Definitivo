-- ============================================================
-- FIX CRITICAL BUGS
--
-- 1. Add data_agendamento_venda to leads table
--    (EditLeadModal queries/updates this column but it didn't exist)
--
-- 2. Fix lead_activities RLS policies
--    (INSERT was returning 403 because no permissive policy existed)
--
-- This script is IDEMPOTENT — safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. ADD data_agendamento_venda COLUMN TO leads
-- ============================================================
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS data_agendamento_venda TIMESTAMP WITH TIME ZONE;

-- ============================================================
-- 2. FIX lead_activities RLS POLICIES
-- ============================================================

-- Ensure RLS is enabled
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them cleanly
DROP POLICY IF EXISTS "Users can view activities for their org leads" ON public.lead_activities;
DROP POLICY IF EXISTS "Users can insert activities for their org leads" ON public.lead_activities;
DROP POLICY IF EXISTS "Users can update their own activities" ON public.lead_activities;
DROP POLICY IF EXISTS "Users can delete their own activities" ON public.lead_activities;
DROP POLICY IF EXISTS "lead_activities_select_policy" ON public.lead_activities;
DROP POLICY IF EXISTS "lead_activities_insert_policy" ON public.lead_activities;
DROP POLICY IF EXISTS "lead_activities_update_policy" ON public.lead_activities;
DROP POLICY IF EXISTS "lead_activities_delete_policy" ON public.lead_activities;
-- Drop any other possibly named policies
DROP POLICY IF EXISTS "Enable read access for all users" ON public.lead_activities;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.lead_activities;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON public.lead_activities;
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON public.lead_activities;

-- Helper: check that the authenticated user belongs to the same org as the lead
-- SELECT: members can read activities for leads in their organization
CREATE POLICY "lead_activities_select_policy"
ON public.lead_activities
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.organization_members om ON om.organization_id = l.organization_id
    WHERE l.id = lead_activities.lead_id
      AND om.user_id = auth.uid()
  )
);

-- INSERT: authenticated users can add activities to leads in their organization
CREATE POLICY "lead_activities_insert_policy"
ON public.lead_activities
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.organization_members om ON om.organization_id = l.organization_id
    WHERE l.id = lead_activities.lead_id
      AND om.user_id = auth.uid()
  )
);

-- UPDATE: users can only edit their own activities
CREATE POLICY "lead_activities_update_policy"
ON public.lead_activities
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- DELETE: users can only delete their own activities
CREATE POLICY "lead_activities_delete_policy"
ON public.lead_activities
FOR DELETE
USING (auth.uid() = user_id);
