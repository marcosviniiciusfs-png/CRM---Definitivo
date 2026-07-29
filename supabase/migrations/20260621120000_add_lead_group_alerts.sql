ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS lead_alerts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lead_alert_group_id text,
  ADD COLUMN IF NOT EXISTS lead_alert_last_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_lead_alerts
  ON public.whatsapp_instances (organization_id)
  WHERE lead_alerts_enabled IS TRUE;

COMMENT ON COLUMN public.whatsapp_instances.lead_alert_group_id IS
  'WhatsApp group JID used for internal new-lead alerts, e.g. 120363...@g.us.';
