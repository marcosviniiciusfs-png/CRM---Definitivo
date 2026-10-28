-- Reenvio automatico de alertas de novos leads que nao chegaram ao grupo.
-- A cada 10 minutos reenvia, no maximo 10 por execucao, os leads das ultimas 2h
-- sem alerta de sucesso. Mesmo padrao dos outros crons (x-cron-secret do vault).

DO $$
BEGIN
  PERFORM cron.unschedule('notify-lead-alert-sweep');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'notify-lead-alert-sweep',
  '*/10 * * * *',
  $cron$
    SELECT net.http_post(
      url := 'http://api-gw:8000/functions/v1/notify-new-lead-group',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'crm_cron_secret'
          LIMIT 1
        )
      ),
      body := '{"mode":"sweep"}'::jsonb
    ) AS request_id;
  $cron$
);
