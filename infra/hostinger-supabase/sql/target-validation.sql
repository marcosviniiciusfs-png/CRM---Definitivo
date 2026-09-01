-- Validacao do destino apos restore e post-restore.
--
-- O manifesto inicial e exatamente o mesmo da origem, facilitando diff entre
-- arquivos. As secoes adicionais retornam apenas metadados e contagens; nunca
-- retornam linhas de negocio, nomes de objetos, comandos cron ou segredos.
--
-- Por padrao, FKs sao verificadas profundamente. Para uma verificacao rapida:
--   psql ... --set=deep_fk_check=false --file=target-validation.sql
-- O origin antigo e obrigatorio para que o gate detecte referencias residuais:
--   --set=old_public_url="$OLD_PUBLIC_URL"
-- A contagem exata de auth.users precisa vir do inventario capturado depois
-- do freeze final. Isso evita aceitar uma baseline antiga ou bloquear um
-- crescimento legitimo ocorrido entre o ensaio e o corte.
-- Fechado, o default exige cron global off e zero jobs ativos. Durante a
-- liberacao gradual, informe expected_cron_launch=on e
-- expected_active_cron_jobs=1 ou 2; apos o corte completo, use 3.

\set ON_ERROR_STOP on
\pset pager off
\pset null '<null>'
\timing on

\if :{?deep_fk_check}
\else
  \set deep_fk_check true
\endif

\if :{?old_public_url}
\else
  \echo 'ERROR: old_public_url is required for target validation.'
  \quit 3
\endif

\if :{?expected_cron_launch}
\else
  \set expected_cron_launch off
\endif

\if :{?expected_active_cron_jobs}
\else
  \set expected_active_cron_jobs 0
\endif

\if :{?expected_auth_users}
\else
  \echo 'ERROR: expected_auth_users is required from the final frozen source inventory.'
  \quit 3
\endif

SELECT
  (regexp_replace(:'old_public_url', '/+$', '') ~ '^https://[^/?#]+$')
    AS old_public_url_is_valid,
  (:'expected_cron_launch' IN ('on', 'off'))
    AS expected_cron_launch_is_valid,
  (:'expected_active_cron_jobs' ~ '^[0-3]$')
    AS expected_active_cron_jobs_is_valid,
  (:'expected_auth_users' ~ '^[0-9]+$')
    AS expected_auth_users_is_valid
\gset

\if :old_public_url_is_valid
\else
  \echo 'ERROR: old_public_url must be an HTTPS origin without path, query or fragment.'
  \quit 3
\endif

\if :expected_cron_launch_is_valid
\else
  \echo 'ERROR: expected_cron_launch must be on or off.'
  \quit 3
\endif

\if :expected_active_cron_jobs_is_valid
\else
  \echo 'ERROR: expected_active_cron_jobs must be 0, 1, 2 or 3.'
  \quit 3
\endif

\if :expected_auth_users_is_valid
\else
  \echo 'ERROR: expected_auth_users must be a non-negative integer.'
  \quit 3
\endif

CREATE TEMP TABLE _crm_validation_options AS
SELECT
  :'deep_fk_check'::boolean AS deep_fk_check,
  regexp_replace(:'old_public_url', '/+$', '')::text AS old_origin,
  :'expected_cron_launch'::text AS expected_cron_launch,
  :'expected_active_cron_jobs'::integer AS expected_active_cron_jobs,
  :'expected_auth_users'::bigint AS expected_auth_users;

\echo '=== comparable target manifest ==='

\echo '=== database ==='
SELECT
  current_database() AS database_name,
  current_setting('server_version') AS server_version,
  pg_database_size(current_database()) AS database_bytes,
  pg_size_pretty(pg_database_size(current_database())) AS database_size;

\echo '=== collation and index integrity ==='
CREATE TEMP TABLE _crm_collation_index_health AS
SELECT
  database.datcollversion AS database_collation_version,
  pg_database_collation_actual_version(database.oid)
    AS actual_database_collation_version,
  database.datcollversion IS NOT DISTINCT FROM
    pg_database_collation_actual_version(database.oid)
    AS database_collation_version_matches,
  (
    SELECT count(*)::bigint
    FROM pg_collation AS collation_entry
    WHERE collation_entry.collversion IS NOT NULL
      AND collation_entry.collversion IS DISTINCT FROM
        pg_collation_actual_version(collation_entry.oid)
  ) AS divergent_collations,
  (
    SELECT count(*)::bigint
    FROM pg_index AS index_state
    WHERE NOT index_state.indisvalid OR NOT index_state.indisready
  ) AS invalid_or_unready_indexes
