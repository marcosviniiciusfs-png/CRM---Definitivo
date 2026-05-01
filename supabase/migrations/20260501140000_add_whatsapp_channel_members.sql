-- ============================================================
-- WhatsApp channel members: atribuicao de colaboradores a canais
-- ============================================================
-- Cada whatsapp_instance pode ter N colaboradores atribuidos.
-- Cada colaborador pode estar atribuido a N canais.
--
-- Regra de negocio:
--   - Owner/Admin veem TODOS os canais e leads, mesmo sem estar
--     listados nesta tabela. A presenca aqui nao concede privilegios
--     extras a esses papeis.
--   - Member ve apenas leads dos canais em que esta atribuido.
--
-- O filtro pratico e aplicado pelo frontend (Chat, ChannelSelector,
-- ChatMessageNotificationContext). RLS aqui protege apenas escrita
-- na propria tabela; nao mexe nas policies de leads / mensagens_chat
-- para evitar regressoes em outras paginas.

CREATE TABLE IF NOT EXISTS public.whatsapp_channel_members (
  whatsapp_instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (whatsapp_instance_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_wcm_user
  ON public.whatsapp_channel_members(user_id);

CREATE INDEX IF NOT EXISTS idx_wcm_organization
  ON public.whatsapp_channel_members(organization_id);

ALTER TABLE public.whatsapp_channel_members ENABLE ROW LEVEL SECURITY;

-- Owner/admin da org pode INSERT/UPDATE/DELETE/SELECT atribuicoes da sua org.
DROP POLICY IF EXISTS "wcm_admin_manage" ON public.whatsapp_channel_members;
CREATE POLICY "wcm_admin_manage" ON public.whatsapp_channel_members
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = whatsapp_channel_members.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = whatsapp_channel_members.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- Qualquer member da org pode LER suas proprias atribuicoes.
DROP POLICY IF EXISTS "wcm_self_read" ON public.whatsapp_channel_members;
CREATE POLICY "wcm_self_read" ON public.whatsapp_channel_members
  FOR SELECT
  USING (user_id = auth.uid());

-- Adicionar a tabela na publication do Realtime para receber updates.
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_channel_members;
