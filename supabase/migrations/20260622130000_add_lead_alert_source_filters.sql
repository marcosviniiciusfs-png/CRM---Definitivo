ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS lead_alert_source_filters text[] NOT NULL
  DEFAULT ARRAY['whatsapp','facebook','webhook']::text[];

UPDATE public.whatsapp_instances
SET lead_alert_source_filters = ARRAY['whatsapp','facebook','webhook']::text[]
WHERE lead_alert_source_filters IS NULL
   OR array_length(lead_alert_source_filters, 1) IS NULL;

COMMENT ON COLUMN public.whatsapp_instances.lead_alert_source_filters IS
  'Lead origins that should trigger WhatsApp group alerts: whatsapp, facebook, webhook.';
