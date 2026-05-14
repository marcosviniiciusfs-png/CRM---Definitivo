-- ============================================================
-- Lead Channel Memberships (transferencia entre canais WhatsApp)
-- ============================================================
-- Permite que um mesmo lead exista simultaneamente em multiplos
-- canais WhatsApp da mesma org, com conversas isoladas por canal
-- (cada msg ganha whatsapp_instance_id). Quando atendimento
-- transfere o lead para suporte, criamos a membership com
-- source='transferred' marcando transferred_from + transferred_at,
-- e a UI mostra o historico do canal de origem como read-only.
-- ============================================================

-- 1) Nova coluna em mensagens_chat: canal pelo qual a msg
-- entrou/saiu. NULL aceitavel durante a janela de backfill;
-- novos inserts (apos deploy das Edge Functions) preenchem.
ALTER TABLE public.mensagens_chat
  ADD COLUMN IF NOT EXISTS whatsapp_instance_id UUID
  REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mensagens_chat_lead_instance_data
  ON public.mensagens_chat (id_lead, whatsapp_instance_id, data_hora DESC);

-- 2) Nova tabela de memberships
CREATE TABLE IF NOT EXISTS public.lead_channel_memberships (
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  whatsapp_instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('inbound', 'transferred')),
  transferred_from_instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  transferred_at TIMESTAMPTZ,
  transferred_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (lead_id, whatsapp_instance_id),
  CONSTRAINT transferred_fields_consistency CHECK (
    (source = 'transferred' AND transferred_from_instance_id IS NOT NULL AND transferred_at IS NOT NULL)
    OR (source = 'inbound' AND transferred_from_instance_id IS NULL AND transferred_at IS NULL AND transferred_by_user_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_lcm_instance_lastmsg
  ON public.lead_channel_memberships (whatsapp_instance_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_lcm_org
  ON public.lead_channel_memberships (organization_id);

-- 3) RLS
ALTER TABLE public.lead_channel_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lcm_org_select ON public.lead_channel_memberships;
CREATE POLICY lcm_org_select ON public.lead_channel_memberships
  FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

-- Sem policy de INSERT/UPDATE/DELETE: bloqueado para anon/authenticated.
-- Apenas service_role (Edge Functions) escreve. RLS bypass via service_role.

-- 4) Realtime publication
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_channel_memberships;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- 5) Backfill: lead com whatsapp_instance_id ganha membership 'inbound'
INSERT INTO public.lead_channel_memberships
  (lead_id, whatsapp_instance_id, organization_id, source, last_message_at, created_at)
SELECT id, whatsapp_instance_id, organization_id, 'inbound',
       COALESCE(last_message_at, updated_at, created_at), created_at
FROM public.leads
WHERE whatsapp_instance_id IS NOT NULL
ON CONFLICT (lead_id, whatsapp_instance_id) DO NOTHING;