FROM pg_database AS database
WHERE database.datname = current_database();

SELECT * FROM _crm_collation_index_health;

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
  file_size_limit bigint,
  object_count bigint,
  object_bytes numeric,
  objects_without_numeric_size bigint
);

DO $inventory$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL
     AND to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO _crm_storage_inventory
        (bucket_id, bucket_name, is_public, file_size_limit, object_count,
         object_bytes, objects_without_numeric_size)
      SELECT
        b.id::text,
        b.name::text,
        b.public,
        b.file_size_limit,
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
        ) AS object_bytes,
        count(o.id) FILTER (
          WHERE o.metadata ->> 'size' IS NULL
             OR o.metadata ->> 'size' !~ '^[0-9]+$'
        )::bigint AS objects_without_numeric_size
      FROM storage.buckets AS b
      LEFT JOIN storage.objects AS o ON o.bucket_id = b.id
      GROUP BY b.id, b.name, b.public, b.file_size_limit
    $sql$;
  END IF;
END
$inventory$;

SELECT *
FROM _crm_storage_inventory
ORDER BY bucket_id;

CREATE TEMP TABLE _crm_expected_storage_inventory (
  bucket_id text PRIMARY KEY,
  expected_public boolean NOT NULL,
  expected_file_size_limit bigint,
  validate_file_size_limit boolean NOT NULL,
  validate_object_inventory boolean NOT NULL,
  expected_object_count bigint,
  expected_object_bytes numeric
);

INSERT INTO _crm_expected_storage_inventory VALUES
  ('activity-attachments', false, NULL, false, false, NULL, NULL),
  ('avatars', true, 5242880, true, false, NULL, NULL),
  ('chat-media', true, NULL, false, true, 0, 0),
  ('team-avatars', true, NULL, false, false, NULL, NULL);

CREATE TEMP TABLE _crm_storage_cutover_health AS
SELECT
  expected.bucket_id,
  expected.expected_public,
  actual.is_public AS actual_public,
  expected.expected_file_size_limit,
  actual.file_size_limit AS actual_file_size_limit,
  expected.validate_file_size_limit,
  expected.validate_object_inventory,
  expected.expected_object_count,
  COALESCE(actual.object_count, -1) AS actual_object_count,
  expected.expected_object_bytes,
  COALESCE(actual.object_bytes, -1) AS actual_object_bytes,
  COALESCE(actual.objects_without_numeric_size, -1)
    AS objects_without_numeric_size
FROM _crm_expected_storage_inventory AS expected
LEFT JOIN _crm_storage_inventory AS actual USING (bucket_id);

SELECT *
FROM _crm_storage_cutover_health
ORDER BY bucket_id;

\echo '=== Storage schema migration 64 health ==='
CREATE TEMP TABLE _crm_storage_schema_health AS
WITH expected_migrations(id, name, hash) AS (
  VALUES
    (61, 'mark-filename-immutable'::text, 'fe0096517ae9d60aaec1d110172ba9036dc66bb7'::text),
    (62, 'object-versioning-core'::text, '0b855f00ff3be0bfca91efee02a9858912491a9a'::text),
    (63, 'fix-search-name-relative-to-prefix'::text, 'c7485e417624f795ce8bb2da21927f48e088904d'::text),
    (64, 'fix-search-by-timestamp-sqli'::text, '0af424ecd388a39bb1645184b222185a12149675'::text)
),
migration_history AS (
  SELECT
    count(actual.id) = 4
      AND bool_and(
        (actual.id, actual.name, actual.hash::text)
          = (expected.id, expected.name, expected.hash)
      ) AS exact_rows
  FROM expected_migrations AS expected
  LEFT JOIN storage.migrations AS actual ON actual.id = expected.id
),
timestamp_function AS (
  SELECT pg_get_functiondef(procedure.oid) AS definition
  FROM pg_proc AS procedure
  WHERE procedure.oid = to_regprocedure(
    'storage.search_by_timestamp(text,text,integer,integer,text,text,text,text)'
  )
)
SELECT
  COALESCE((SELECT exact_rows FROM migration_history), false)
    AS exact_migration_rows,
  COALESCE((SELECT max(id) = 64 FROM storage.migrations), false)
    AS migration_ceiling_is_64,
  COALESCE((
    SELECT provolatile = 'i' AND NOT prosecdef
    FROM pg_proc
    WHERE oid = to_regprocedure('storage.filename(text)')
  ), false) AS filename_is_immutable,
  COALESCE((
    SELECT provolatile = 's' AND NOT prosecdef
    FROM pg_proc
    WHERE oid = to_regprocedure(
      'storage.search(text,text,integer,integer,integer,text,text,text)'
    )
  ), false) AS search_is_stable_invoker,
  COALESCE((
    SELECT provolatile = 's' AND NOT prosecdef
    FROM pg_proc
    WHERE oid = to_regprocedure(
      'storage.search_by_timestamp(text,text,integer,integer,text,text,text,text)'
    )
  ), false) AS timestamp_search_is_stable_invoker,
  COALESCE((
    SELECT
      position('v_sort_order NOT IN (''asc'', ''desc'')' IN definition) > 0
      AND position(
        'v_sort_column NOT IN (''updated_at'', ''created_at'')' IN definition
      ) > 0
    FROM timestamp_function
  ), false) AS timestamp_search_has_strict_allowlists;

