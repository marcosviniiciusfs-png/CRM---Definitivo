-- Ajustes idempotentes exclusivos do destino, executados APOS o restore.
-- Nao transforme este arquivo em migration da aplicacao.
--
-- Uso preferencial: exporte NEW_SUPABASE_PUBLIC_URL,
-- OLD_SUPABASE_PUBLIC_URL e CRON_SECRET no ambiente e execute o arquivo. O
-- segredo nao deve ser passado na linha de comando/process list.
--
-- O segredo e cifrado pelo Supabase Vault. Os comandos persistidos em
-- cron.job contem somente uma consulta ao Vault: nao contem JWT nem segredo.
-- A URL do cron e deliberadamente interna ao Docker Compose. O container do
-- Postgres precisa resolver api-gw e alcancar a porta 8000 na mesma network.

\set ON_ERROR_STOP on
\pset pager off

\if :{?new_public_url}
\else
  \set new_public_url ''
  \getenv new_public_url NEW_SUPABASE_PUBLIC_URL
\endif

\if :{?old_public_url}
\else
  \set old_public_url ''
  \getenv old_public_url OLD_SUPABASE_PUBLIC_URL
\endif

\if :{?cron_secret}
\else
  \set cron_secret ''
  \getenv cron_secret CRON_SECRET
\endif

BEGIN;

CREATE TEMP TABLE _crm_post_restore_input (
  new_public_url text NOT NULL,
  old_public_url text NOT NULL,
  cron_secret text NOT NULL
) ON COMMIT DROP;

INSERT INTO _crm_post_restore_input
  (new_public_url, old_public_url, cron_secret)
VALUES (
  regexp_replace(:'new_public_url', '/+$', ''),
  regexp_replace(:'old_public_url', '/+$', ''),
  :'cron_secret'
);

DO $validation$
DECLARE
  input record;
BEGIN
  SELECT * INTO STRICT input FROM _crm_post_restore_input;

  IF input.new_public_url !~ '^https://[^/?#]+$'
     OR input.old_public_url !~ '^https://[^/?#]+$' THEN
    RAISE EXCEPTION
      'new_public_url e old_public_url devem ser origins HTTPS, sem path, query ou fragment';
  END IF;

  IF input.new_public_url = input.old_public_url THEN
    RAISE EXCEPTION 'new_public_url deve ser diferente de old_public_url';
  END IF;

  IF length(input.cron_secret) < 32
     OR input.cron_secret ~ '[[:space:]]' THEN
    RAISE EXCEPTION
      'cron_secret deve ter no minimo 32 caracteres e nao conter espacos';
  END IF;
END
$validation$;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS vault;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- The pinned Realtime image creates this check as NOT VALID. The green has no
-- application traffic during post-restore, so validate it before acceptance.
ALTER TABLE realtime.messages
  VALIDATE CONSTRAINT messages_payload_exclusive;

-- Nomes de segredo no Vault nao sao necessariamente unicos. Falhar e mais
-- seguro do que atualizar silenciosamente um registro ambiguo.
DO $vault_validation$
DECLARE
  matching_secrets integer;
BEGIN
  SELECT count(*)::integer
  INTO matching_secrets
  FROM vault.secrets
  WHERE name = 'crm_cron_secret';

  IF matching_secrets > 1 THEN
    RAISE EXCEPTION
      'Vault contem mais de um segredo chamado crm_cron_secret; consolide-os antes de continuar';
  END IF;
END
$vault_validation$;

WITH existing AS MATERIALIZED (
  SELECT id
  FROM vault.secrets
  WHERE name = 'crm_cron_secret'
),
updated AS MATERIALIZED (
  SELECT vault.update_secret(
    secret_id := existing.id,
    new_secret := input.cron_secret,
    new_name := 'crm_cron_secret',
    new_description := 'Autenticacao dos jobs internos do CRM'
  )
  FROM existing
  CROSS JOIN _crm_post_restore_input AS input
),
inserted AS MATERIALIZED (
  SELECT vault.create_secret(
    new_secret := input.cron_secret,
    new_name := 'crm_cron_secret',
    new_description := 'Autenticacao dos jobs internos do CRM'
  )
  FROM _crm_post_restore_input AS input
  WHERE NOT EXISTS (SELECT 1 FROM existing)
)
SELECT
  (SELECT count(*) FROM updated) + (SELECT count(*) FROM inserted)
    AS vault_secret_records_written;

