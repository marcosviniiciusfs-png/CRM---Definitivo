-- ============================================================
-- Mensagens de grupo do WhatsApp
-- ============================================================
-- Tabela separada de mensagens_chat para evitar regressoes:
-- mensagens_chat exige id_lead NOT NULL e e usada por toda a UI de
-- conversas de leads. Grupos nao sao leads — guardamos aqui.
--
-- Webhook (whatsapp-message-webhook) ganha um branch para @g.us que
-- INSERT aqui em vez de descartar.
--
-- send-group-message tambem grava aqui (direcao=SAIDA) para refletir
-- imediatamente na UI da aba Grupos do Chat.

CREATE TABLE IF NOT EXISTS public.mensagens_grupo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  whatsapp_instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,                    -- ex: "120363xxxxx@g.us"
  group_subject TEXT,                        -- cache do nome do grupo no momento da msg
  evolution_message_id TEXT,                 -- id devolvido pela Evolution API
  sender_jid TEXT,                           -- JID de quem mandou: "5511...@s.whatsapp.net"
  sender_pushname TEXT,                      -- nome exibido no WhatsApp do remetente
  corpo_mensagem TEXT NOT NULL DEFAULT '',
  direcao TEXT NOT NULL CHECK (direcao IN ('ENTRADA', 'SAIDA')),
  data_hora TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status_entrega TEXT,                        -- SENT / DELIVERED / READ (mensagens enviadas pelo CRM)
  media_url TEXT,
  media_type TEXT,                            -- image / video / audio / document / sticker / gif
  media_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices para timeline rapida.
CREATE INDEX IF NOT EXISTS idx_mensagens_grupo_canal_grupo_data
  ON public.mensagens_grupo (whatsapp_instance_id, group_id, data_hora DESC);

CREATE INDEX IF NOT EXISTS idx_mensagens_grupo_org
  ON public.mensagens_grupo (organization_id);

-- Idempotencia contra reprocessamento de webhook (mesmo evolution_message_id
-- nao deve duplicar). Permite NULLs (mensagens antes de termos id estavel).
CREATE UNIQUE INDEX IF NOT EXISTS uq_mensagens_grupo_evid
  ON public.mensagens_grupo (whatsapp_instance_id, group_id, evolution_message_id)
  WHERE evolution_message_id IS NOT NULL;

ALTER TABLE public.mensagens_grupo ENABLE ROW LEVEL SECURITY;

-- Policy: members da org podem SELECT (igual ao padrao de mensagens_chat).
DROP POLICY IF EXISTS "mensagens_grupo_org_members_select" ON public.mensagens_grupo;
CREATE POLICY "mensagens_grupo_org_members_select" ON public.mensagens_grupo
  FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE: somente service_role (webhooks/edge functions).
-- Usuarios nao gravam diretamente — sempre via send-group-message.
-- Sem policy de WRITE -> bloqueado para anon/authenticated por default.

-- Adiciona ao publication do Realtime para que o frontend receba INSERTs.
-- ALTER PUBLICATION e idempotente para a mesma tabela apenas se ja existir;
-- usamos um DO/EXCEPTION para nao falhar se a tabela ja estiver na publication.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagens_grupo;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