SELECT * FROM _crm_storage_schema_health;

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

\echo '=== comparable target manifest complete ==='

\echo '=== unvalidated constraints ==='
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  con.conname AS constraint_name,
  CASE con.contype
    WHEN 'c' THEN 'check'
    WHEN 'f' THEN 'foreign_key'
    WHEN 'p' THEN 'primary_key'
    WHEN 'u' THEN 'unique'
    WHEN 'x' THEN 'exclusion'
    ELSE con.contype::text
  END AS constraint_type
FROM pg_constraint AS con
JOIN pg_class AS c ON c.oid = con.conrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE NOT con.convalidated
  AND n.nspname <> 'information_schema'
  AND n.nspname NOT LIKE 'pg\_%' ESCAPE '\'
ORDER BY n.nspname, c.relname, con.conname;

\echo '=== generic foreign-key orphan check ==='
CREATE TEMP TABLE _crm_fk_health (
  child_relation text,
  constraint_name text,
  parent_relation text,
  constraint_validated boolean,
  orphan_rows bigint
);

\if :deep_fk_check
DO $fk_check$
DECLARE
  fk record;
  orphan_count bigint;
  violation_predicate text;
BEGIN
  FOR fk IN
    SELECT
      con.conname AS constraint_name,
      con.convalidated AS constraint_validated,
      con.confmatchtype,
      child_ns.nspname AS child_schema,
      child.relname AS child_table,
      parent_ns.nspname AS parent_schema,
      parent.relname AS parent_table,
      string_agg(
        format('p.%I = c.%I', parent_col.attname, child_col.attname),
        ' AND ' ORDER BY keys.ordinality
      ) AS equality_predicate,
      string_agg(
        format('c.%I IS NOT NULL', child_col.attname),
        ' AND ' ORDER BY keys.ordinality
      ) AS all_not_null_predicate,
      string_agg(
        format('c.%I IS NULL', child_col.attname),
        ' AND ' ORDER BY keys.ordinality
      ) AS all_null_predicate
    FROM pg_constraint AS con
    JOIN pg_class AS child ON child.oid = con.conrelid
    JOIN pg_namespace AS child_ns ON child_ns.oid = child.relnamespace
    JOIN pg_class AS parent ON parent.oid = con.confrelid
    JOIN pg_namespace AS parent_ns ON parent_ns.oid = parent.relnamespace
    CROSS JOIN LATERAL unnest(con.conkey, con.confkey)
      WITH ORDINALITY AS keys(child_attnum, parent_attnum, ordinality)
    JOIN pg_attribute AS child_col
      ON child_col.attrelid = child.oid
     AND child_col.attnum = keys.child_attnum
    JOIN pg_attribute AS parent_col
      ON parent_col.attrelid = parent.oid
     AND parent_col.attnum = keys.parent_attnum
    WHERE con.contype = 'f'
      AND con.conparentid = 0
      AND child_ns.nspname <> 'information_schema'
      AND child_ns.nspname NOT LIKE 'pg\_%' ESCAPE '\'
    GROUP BY
      con.oid,
      con.conname,
      con.convalidated,
      con.confmatchtype,
      child_ns.nspname,
      child.relname,
      parent_ns.nspname,
      parent.relname
    ORDER BY child_ns.nspname, child.relname, con.conname
  LOOP
    IF fk.confmatchtype = 'f' THEN
      -- MATCH FULL: tudo NULL e permitido; NULL parcial e violacao.
      violation_predicate := format(
        'NOT (%s) AND (NOT (%s) OR NOT EXISTS '
        || '(SELECT 1 FROM %I.%I AS p WHERE %s))',
        fk.all_null_predicate,
        fk.all_not_null_predicate,
        fk.parent_schema,
        fk.parent_table,
        fk.equality_predicate
      );
    ELSE
      -- MATCH SIMPLE (padrao): qualquer NULL dispensa a verificacao.
      violation_predicate := format(
        '(%s) AND NOT EXISTS '
        || '(SELECT 1 FROM %I.%I AS p WHERE %s)',
        fk.all_not_null_predicate,
        fk.parent_schema,
        fk.parent_table,
        fk.equality_predicate
      );
    END IF;

    EXECUTE format(
      'SELECT count(*)::bigint FROM %I.%I AS c WHERE %s',
      fk.child_schema,
      fk.child_table,
      violation_predicate
    ) INTO orphan_count;

    INSERT INTO _crm_fk_health VALUES (
      format('%I.%I', fk.child_schema, fk.child_table),
      fk.constraint_name,
      format('%I.%I', fk.parent_schema, fk.parent_table),
      fk.constraint_validated,
      orphan_count
    );
  END LOOP;
