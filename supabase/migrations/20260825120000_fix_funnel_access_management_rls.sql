-- Permite que owners e admins gerenciem a restricao e a whitelist dos funis.
-- As funcoes is_org_admin/is_org_member sao SECURITY DEFINER e evitam recursao RLS.

ALTER TABLE public.sales_funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_collaborators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_admins_can_update_funnels" ON public.sales_funnels;
CREATE POLICY "org_admins_can_update_funnels"
  ON public.sales_funnels
  FOR UPDATE
  TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id))
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

DROP POLICY IF EXISTS "funnel_collaborators_select" ON public.funnel_collaborators;
CREATE POLICY "funnel_collaborators_select"
  ON public.funnel_collaborators
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "funnel_collaborators_insert" ON public.funnel_collaborators;
CREATE POLICY "funnel_collaborators_insert"
  ON public.funnel_collaborators
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_admin(auth.uid(), organization_id)
    AND EXISTS (
      SELECT 1
      FROM public.sales_funnels sf
      WHERE sf.id = funnel_collaborators.funnel_id
        AND sf.organization_id = funnel_collaborators.organization_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.user_id = funnel_collaborators.user_id
        AND om.organization_id = funnel_collaborators.organization_id
        AND om.is_active = true
    )
  );

DROP POLICY IF EXISTS "funnel_collaborators_update" ON public.funnel_collaborators;
CREATE POLICY "funnel_collaborators_update"
  ON public.funnel_collaborators
  FOR UPDATE
  TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id))
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

DROP POLICY IF EXISTS "funnel_collaborators_delete" ON public.funnel_collaborators;
CREATE POLICY "funnel_collaborators_delete"
  ON public.funnel_collaborators
  FOR DELETE
  TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

NOTIFY pgrst, 'reload schema';
