-- ============================================================
-- Redistribution Batches: track each redistribution run
-- Also adds batch_id to lead_distribution_history for grouping
-- ============================================================

-- 1. Create redistribution_batches table
CREATE TABLE IF NOT EXISTS public.redistribution_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  config_id UUID REFERENCES public.lead_distribution_configs(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  batch_type TEXT NOT NULL CHECK (batch_type IN ('manual', 'auto', 'redistribution')),
  total_leads INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'redistributed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_redistribution_batches_org
  ON public.redistribution_batches (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_redistribution_batches_config
  ON public.redistribution_batches (config_id);

-- 3. Add batch_id column to lead_distribution_history
ALTER TABLE public.lead_distribution_history
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.redistribution_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lead_distribution_history_batch_id
  ON public.lead_distribution_history (batch_id);

-- 4. RLS
ALTER TABLE public.redistribution_batches ENABLE ROW LEVEL SECURITY;

-- SELECT: org members can view batches
CREATE POLICY "org_members_can_view_redistribution_batches"
  ON public.redistribution_batches
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
  );

-- INSERT: edge functions use service_role, but admins can insert too
CREATE POLICY "org_admins_can_insert_redistribution_batches"
  ON public.redistribution_batches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_admin(auth.uid(), organization_id)
  );

-- UPDATE: admins can update batch status (for marking as redistributed)
CREATE POLICY "org_admins_can_update_redistribution_batches"
  ON public.redistribution_batches
  FOR UPDATE
  TO authenticated
  USING (
    public.is_org_admin(auth.uid(), organization_id)
  )
  WITH CHECK (
    public.is_org_admin(auth.uid(), organization_id)
  );

NOTIFY pgrst, 'reload schema';