END
$fk_check$;
\else
\echo 'Deep FK check skipped by deep_fk_check=false.'
\endif

SELECT *
FROM _crm_fk_health
ORDER BY child_relation, constraint_name;

SELECT count(*) AS foreign_keys_with_orphans
FROM _crm_fk_health
WHERE orphan_rows > 0;

\echo '=== owned-sequence health ==='
CREATE TEMP TABLE _crm_sequence_health (
  sequence_relation text,
  owning_column text,
  increment_by bigint,
  cycle boolean,
  last_value numeric,
  table_extreme numeric,
  status text
);

DO $sequence_check$
DECLARE
  item record;
  current_sequence_value numeric;
  table_extreme numeric;
  sequence_status text;
BEGIN
  FOR item IN
    SELECT
      sequence_ns.nspname AS sequence_schema,
      sequence_rel.relname AS sequence_name,
      table_ns.nspname AS table_schema,
      table_rel.relname AS table_name,
      table_col.attname AS column_name,
      sequence_parameters.seqincrement AS increment_by,
      sequence_parameters.seqcycle AS cycle
    FROM pg_class AS sequence_rel
    JOIN pg_namespace AS sequence_ns
      ON sequence_ns.oid = sequence_rel.relnamespace
    JOIN pg_sequence AS sequence_parameters
      ON sequence_parameters.seqrelid = sequence_rel.oid
    JOIN pg_depend AS dependency
      ON dependency.classid = 'pg_class'::regclass
     AND dependency.objid = sequence_rel.oid
     AND dependency.refclassid = 'pg_class'::regclass
     AND dependency.deptype IN ('a', 'i')
    JOIN pg_class AS table_rel ON table_rel.oid = dependency.refobjid
    JOIN pg_namespace AS table_ns ON table_ns.oid = table_rel.relnamespace
    JOIN pg_attribute AS table_col
      ON table_col.attrelid = table_rel.oid
     AND table_col.attnum = dependency.refobjsubid
    WHERE sequence_rel.relkind = 'S'
      AND sequence_ns.nspname <> 'information_schema'
      AND sequence_ns.nspname NOT LIKE 'pg\_%' ESCAPE '\'
    ORDER BY sequence_ns.nspname, sequence_rel.relname
  LOOP
    EXECUTE format(
      'SELECT last_value::numeric FROM %I.%I',
      item.sequence_schema,
      item.sequence_name
    ) INTO current_sequence_value;

    IF item.increment_by > 0 THEN
      EXECUTE format(
        'SELECT max(%I)::numeric FROM %I.%I',
        item.column_name,
        item.table_schema,
        item.table_name
      ) INTO table_extreme;
    ELSE
      EXECUTE format(
        'SELECT min(%I)::numeric FROM %I.%I',
        item.column_name,
        item.table_schema,
        item.table_name
      ) INTO table_extreme;
    END IF;

    sequence_status := CASE
      WHEN table_extreme IS NULL THEN 'OK_EMPTY_TABLE'
      WHEN item.cycle THEN 'REVIEW_CYCLING_SEQUENCE'
      WHEN item.increment_by > 0 AND current_sequence_value < table_extreme
        THEN 'LAGGING'
      WHEN item.increment_by < 0 AND current_sequence_value > table_extreme
        THEN 'LAGGING'
      ELSE 'OK'
    END;

    INSERT INTO _crm_sequence_health VALUES (
      format('%I.%I', item.sequence_schema, item.sequence_name),
      format('%I.%I.%I', item.table_schema, item.table_name, item.column_name),
      item.increment_by,
      item.cycle,
      current_sequence_value,
      table_extreme,
      sequence_status
    );
  END LOOP;
