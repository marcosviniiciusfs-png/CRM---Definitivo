-- ============================================================
-- HOTFIX 2: Split Leads_Access (cmd=ALL) into cmd-specific policies
-- ============================================================
-- Descoberto pelo teste de aceitacao (Task 3): mesmo com leads_select_v2
-- aplicando o filtro de canal, a policy antiga `Leads_Access` (cmd=ALL,
-- USING has_org_access(organization_id)) continuava deixando qualquer
-- membro da org ler todos os leads. Em RLS PERMISSIVE, multiplas policies
-- sao OR-ed — basta uma retornar TRUE para a linha aparecer.
--
-- Solucao: dropar Leads_Access e recriar como 3 policies SEPARADAS
-- (INSERT/UPDATE/DELETE), preservando o comportamento de escrita por
-- org member (que e o que webhooks/edges esperam). SELECT fica
-- exclusivamente sob leads_select_v2.
--
-- Super_Admin_Bypass_v6 (cmd=ALL) tambem aplica a SELECT mas usa
-- has_role(auth.uid(), 'super_admin'), que so e TRUE para super admins
-- da plataforma — nao vaza para usuarios normais.

DROP POLICY IF EXISTS "Leads_Access" ON public.leads;

CREATE POLICY leads_insert_v2 ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_access(organization_id));

CREATE POLICY leads_update_v2 ON public.leads
  FOR UPDATE TO authenticated
  USING (public.has_org_access(organization_id))
  WITH CHECK (public.has_org_access(organization_id));

CREATE POLICY leads_delete_v2 ON public.leads
  FOR DELETE TO authenticated
  USING (public.has_org_access(organization_id));
