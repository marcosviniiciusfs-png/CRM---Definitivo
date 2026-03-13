-- ============================================================
-- Fix RLS policies for lead distribution tables
-- lead_distribution_configs: admins can manage, members can view
-- lead_distribution_history: members can view, edge functions insert via service_role
-- ============================================================

-- ============================================================
-- LEAD_DISTRIBUTION_CONFIGS
-- ============================================================

-- Enable RLS (idempotent)
ALTER TABLE public.lead_distribution_configs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "org_members_can_view_distribution_configs" ON public.lead_distribution_configs;
DROP POLICY IF EXISTS "org_admins_can_insert_distribution_configs" ON public.lead_distribution_configs;
DROP POLICY IF EXISTS "org_admins_can_update_distribution_configs" ON public.lead_distribution_configs;
DROP POLICY IF EXISTS "org_admins_can_delete_distribution_configs" ON public.lead_distribution_configs;
DROP POLICY IF EXISTS "Members can view distribution configs" ON public.lead_distribution_configs;
DROP POLICY IF EXISTS "Admins can manage distribution configs" ON public.lead_distribution_configs;

-- SELECT: todos os membros ativos da org podem ver as roletas
CREATE POLICY "org_members_can_view_distribution_configs"
  ON public.lead_distribution_configs
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
  );

-- INSERT: apenas admins/owners podem criar roletas
CREATE POLICY "org_admins_can_insert_distribution_configs"
  ON public.lead_distribution_configs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_admin(auth.uid(), organization_id)
  );

-- UPDATE: apenas admins/owners podem atualizar roletas
CREATE POLICY "org_admins_can_update_distribution_configs"
  ON public.lead_distribution_configs
  FOR UPDATE
  TO authenticated
  USING (
    public.is_org_admin(auth.uid(), organization_id)
  )
  WITH CHECK (
    public.is_org_admin(auth.uid(), organization_id)
  );

-- DELETE: apenas admins/owners podem deletar roletas
CREATE POLICY "org_admins_can_delete_distribution_configs"
  ON public.lead_distribution_configs
  FOR DELETE
  TO authenticated
  USING (
    public.is_org_admin(auth.uid(), organization_id)
  );

-- ============================================================
-- LEAD_DISTRIBUTION_HISTORY
-- ============================================================

-- Enable RLS (idempotent)
ALTER TABLE public.lead_distribution_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "org_members_can_view_distribution_history" ON public.lead_distribution_history;
DROP POLICY IF EXISTS "org_admins_can_view_distribution_history" ON public.lead_distribution_history;
DROP POLICY IF EXISTS "Members can view distribution history" ON public.lead_distribution_history;

-- SELECT: todos os membros da org podem ver o histórico
CREATE POLICY "org_members_can_view_distribution_history"
  ON public.lead_distribution_history
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
  );

-- INSERT para distribution history é feito via edge function com service_role
-- portanto não precisa de policy para authenticated
-- Mas adicionamos uma para admins poderem inserir manualmente se necessário
CREATE POLICY "org_admins_can_insert_distribution_history"
  ON public.lead_distribution_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_admin(auth.uid(), organization_id)
  );

NOTIFY pgrst, 'reload schema';