END
$sequence_check$;

SELECT *
FROM _crm_sequence_health
ORDER BY sequence_relation;

SELECT count(*) AS lagging_owned_sequences
FROM _crm_sequence_health
WHERE status = 'LAGGING';

\echo '=== expected CRM cron jobs (command text is never returned) ==='
CREATE TEMP TABLE _crm_cron_health (
  jobname text PRIMARY KEY,
  configured_count integer NOT NULL,
  all_active boolean NOT NULL,
  schedule_is_expected boolean NOT NULL,
  uses_internal_api_gateway boolean NOT NULL,
  uses_cron_secret_header boolean NOT NULL,
  has_no_embedded_jwt boolean NOT NULL
);

SELECT (to_regclass('cron.job') IS NOT NULL) AS cron_catalog_available
\gset

\if :cron_catalog_available
INSERT INTO _crm_cron_health
WITH expected(jobname, expected_schedule, expected_path) AS (
  VALUES
    (
      'send-scheduled-reminders'::text,
      '* * * * *'::text,
      '/functions/v1/send-scheduled-reminders'::text
    ),
    (
      'auto-redistribute-leads'::text,
      '*/5 * * * *'::text,
      '/functions/v1/auto-redistribute-leads'::text
    ),
    (
      'sync-google-sheets'::text,
      '*/2 * * * *'::text,
      '/functions/v1/sync-google-sheets'::text
    )
),
actual AS (
  SELECT
    expected.jobname,
    count(job.jobid)::integer AS configured_count,
    COALESCE(bool_and(job.active), false) AS all_active,
    COALESCE(bool_and(job.schedule = expected.expected_schedule), false)
      AS schedule_is_expected,
    COALESCE(bool_and(
      position('http://api-gw:8000/functions/v1/' IN job.command) > 0
      AND position(expected.expected_path IN job.command) > 0
    ), false)
      AS uses_internal_api_gateway,
    COALESCE(bool_and(position('x-cron-secret' IN job.command) > 0), false)
      AS uses_cron_secret_header,
    COALESCE(bool_and(position('Bearer eyJ' IN job.command) = 0), false)
      AS has_no_embedded_jwt
  FROM expected
  LEFT JOIN cron.job AS job USING (jobname)
  GROUP BY expected.jobname, expected.expected_schedule, expected.expected_path
)
SELECT
  jobname,
  configured_count,
  all_active,
  schedule_is_expected,
  uses_internal_api_gateway,
  uses_cron_secret_header,
  has_no_embedded_jwt
FROM actual
ORDER BY jobname;
\else
SELECT 'cron.job catalog is unavailable' AS cron_validation_error;
\endif

SELECT *
FROM _crm_cron_health
ORDER BY jobname;

\echo '=== cron Vault secret metadata (decrypted value is never selected) ==='
CREATE TEMP TABLE _crm_vault_health (
  crm_cron_secret_records bigint NOT NULL
);

SELECT (to_regclass('vault.secrets') IS NOT NULL) AS vault_catalog_available
\gset

\if :vault_catalog_available
INSERT INTO _crm_vault_health
SELECT count(*)
FROM vault.secrets
WHERE name = 'crm_cron_secret';
\else
INSERT INTO _crm_vault_health VALUES (-1);
\endif

SELECT
  crm_cron_secret_records,
  (crm_cron_secret_records = 1) AS exactly_one_crm_cron_secret
FROM _crm_vault_health;

\echo '=== storage ownership summary ==='
-- Copia S3 transfere os bytes e metadados de objeto suportados pelo protocolo,
-- mas nao preserva de forma confiavel storage.objects.owner_id. A aplicacao
-- deve ser testada com RLS; objetos sem owner podem exigir backfill separado,
-- fundamentado em dados da aplicacao (nunca inferido apenas pelo nome do path).
SELECT (to_regclass('storage.objects') IS NOT NULL) AS storage_objects_available
\gset

