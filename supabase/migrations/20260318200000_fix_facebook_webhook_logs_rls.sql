-- Fix facebook_webhook_logs RLS: add SELECT policy so org members can see their own logs
-- Context: table had RLS enabled but NO select policy, so users always got empty results []
-- even though their webhook logs existed in the DB (visible only via service_role).

-- Allow org members to SELECT their own org's logs
CREATE POLICY "org_members_can_view_own_webhook_logs"
  ON public.facebook_webhook_logs
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
