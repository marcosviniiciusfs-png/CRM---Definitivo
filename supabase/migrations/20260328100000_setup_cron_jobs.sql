-- ============================================================
-- Configurar cron jobs server-side para:
--   1. Disparar lembretes WhatsApp agendados (send-scheduled-reminders)
--   2. Redistribuir leads sem interação (auto-redistribute-leads)
-- Requer extensões pg_cron e pg_net habilitadas no projeto Supabase.
-- ============================================================

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remover agendamentos antigos (idempotente)
DO $$
BEGIN
  PERFORM cron.unschedule('send-scheduled-reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('auto-redistribute-leads');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- Agendar send-scheduled-reminders a cada minuto
SELECT cron.schedule(
  'send-scheduled-reminders',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://uxttihjsxfowursjyult.supabase.co/functions/v1/send-scheduled-reminders',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4dHRpaGpzeGZvd3Vyc2p5dWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4ODM5NTAsImV4cCI6MjA4NDQ1OTk1MH0.-gyL85krJA-16ieNnCtoi-HK-oXxSLl1m26yMJLKmxA"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);

-- Agendar auto-redistribute-leads a cada minuto
SELECT cron.schedule(
  'auto-redistribute-leads',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://uxttihjsxfowursjyult.supabase.co/functions/v1/auto-redistribute-leads',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4dHRpaGpzeGZvd3Vyc2p5dWx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg4ODM5NTAsImV4cCI6MjA4NDQ1OTk1MH0.-gyL85krJA-16ieNnCtoi-HK-oXxSLl1m26yMJLKmxA"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
);
