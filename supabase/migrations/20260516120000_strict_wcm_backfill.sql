-- ============================================================
-- Strict WCM backfill (channel access tightening)
-- ============================================================
-- Pre-condicao: frontend hoje libera leads para members sem WCM
-- (fallback "Set vazio = visivel"). Os fixes do frontend tornam
-- o filtro estrito: member sem nenhuma row em whatsapp_channel_members
-- (WCM) deixa de ver leads WhatsApp.
--
-- Este backfill defensivo preserva o estado de acesso atual no
-- instante do deploy. Para cada org com 1+ canal CONNECTED e member
-- nao-owner que esta sem nenhuma row WCM nessa org, insere uma row
-- por canal CONNECTED. Daí em diante, owner controla o acesso de
-- cada member adicionando/removendo rows manualmente.
--
-- Idempotente: PK composta (whatsapp_instance_id, user_id) +
-- ON CONFLICT garantem que rodar duas vezes nao gera erro nem
-- duplica.
-- ============================================================

INSERT INTO public.whatsapp_channel_members (organization_id, user_id, whatsapp_instance_id)
SELECT om.organization_id, om.user_id, wi.id
FROM public.organization_members om
JOIN public.whatsapp_instances wi
  ON wi.organization_id = om.organization_id
 AND wi.status = 'CONNECTED'
LEFT JOIN public.whatsapp_channel_members existing
  ON existing.organization_id = om.organization_id
 AND existing.user_id = om.user_id
WHERE om.role <> 'owner'
  AND existing.user_id IS NULL
ON CONFLICT (whatsapp_instance_id, user_id) DO NOTHING;
