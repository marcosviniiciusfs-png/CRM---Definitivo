\set ON_ERROR_STOP on

-- Runs after the byte-exact official Storage migrations 61-64, in the same
-- transaction. The hashes below use postgres-migrations v5.3.0 semantics:
-- SHA-1(UTF-8 filename || UTF-8 file contents).
CREATE TEMP TABLE _crm_expected_storage_migrations (
  id integer PRIMARY KEY,
  name text UNIQUE NOT NULL,
  hash text NOT NULL
) ON COMMIT DROP;

INSERT INTO _crm_expected_storage_migrations (id, name, hash) VALUES
  (61, 'mark-filename-immutable', 'fe0096517ae9d60aaec1d110172ba9036dc66bb7'),
  (62, 'object-versioning-core', '0b855f00ff3be0bfca91efee02a9858912491a9a'),
  (63, 'fix-search-name-relative-to-prefix', 'c7485e417624f795ce8bb2da21927f48e088904d'),
  (64, 'fix-search-by-timestamp-sqli', '0af424ecd388a39bb1645184b222185a12149675');

DO $migration_tracking$
DECLARE
  conflicting_rows text;
  exact_rows integer;
BEGIN
  IF to_regclass('storage.migrations') IS NULL THEN
    RAISE EXCEPTION 'storage.migrations is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.migrations
    WHERE id = 60
      AND name = 'optimize-existing-functions-again'
  ) THEN
    RAISE EXCEPTION 'Storage migration 60 baseline is missing or unexpected';
  END IF;

  IF EXISTS (SELECT 1 FROM storage.migrations WHERE id > 64) THEN
    RAISE EXCEPTION 'Storage schema is newer than the approved migration 64 ceiling';
  END IF;

  SELECT string_agg(
    format('actual=(%s,%s,%s), expected=(%s,%s,%s)',
      actual.id, actual.name, actual.hash,
      expected.id, expected.name, expected.hash),
    '; ' ORDER BY actual.id, actual.name
  )
  INTO conflicting_rows
  FROM storage.migrations AS actual
  JOIN _crm_expected_storage_migrations AS expected
    ON actual.id = expected.id OR actual.name = expected.name
  WHERE (actual.id, actual.name, actual.hash)
    IS DISTINCT FROM (expected.id, expected.name, expected.hash);

  IF conflicting_rows IS NOT NULL THEN
    RAISE EXCEPTION 'Conflicting Storage migration history: %', conflicting_rows;
  END IF;

  INSERT INTO storage.migrations (id, name, hash)
  SELECT expected.id, expected.name, expected.hash
  FROM _crm_expected_storage_migrations AS expected
  WHERE NOT EXISTS (
    SELECT 1
    FROM storage.migrations AS actual
    WHERE actual.id = expected.id
      AND actual.name = expected.name
      AND actual.hash = expected.hash
  )
  ORDER BY expected.id;

  SELECT count(*)
  INTO exact_rows
  FROM storage.migrations AS actual
  JOIN _crm_expected_storage_migrations AS expected
    ON (actual.id, actual.name, actual.hash)
     = (expected.id, expected.name, expected.hash);

  IF exact_rows <> 4 THEN
    RAISE EXCEPTION 'Storage migration tracking verification failed: %/4', exact_rows;
  END IF;
END
$migration_tracking$;

DO $catalog_validation$
DECLARE
  compatible_columns integer;
  compatible_constraints integer;
  function_definition text;
