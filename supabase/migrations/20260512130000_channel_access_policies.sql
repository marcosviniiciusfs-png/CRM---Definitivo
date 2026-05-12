-- ============================================================
-- Channel access control policies (substitui SELECT policies)
-- ============================================================
-- Substitui as policies de SELECT de leads, mensagens_chat e
-- mensagens_grupo para consumirem as funcoes criadas na migration
-- 20260512120000_channel_access_helpers.
--
-- INSERT/UPDATE/DELETE NAO mudam — webhooks/edges usam service_role
-- e ja bypassam RLS na escrita.

-- ============================================================
-- LEADS
-- ============================================================
DROP POLICY IF EXISTS "Team visibility by organization" ON public.leads;

CREATE POLICY leads_select_v2 ON public.leads
  FOR SELECT TO authenticated
  USING (public.user_can_access_lead(id));

-- ============================================================
-- MENSAGENS_CHAT
-- ============================================================
DROP POLICY IF EXISTS "org_members_can_view_chat_messages" ON public.mensagens_chat;

CREATE POLICY mensagens_chat_select_v2 ON public.mensagens_chat
  FOR SELECT TO authenticated
  USING (public.user_can_access_lead(id_lead));

-- ============================================================
-- MENSAGENS_GRUPO
-- ============================================================
DROP POLICY IF EXISTS "mensagens_grupo_org_members_select" ON public.mensagens_grupo;

CREATE POLICY mensagens_grupo_select_v2 ON public.mensagens_grupo
  FOR SELECT TO authenticated
  USING (public.user_can_access_channel(whatsapp_instance_id));
