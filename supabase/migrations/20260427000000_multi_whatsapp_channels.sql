-- ============================================================
-- Multi-WhatsApp Channels: add channel metadata and lead association
-- ============================================================

-- 1. Adicionar nome do canal e cor na tabela whatsapp_instances
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS channel_name TEXT;

ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS channel_color TEXT DEFAULT '#25D366';

-- 2. Adicionar referencia ao canal na tabela leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS whatsapp_instance_id UUID
  REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;

-- 3. Indice para queries de filtro por canal no Chat
CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_instance
  ON public.leads(whatsapp_instance_id)
  WHERE whatsapp_instance_id IS NOT NULL;

-- 4. Backfill: associar leads WhatsApp existentes a instancia ativa da org
UPDATE public.leads l
SET whatsapp_instance_id = wi.id
FROM public.whatsapp_instances wi
WHERE l.organization_id = wi.organization_id
  AND wi.status = 'CONNECTED'
  AND l.whatsapp_instance_id IS NULL
  AND (l.source = 'WhatsApp' OR l.source = 'whatsapp');

-- 5. Atribuir nome padrao para instancias existentes sem channel_name
UPDATE public.whatsapp_instances
SET channel_name = 'WhatsApp Principal'
WHERE channel_name IS NULL AND status = 'CONNECTED';
