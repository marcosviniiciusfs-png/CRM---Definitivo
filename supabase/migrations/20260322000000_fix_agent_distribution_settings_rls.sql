-- ============================================================
-- Fix RLS policies for agent_distribution_settings
-- Users can manage their own settings.
-- Admins/owners can manage any member's settings in the org.
-- ============================================================

-- Enable RLS (idempotent)
ALTER TABLE public.agent_distribution_settings ENABLE ROW LEVEL SECURITY;

-- Drop quaisquer policies antigas (nomes possíveis de versões anteriores)
DROP POLICY IF EXISTS "Users can view their organization's agent settings" ON public.agent_distribution_settings;
DROP POLICY IF EXISTS "Users can manage their own settings" ON public.agent_distribution_settings;
DROP POLICY IF EXISTS "Deny public access to agent settings" ON public.agent_distribution_settings;
DROP POLICY IF EXISTS "org_members_can_view_agent_settings" ON public.agent_distribution_settings;
DROP POLICY IF EXISTS "users_can_insert_own_agent_settings" ON public.agent_distribution_settings;
DROP POLICY IF EXISTS "users_can_update_own_agent_settings" ON public.agent_distribution_settings;
DROP POLICY IF EXISTS "org_admins_can_delete_agent_settings" ON public.agent_distribution_settings;

-- SELECT: todos os membros ativos da org podem ver os settings
CREATE POLICY "org_members_can_view_agent_settings"
  ON public.agent_distribution_settings
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
  );

-- INSERT: usuário pode inserir seu próprio setting,
--         admin/owner pode inserir o de qualquer membro
CREATE POLICY "users_can_insert_own_agent_settings"
  ON public.agent_distribution_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_org_admin(auth.uid(), organization_id)
  );

-- UPDATE: usuário pode atualizar o próprio,
--         admin/owner pode atualizar qualquer um da org
CREATE POLICY "users_can_update_own_agent_settings"
  ON public.agent_distribution_settings
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_org_admin(auth.uid(), organization_id)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_org_admin(auth.uid(), organization_id)
  );

-- DELETE: apenas admins/owners
CREATE POLICY "org_admins_can_delete_agent_settings"
  ON public.agent_distribution_settings
  FOR DELETE
  TO authenticated
  USING (
    public.is_org_admin(auth.uid(), organization_id)
  );

NOTIFY pgrst, 'reload schema';