\if :storage_objects_available
SELECT
  bucket_id,
  count(*)::bigint AS object_count,
  count(*) FILTER (WHERE owner_id IS NULL)::bigint AS objects_without_owner_id,
  COALESCE(
    sum(
      CASE
        WHEN COALESCE(metadata ->> 'size', '') ~ '^[0-9]+$'
          THEN (metadata ->> 'size')::numeric
        ELSE 0
      END
    ),
    0
  ) AS object_bytes
FROM storage.objects
GROUP BY bucket_id
ORDER BY bucket_id;
\else
SELECT 'storage.objects is unavailable' AS storage_validation_error;
\endif

\echo '=== public tables needing RLS review ==='
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  count(p.oid)::integer AS policy_count,
  CASE
    WHEN NOT c.relrowsecurity THEN 'REVIEW_RLS_DISABLED'
    WHEN count(p.oid) = 0 THEN 'REVIEW_NO_POLICIES'
    ELSE 'OK'
  END AS status
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
LEFT JOIN pg_policy AS p ON p.polrelid = c.oid
WHERE c.relkind IN ('r', 'p')
  AND n.nspname = 'public'
GROUP BY n.nspname, c.relname, c.relrowsecurity
ORDER BY status DESC, c.relname;

\echo '=== supabase_realtime membership ==='
SELECT
  c.oid::regclass::text AS relation_name,
  EXISTS (
    SELECT 1
    FROM pg_publication_tables AS publication_table
    WHERE publication_table.pubname = 'supabase_realtime'
      AND publication_table.schemaname = n.nspname
      AND publication_table.tablename = c.relname
  ) AS in_supabase_realtime
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'p')
  AND n.nspname = 'public'
ORDER BY c.relname;

\echo '=== remaining references to old public origin (counts only) ==='
CREATE TEMP TABLE _crm_old_origin_references (
  relation_column text,
  matching_rows bigint
);

CREATE TEMP TABLE _crm_old_origin_input AS
SELECT regexp_replace(:'old_public_url', '/+$', '')::text AS old_origin;

DO $origin_check$
DECLARE
  old_origin text;
  target record;
  match_count bigint;