BEGIN
  SELECT count(*) INTO compatible_columns
  FROM pg_attribute AS attribute
  JOIN pg_class AS relation ON relation.oid = attribute.attrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  LEFT JOIN pg_attrdef AS default_value
    ON default_value.adrelid = attribute.attrelid
   AND default_value.adnum = attribute.attnum
  WHERE NOT attribute.attisdropped AND (
    (namespace.nspname = 'storage'
      AND relation.relname = 'buckets'
      AND attribute.attname = 'versioning_status'
      AND attribute.atttypid = 'text'::regtype
      AND attribute.attnotnull
      AND pg_get_expr(default_value.adbin, default_value.adrelid) = '''DISABLED''::text')
    OR (namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND attribute.attname = 'archived_at'
      AND attribute.atttypid = 'timestamp with time zone'::regtype
      AND NOT attribute.attnotnull
      AND default_value.oid IS NULL)
    OR (namespace.nspname = 'storage'
      AND relation.relname = 'objects'
      AND attribute.attname IN ('is_delete_marker', 'is_versioned')
      AND attribute.atttypid = 'boolean'::regtype
      AND attribute.attnotnull
      AND pg_get_expr(default_value.adbin, default_value.adrelid) = 'false')
  );

  IF compatible_columns <> 4 THEN
    RAISE EXCEPTION 'Storage migration 62 columns failed verification: %/4', compatible_columns;
  END IF;

  SELECT count(*) INTO compatible_constraints
  FROM pg_constraint
  WHERE conrelid = 'storage.buckets'::regclass
    AND conname IN (
      'buckets_versioning_dark_check',
      'buckets_versioning_standard_only_check',
      'buckets_versioning_status_check'
    )
    AND contype = 'c'
    AND convalidated;

  IF compatible_constraints <> 3 THEN
    RAISE EXCEPTION 'Storage migration 62 constraints failed verification: %/3', compatible_constraints;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE oid = 'storage.filename(text)'::regprocedure
      AND provolatile = 'i'
      AND NOT prosecdef
  ) THEN
    RAISE EXCEPTION 'Storage migration 61 function verification failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE oid = 'storage.search(text,text,integer,integer,integer,text,text,text)'::regprocedure
      AND provolatile = 's'
      AND NOT prosecdef
  ) THEN
    RAISE EXCEPTION 'Storage migration 63 function verification failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE oid = 'storage.search_by_timestamp(text,text,integer,integer,text,text,text,text)'::regprocedure
      AND provolatile = 's'
      AND NOT prosecdef
  ) THEN
    RAISE EXCEPTION 'Storage migration 64 function verification failed';
  END IF;

  SELECT pg_get_functiondef(
    'storage.search_by_timestamp(text,text,integer,integer,text,text,text,text)'::regprocedure
  ) INTO function_definition;

  IF position('v_sort_order NOT IN (''asc'', ''desc'')' IN function_definition) = 0
     OR position('v_sort_column NOT IN (''updated_at'', ''created_at'')' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Storage migration 64 allow-list verification failed';
  END IF;
END
$catalog_validation$;

-- Behavioral checks use a fixed collision-resistant bucket inside a savepoint.
-- ROLLBACK TO removes every synthetic row without invoking the protected delete
-- path and leaves only the schema/function changes in the outer transaction.
SET LOCAL statement_timeout = '5s';
SAVEPOINT crm_storage_backport_behavior;

INSERT INTO storage.buckets (id, name, public)
VALUES (
  '__crm_storage_backport_validation_791f9898',
  '__crm_storage_backport_validation_791f9898',
  false
);

INSERT INTO storage.objects (bucket_id, name, metadata, created_at, updated_at)
VALUES
  (
    '__crm_storage_backport_validation_791f9898',
    '__crm_storage_backport_validation_791f9898/alpha.txt',
    '{"size":1}'::jsonb,
    '2026-01-01 00:00:00+00'::timestamptz,
    '2026-01-01 00:00:01+00'::timestamptz
  ),
  (
    '__crm_storage_backport_validation_791f9898',
    '__crm_storage_backport_validation_791f9898/folder/beta.txt',
    '{"size":1}'::jsonb,
    '2026-01-01 00:00:02+00'::timestamptz,
    '2026-01-01 00:00:03+00'::timestamptz
  );

DO $behavior_validation$
DECLARE
  relative_names text[];
  normal_timestamp_order text[];
  hardened_timestamp_order text[];
BEGIN
  SELECT array_agg(result.name ORDER BY result.name)
  INTO relative_names
  FROM storage.search(
    '__crm_storage_backport_validation_791f9898/',
    '__crm_storage_backport_validation_791f9898',
    100,
    999,
    0,
    '',
    'name',
    'asc'
  ) AS result;

  IF relative_names IS DISTINCT FROM ARRAY['alpha.txt', 'folder']::text[] THEN
    RAISE EXCEPTION 'Storage migration 63 behavior failed: %', relative_names;
  END IF;

  SELECT array_agg(result.name)
  INTO normal_timestamp_order
  FROM storage.search_by_timestamp(
    '__crm_storage_backport_validation_791f9898/',
    '__crm_storage_backport_validation_791f9898',
    100,
    2,
    '',
    'asc',
    'updated_at',
    ''
  ) AS result;

  SELECT array_agg(result.name)
  INTO hardened_timestamp_order
  FROM storage.search_by_timestamp(
    '__crm_storage_backport_validation_791f9898/',
    '__crm_storage_backport_validation_791f9898',
    100,
    2,
    '',
    'desc nulls last; select pg_sleep(30); --',
    'updated_at) desc; select pg_sleep(30); --',
    ''
  ) AS result;

  IF normal_timestamp_order IS NULL
     OR hardened_timestamp_order IS DISTINCT FROM normal_timestamp_order THEN
    RAISE EXCEPTION 'Storage migration 64 input normalization behavior failed';
  END IF;
END
$behavior_validation$;

ROLLBACK TO SAVEPOINT crm_storage_backport_behavior;
RELEASE SAVEPOINT crm_storage_backport_behavior;
