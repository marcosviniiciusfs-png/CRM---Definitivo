-- Regras de interesse do aviso de novos leads no grupo.
-- Cada regra liga palavras-chave a um texto de interesse: se a primeira mensagem do lead
-- no WhatsApp tiver uma das palavras, o aviso mostra esse interesse.
-- Formato: [{"interest": "Moto", "keywords": ["moto", "motocicleta"]}]
-- As regras valem na ordem; a primeira que bater define o interesse.
-- Rollback: ALTER TABLE public.whatsapp_instances DROP COLUMN IF EXISTS lead_alert_interest_rules;

ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS lead_alert_interest_rules jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.whatsapp_instances
  DROP CONSTRAINT IF EXISTS whatsapp_instances_lead_alert_interest_rules_is_array;
ALTER TABLE public.whatsapp_instances
  ADD CONSTRAINT whatsapp_instances_lead_alert_interest_rules_is_array
  CHECK (jsonb_typeof(lead_alert_interest_rules) = 'array');

COMMENT ON COLUMN public.whatsapp_instances.lead_alert_interest_rules IS
  'Rules mapping first-message keywords to the interest shown in the lead group alert: [{interest, keywords[]}].';

NOTIFY pgrst, 'reload schema';
