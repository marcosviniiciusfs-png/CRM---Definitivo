-- Inventario estrutural e quantitativo da origem Supabase.
--
-- Este arquivo e estritamente somente-leitura. Ele nao lista registros de
-- negocio, e-mails, telefones, nomes de objetos, comandos do pg_cron nem
-- qualquer segredo. Execute com psql e preserve a saida para comparar com
-- target-validation.sql depois da restauracao.

\set ON_ERROR_STOP on
\pset pager off
\pset null '<null>'
\timing on

\echo '=== database ==='
SELECT
  current_database() AS database_name,
  current_setting('server_version') AS server_version,
  pg_database_size(current_database()) AS database_bytes,
  pg_size_pretty(pg_database_size(current_database())) AS database_size;

\echo '=== extensions ==='
SELECT
  e.extname AS extension_name,
  e.extversion AS extension_version,
  n.nspname AS schema_name
FROM pg_extension AS e
JOIN pg_namespace AS n ON n.oid = e.extnamespace
ORDER BY e.extname;

\echo '=== relation inventory (counts are planner estimates; no row contents) ==='
SELECT
  n.nspname AS schema_name,
  c.relname AS relation_name,
  CASE c.relkind
    WHEN 'r' THEN 'table'
    WHEN 'p' THEN 'partitioned_table'
    WHEN 'm' THEN 'materialized_view'
    ELSE c.relkind::text
  END AS relation_type,
  GREATEST(c.reltuples, 0)::bigint AS estimated_rows,
  COALESCE(s.n_live_tup, 0) AS statistics_live_rows,
  COALESCE(s.n_dead_tup, 0) AS statistics_dead_rows,
  pg_relation_size(c.oid) AS heap_bytes,
  pg_indexes_size(c.oid) AS index_bytes,
  pg_total_relation_size(c.oid) AS total_bytes
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
LEFT JOIN pg_stat_all_tables AS s ON s.relid = c.oid
WHERE c.relkind IN ('r', 'p', 'm')
  AND n.nspname <> 'information_schema'
  AND n.nspname NOT LIKE 'pg\_%' ESCAPE '\'
ORDER BY n.nspname, c.relname;

\echo '=== exact public table row counts ==='
CREATE TEMP TABLE _crm_exact_public_counts (
  table_name text PRIMARY KEY,
  row_count bigint NOT NULL
);

DO $exact_counts$
DECLARE
  target record;
  exact_count bigint;
BEGIN
  FOR target IN
    SELECT c.relname AS table_name
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relispartition
    ORDER BY c.relname
  LOOP
    EXECUTE format('SELECT count(*)::bigint FROM public.%I', target.table_name)
      INTO exact_count;
    INSERT INTO _crm_exact_public_counts VALUES (target.table_name, exact_count);
  END LOOP;
END
$exact_counts$;

SELECT * FROM _crm_exact_public_counts ORDER BY table_name;
DROP TABLE _crm_exact_public_counts;

\echo '=== row level security ==='
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  count(p.oid)::integer AS policy_count
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
LEFT JOIN pg_policy AS p ON p.polrelid = c.oid
WHERE c.relkind IN ('r', 'p')
  AND n.nspname <> 'information_schema'
  AND n.nspname NOT LIKE 'pg\_%' ESCAPE '\'
GROUP BY n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
ORDER BY n.nspname, c.relname;

\echo '=== publications ==='
SELECT
  pubname AS publication_name,
  puballtables AS publishes_all_tables,
  pubinsert AS publishes_inserts,
  pubupdate AS publishes_updates,
  pubdelete AS publishes_deletes,
  pubtruncate AS publishes_truncates
FROM pg_publication
ORDER BY pubname;

\echo '=== publication tables ==='
SELECT
  pubname AS publication_name,
  schemaname AS schema_name,
  tablename AS table_name
FROM pg_publication_tables
ORDER BY pubname, schemaname, tablename;

\echo '=== storage buckets (aggregate only; object names are intentionally omitted) ==='
CREATE TEMP TABLE _crm_storage_inventory (
  bucket_id text,
  bucket_name text,
  is_public boolean,
  object_count bigint,
  object_bytes numeric
);

DO $inventory$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL
     AND to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO _crm_storage_inventory
        (bucket_id, bucket_name, is_public, object_count, object_bytes)
      SELECT
        b.id::text,
        b.name::text,
        b.public,
        count(o.id)::bigint,
        COALESCE(
          sum(
            CASE
              WHEN COALESCE(o.metadata ->> 'size', '') ~ '^[0-9]+$'
                THEN (o.metadata ->> 'size')::numeric
              ELSE 0
            END
          ),
          0
        ) AS object_bytes
      FROM storage.buckets AS b
      LEFT JOIN storage.objects AS o ON o.bucket_id = b.id
      GROUP BY b.id, b.name, b.public
    $sql$;
  END IF;
END
$inventory$;

SELECT *
FROM _crm_storage_inventory
ORDER BY bucket_id;

DROP TABLE _crm_storage_inventory;

\echo '=== auth aggregates (no identities or user attributes) ==='
CREATE TEMP TABLE _crm_auth_inventory (
  relation_name text PRIMARY KEY,
  row_count bigint
);

DO $inventory$
DECLARE
  relation_name text;
  relation_oid regclass;
  relation_count bigint;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'users',
    'identities',
    'sessions',
    'refresh_tokens',
    'mfa_factors'
  ]
  LOOP
    relation_oid := to_regclass(format('auth.%I', relation_name));

    IF relation_oid IS NOT NULL THEN
      EXECUTE format('SELECT count(*)::bigint FROM %s', relation_oid)
        INTO relation_count;

      INSERT INTO _crm_auth_inventory VALUES (relation_name, relation_count);
    END IF;
  END LOOP;
END
$inventory$;

SELECT *
FROM _crm_auth_inventory
ORDER BY relation_name;

DROP TABLE _crm_auth_inventory;

\echo '=== cron metadata (commands are intentionally omitted) ==='
SELECT (to_regclass('cron.job') IS NOT NULL) AS cron_catalog_available
\gset

\if :cron_catalog_available
SELECT
  jobid,
  jobname,
  schedule,
  active
FROM cron.job
ORDER BY jobname, jobid;
\else
SELECT
  NULL::bigint AS jobid,
  NULL::text AS jobname,
  NULL::text AS schedule,
  NULL::boolean AS active
WHERE false;
\endif

\echo '=== sequences ==='
SELECT
  schemaname AS schema_name,
  sequencename AS sequence_name,
  data_type,
  start_value,
  min_value,
  max_value,
  increment_by,
  cycle,
  cache_size,
  last_value
FROM pg_sequences
WHERE schemaname <> 'information_schema'
  AND schemaname NOT LIKE 'pg\_%' ESCAPE '\'
ORDER BY schemaname, sequencename;

\echo '=== transactions older than five minutes (query text intentionally omitted) ==='
SELECT
  pid,
  backend_type,
  state,
  wait_event_type,
  wait_event,
  xact_start,
  clock_timestamp() - xact_start AS transaction_age
FROM pg_stat_activity
WHERE datname = current_database()
  AND xact_start IS NOT NULL
  AND clock_timestamp() - xact_start >= interval '5 minutes'
ORDER BY xact_start;

\echo '=== inventory complete ==='