BEGIN
  SELECT input.old_origin
  INTO STRICT old_origin
  FROM _crm_old_origin_input AS input;

  IF old_origin <> '' THEN
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
          'SELECT count(*)::bigint
           FROM %I.%I
           WHERE %I::text = $1
              OR left(%I::text, char_length($1) + 1) = $1 || ''/''',
          target.schema_name,
          target.table_name,
          target.column_name,
          target.column_name
        ) USING old_origin INTO match_count;

        INSERT INTO _crm_old_origin_references VALUES (
          format('%I.%I.%I', target.schema_name, target.table_name, target.column_name),
          match_count
        );
      END IF;
    END LOOP;
  END IF;
END
$origin_check$;

SELECT *
FROM _crm_old_origin_references
ORDER BY relation_column;

SELECT COALESCE(sum(matching_rows), 0) AS total_old_origin_references
FROM _crm_old_origin_references;

\echo '=== runtime safety and final validation gate ==='
CREATE TEMP TABLE _crm_runtime_health (
  cron_launch_setting text,
  expected_cron_launch text NOT NULL,
  cron_job_count bigint NOT NULL,
  running_cron_jobs bigint NOT NULL,
  pending_http_requests bigint NOT NULL
);

DO $runtime_health$
DECLARE
  cron_launch_setting text;
  expected_cron_launch text;
  cron_job_count bigint := -1;
  running_cron_jobs bigint := -1;
  pending_http_requests bigint := -1;
BEGIN
  cron_launch_setting := current_setting('cron.launch_active_jobs', true);

  SELECT options.expected_cron_launch
  INTO STRICT expected_cron_launch
  FROM _crm_validation_options AS options;

  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::bigint FROM cron.job'
      INTO cron_job_count;
  END IF;

  IF to_regclass('cron.job_run_details') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT count(*)::bigint
      FROM cron.job_run_details
      WHERE status = 'running'
    $sql$ INTO running_cron_jobs;
  END IF;

  IF to_regclass('net.http_request_queue') IS NOT NULL THEN
    EXECUTE 'SELECT count(*)::bigint FROM net.http_request_queue'
      INTO pending_http_requests;
  END IF;

  INSERT INTO _crm_runtime_health VALUES (
    cron_launch_setting,
    expected_cron_launch,
    cron_job_count,
    running_cron_jobs,
    pending_http_requests
  );
END
$runtime_health$;

SELECT * FROM _crm_runtime_health;

DO $validation_gate$
DECLARE
  issues text[] := ARRAY[]::text[];
  deep_fk_check boolean;
  unvalidated_constraints bigint;
  orphan_rows bigint;
  lagging_sequences bigint;
  valid_cron_jobs bigint;
  active_cron_jobs bigint;
  expected_active_cron_jobs integer;
  expected_auth_users bigint;
  valid_storage_buckets bigint;
  unexpected_storage_buckets bigint;
  storage_schema record;
  auth_user_count bigint;
  vault_secret_records bigint;
  old_origin_references bigint;
  runtime record;
  collation_index record;
BEGIN
  SELECT
    options.deep_fk_check,
    options.expected_active_cron_jobs,
    options.expected_auth_users
  INTO STRICT deep_fk_check, expected_active_cron_jobs, expected_auth_users
  FROM _crm_validation_options AS options;

  IF current_database() <> 'postgres'
     OR pg_is_in_recovery()
     OR current_setting('transaction_read_only') <> 'off'
     OR to_regnamespace('public') IS NULL
     OR to_regnamespace('auth') IS NULL
     OR to_regnamespace('storage') IS NULL
     OR to_regnamespace('cron') IS NULL
     OR to_regnamespace('net') IS NULL
     OR to_regnamespace('vault') IS NULL
     OR to_regclass('public.profiles') IS NULL
     OR to_regclass('auth.users') IS NULL
     OR to_regclass('storage.buckets') IS NULL
     OR to_regclass('storage.objects') IS NULL THEN
    issues := array_append(issues, 'required_database_or_schema_missing');
  END IF;

  IF NOT deep_fk_check THEN
    issues := array_append(issues, 'deep_fk_check_not_run');
  END IF;

  SELECT *
  INTO STRICT collation_index
  FROM _crm_collation_index_health;
  IF NOT collation_index.database_collation_version_matches THEN
    issues := array_append(issues, 'database_collation_version_mismatch');
  END IF;
  IF collation_index.divergent_collations <> 0 THEN
    issues := array_append(
      issues,
      format('divergent_collations=%s', collation_index.divergent_collations)
    );
  END IF;
  IF collation_index.invalid_or_unready_indexes <> 0 THEN
    issues := array_append(
      issues,
      format(
        'invalid_or_unready_indexes=%s',
        collation_index.invalid_or_unready_indexes
      )
    );
  END IF;

  SELECT count(*)::bigint
  INTO unvalidated_constraints
  FROM pg_constraint AS con
  JOIN pg_class AS relation ON relation.oid = con.conrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE NOT con.convalidated
    AND namespace.nspname <> 'information_schema'
    AND namespace.nspname NOT LIKE 'pg\_%' ESCAPE '\';
  IF unvalidated_constraints > 0 THEN
    issues := array_append(issues, format('unvalidated_constraints=%s', unvalidated_constraints));
  END IF;

  SELECT COALESCE(sum(health.orphan_rows), 0)::bigint
  INTO orphan_rows
  FROM _crm_fk_health AS health;
  IF orphan_rows > 0 THEN
    issues := array_append(issues, format('foreign_key_orphans=%s', orphan_rows));
  END IF;

  SELECT count(*)::bigint
  INTO lagging_sequences
  FROM _crm_sequence_health
  WHERE status = 'LAGGING';
  IF lagging_sequences > 0 THEN
    issues := array_append(issues, format('lagging_sequences=%s', lagging_sequences));
  END IF;

  SELECT count(*)::bigint
  INTO valid_cron_jobs
  FROM _crm_cron_health
  WHERE configured_count = 1
    AND schedule_is_expected
    AND uses_internal_api_gateway
    AND uses_cron_secret_header
    AND has_no_embedded_jwt;
  IF valid_cron_jobs <> 3 THEN
    issues := array_append(issues, format('valid_expected_cron_jobs=%s', valid_cron_jobs));
  END IF;

  SELECT count(*)::bigint
  INTO valid_storage_buckets
  FROM _crm_storage_cutover_health
  WHERE actual_public IS NOT DISTINCT FROM expected_public
    AND (
      NOT validate_file_size_limit
      OR actual_file_size_limit IS NOT DISTINCT FROM expected_file_size_limit
    )
    AND (
      NOT validate_object_inventory
      OR (
        actual_object_count = expected_object_count
        AND actual_object_bytes = expected_object_bytes
      )
    )
    AND objects_without_numeric_size = 0;
  IF valid_storage_buckets <> 4 THEN
    issues := array_append(
      issues,
      format('valid_expected_storage_buckets=%s', valid_storage_buckets)
    );
  END IF;

  SELECT count(*)::bigint
  INTO unexpected_storage_buckets
  FROM _crm_storage_inventory AS actual
  WHERE NOT EXISTS (
    SELECT 1
    FROM _crm_expected_storage_inventory AS expected
    WHERE expected.bucket_id = actual.bucket_id
  );
  IF unexpected_storage_buckets <> 0 THEN
    issues := array_append(
      issues,
      format('unexpected_storage_buckets=%s', unexpected_storage_buckets)
    );
  END IF;

  SELECT *
  INTO STRICT storage_schema
  FROM _crm_storage_schema_health;
  IF NOT storage_schema.exact_migration_rows
     OR NOT storage_schema.migration_ceiling_is_64
     OR NOT storage_schema.filename_is_immutable
     OR NOT storage_schema.search_is_stable_invoker
     OR NOT storage_schema.timestamp_search_is_stable_invoker
     OR NOT storage_schema.timestamp_search_has_strict_allowlists THEN
    issues := array_append(issues, 'storage_schema_migration_64_not_verified');
  END IF;

  SELECT COALESCE(max(row_count) FILTER (WHERE relation_name = 'users'), -1)
  INTO auth_user_count
  FROM _crm_auth_inventory;
  IF auth_user_count <> expected_auth_users THEN
    issues := array_append(
      issues,
      format(
        'auth_users=%s_expected=%s',
        auth_user_count,
        expected_auth_users
      )
    );
  END IF;

  SELECT count(*)::bigint
  INTO active_cron_jobs
  FROM _crm_cron_health
  WHERE all_active;
  IF active_cron_jobs <> expected_active_cron_jobs THEN
    issues := array_append(
      issues,
      format(
        'active_cron_jobs=%s_expected=%s',
        active_cron_jobs,
        expected_active_cron_jobs
      )
    );
  END IF;

  SELECT health.crm_cron_secret_records
  INTO STRICT vault_secret_records
  FROM _crm_vault_health AS health;
  IF vault_secret_records <> 1 THEN
    issues := array_append(issues, format('vault_secret_records=%s', vault_secret_records));
  END IF;

  SELECT COALESCE(sum(origin_refs.matching_rows), 0)::bigint
  INTO old_origin_references
  FROM _crm_old_origin_references AS origin_refs;
  IF old_origin_references > 0 THEN
    issues := array_append(issues, format('old_origin_references=%s', old_origin_references));
  END IF;

  SELECT *
  INTO STRICT runtime
  FROM _crm_runtime_health;
  IF runtime.cron_launch_setting IS DISTINCT FROM runtime.expected_cron_launch THEN
    issues := array_append(issues, 'unexpected_global_cron_state');
  END IF;
  IF runtime.cron_job_count <> 3 THEN
    issues := array_append(issues, format('total_cron_jobs=%s', runtime.cron_job_count));
  END IF;
  IF runtime.running_cron_jobs <> 0 THEN
    issues := array_append(issues, format('running_cron_jobs=%s', runtime.running_cron_jobs));
  END IF;
  IF runtime.pending_http_requests <> 0 THEN
    issues := array_append(issues, format('pending_http_requests=%s', runtime.pending_http_requests));
  END IF;

  IF cardinality(issues) > 0 THEN
    RAISE EXCEPTION 'target validation gate failed: %', array_to_string(issues, ', ');
  END IF;
END
$validation_gate$;

SELECT 'PASS' AS target_validation_gate;

DROP TABLE _crm_runtime_health;
DROP TABLE _crm_collation_index_health;
DROP TABLE _crm_old_origin_references;
DROP TABLE _crm_old_origin_input;
DROP TABLE _crm_vault_health;
DROP TABLE _crm_cron_health;
DROP TABLE _crm_auth_inventory;
DROP TABLE _crm_storage_schema_health;
DROP TABLE _crm_storage_cutover_health;
DROP TABLE _crm_expected_storage_inventory;
DROP TABLE _crm_storage_inventory;
DROP TABLE _crm_sequence_health;
DROP TABLE _crm_fk_health;
DROP TABLE _crm_validation_options;

\echo '=== target validation complete ==='