-- Remove todas as copias com estes nomes antes de recriar cada job uma vez.
DO $cron_cleanup$
DECLARE
  existing_job record;
BEGIN
  FOR existing_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'send-scheduled-reminders',
      'auto-redistribute-leads',
      'sync-google-sheets'
    )
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;
END
$cron_cleanup$;

SELECT cron.schedule(
  'send-scheduled-reminders',
  '* * * * *',
  $job$
    SELECT net.http_post(
      url := 'http://api-gw:8000/functions/v1/send-scheduled-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'crm_cron_secret'
          LIMIT 1
        )
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $job$
) AS send_scheduled_reminders_jobid;

SELECT cron.schedule(
  'auto-redistribute-leads',
  '*/5 * * * *',
  $job$
    SELECT net.http_post(
      url := 'http://api-gw:8000/functions/v1/auto-redistribute-leads',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'crm_cron_secret'
          LIMIT 1
        )
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $job$
) AS auto_redistribute_leads_jobid;

SELECT cron.schedule(
  'sync-google-sheets',
  '*/2 * * * *',
  $job$
    SELECT net.http_post(
      url := 'http://api-gw:8000/functions/v1/sync-google-sheets',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'crm_cron_secret'
          LIMIT 1
        )
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $job$
) AS sync_google_sheets_jobid;

-- Os jobs sao criados estruturalmente prontos, mas cada um precisa ser
-- liberado por uma invocacao explicita e allowlisted de 07-post-restore.sh.
UPDATE cron.job
SET active = false
WHERE jobname IN (
  'send-scheduled-reminders',
  'auto-redistribute-leads',
  'sync-google-sheets'
);

-- Corrige apenas valores iguais ao origin antigo ou iniciados por
-- "origin-antigo/". Isso evita substituir texto incidental ou outro dominio.
DO $url_rewrite$
DECLARE
  input record;
  target record;
  affected_rows bigint;
BEGIN
  SELECT * INTO STRICT input FROM _crm_post_restore_input;

  FOR target IN
    SELECT *
    FROM (VALUES
      ('public', 'profiles', 'avatar_url'),
      ('public', 'teams', 'avatar_url'),
      ('public', 'mensagens_chat', 'media_url'),
      ('public', 'mensagens_grupo', 'media_url'),
      ('public', 'whatsapp_instances', 'webhook_url')
    ) AS targets(schema_name, table_name, column_name)
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns AS c
      WHERE c.table_schema = target.schema_name
        AND c.table_name = target.table_name
        AND c.column_name = target.column_name
        AND c.data_type IN ('text', 'character varying', 'character')
    ) THEN
      EXECUTE format(
        'UPDATE %I.%I
         SET %I = $1 || substring(%I::text FROM char_length($2) + 1)
         WHERE %I::text = $2
            OR left(%I::text, char_length($2) + 1) = $2 || ''/''',
        target.schema_name,
        target.table_name,
        target.column_name,
        target.column_name,
        target.column_name,
        target.column_name
      )
      USING input.new_public_url, input.old_public_url;

      GET DIAGNOSTICS affected_rows = ROW_COUNT;
      RAISE NOTICE '%.%.%: % URL(s) atualizada(s)',
        target.schema_name,
        target.table_name,
        target.column_name,
        affected_rows;
    ELSE
      RAISE NOTICE '%.%.% ausente ou nao textual; ajuste ignorado',
        target.schema_name,
        target.table_name,
        target.column_name;
    END IF;
  END LOOP;
END
$url_rewrite$;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

COMMIT;

\echo 'Post-restore concluido. Execute target-validation.sql e o smoke test HTTP.'
