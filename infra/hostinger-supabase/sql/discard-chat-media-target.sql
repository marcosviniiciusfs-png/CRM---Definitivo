-- Exclusao unica, transacional e exclusiva do DESTINO da migracao.
--
-- O bucket chat-media e sua configuracao sao preservados. Somente os
-- metadados historicos restaurados do projeto gerenciado sao descartados.
-- Os bytes do bucket nunca sao copiados pelos scripts de Storage.

\set ON_ERROR_STOP on
\pset pager off

\if :{?confirm_discard_chat_media}
\else
  \echo 'ERROR: confirm_discard_chat_media is required.'
  \quit 3
\endif

SELECT (
  :'confirm_discard_chat_media'
    = 'YES_DISCARD_ALL_HISTORICAL_CHAT_MEDIA_ON_TARGET'
) AS discard_confirmation_is_valid
\gset

\if :discard_confirmation_is_valid
\else
  \echo 'ERROR: explicit chat-media discard confirmation is invalid.'
  \quit 3
\endif

\if :{?expected_object_count}
\else
  \echo 'ERROR: expected_object_count is required.'
  \quit 3
\endif

\if :{?expected_object_bytes}
\else
  \echo 'ERROR: expected_object_bytes is required.'
  \quit 3
\endif

SELECT (
  :'expected_object_count' ~ '^[0-9]+$'
  AND :'expected_object_bytes' ~ '^[0-9]+$'
) AS discard_inventory_is_valid
\gset

\if :discard_inventory_is_valid
\else
  \echo 'ERROR: expected chat-media inventory is invalid.'
  \quit 3
\endif

BEGIN;

SELECT set_config(
  'crm_migration.expected_chat_media_objects',
  :'expected_object_count',
  true
);
SELECT set_config(
  'crm_migration.expected_chat_media_bytes',
  :'expected_object_bytes',
  true
);

LOCK TABLE storage.buckets IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE storage.objects IN ACCESS EXCLUSIVE MODE;

-- The target intentionally has no historical chat-media bytes. Bypass the
-- Storage protection trigger only inside this transaction so its restored
-- metadata can be removed without creating 134k failing API delete requests.
SET LOCAL session_replication_role = replica;

DO $discard_chat_media$
DECLARE
  bucket_count integer;
  bucket_is_public boolean;
  object_count bigint;
  object_bytes numeric;
  objects_without_numeric_size bigint;
  affected_rows bigint;
  expected_object_count bigint;
  expected_object_bytes numeric;
BEGIN
  IF current_database() <> 'postgres'
     OR pg_is_in_recovery()
     OR current_setting('transaction_read_only') <> 'off' THEN
    RAISE EXCEPTION 'o banco nao e o destino postgres gravavel esperado';
  END IF;

  SELECT count(*)::integer, bool_and(public)
  INTO bucket_count, bucket_is_public
  FROM storage.buckets
  WHERE id = 'chat-media';

  IF bucket_count <> 1 OR bucket_is_public IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'chat-media precisa existir exatamente uma vez e continuar publico; configuracao recusada';
  END IF;

  SELECT
    count(*)::bigint,
    COALESCE(sum(
      CASE
        WHEN metadata ->> 'size' ~ '^[0-9]+$'
          THEN (metadata ->> 'size')::numeric
        ELSE 0
      END
    ), 0),
    count(*) FILTER (
      WHERE metadata ->> 'size' IS NULL
         OR metadata ->> 'size' !~ '^[0-9]+$'
    )::bigint
  INTO object_count, object_bytes, objects_without_numeric_size
  FROM storage.objects
  WHERE bucket_id = 'chat-media';

  expected_object_count := current_setting(
    'crm_migration.expected_chat_media_objects'
  )::bigint;
  expected_object_bytes := current_setting(
    'crm_migration.expected_chat_media_bytes'
  )::numeric;

  IF object_count <> expected_object_count
     OR object_bytes <> expected_object_bytes
     OR objects_without_numeric_size <> 0 THEN
    RAISE EXCEPTION
      'chat-media mudou depois do preflight: objetos=% bytes=% sem_tamanho=%; descarte recusado',
      object_count,
      object_bytes,
      objects_without_numeric_size;
  END IF;

  IF to_regclass('storage.s3_multipart_uploads') IS NOT NULL THEN
    IF to_regclass('storage.s3_multipart_uploads_parts') IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'storage'
           AND table_name = 's3_multipart_uploads_parts'
           AND column_name = 'upload_id'
       )
       AND EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'storage'
           AND table_name = 's3_multipart_uploads'
           AND column_name = 'bucket_id'
       ) THEN
      EXECUTE $sql$
        DELETE FROM storage.s3_multipart_uploads_parts AS part
        USING storage.s3_multipart_uploads AS upload
        WHERE part.upload_id = upload.id
          AND upload.bucket_id = 'chat-media'
      $sql$;
      GET DIAGNOSTICS affected_rows = ROW_COUNT;
      RAISE NOTICE 'chat-media multipart parts removidas: %', affected_rows;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'storage'
        AND table_name = 's3_multipart_uploads'
        AND column_name = 'bucket_id'
    ) THEN
      EXECUTE $sql$
        DELETE FROM storage.s3_multipart_uploads
        WHERE bucket_id = 'chat-media'
      $sql$;
      GET DIAGNOSTICS affected_rows = ROW_COUNT;
      RAISE NOTICE 'chat-media multipart uploads removidos: %', affected_rows;
    END IF;
  END IF;

  DELETE FROM storage.objects
  WHERE bucket_id = 'chat-media';
  GET DIAGNOSTICS affected_rows = ROW_COUNT;

  IF affected_rows <> object_count THEN
    RAISE EXCEPTION
      'foram removidos % objetos, mas % eram esperados',
      affected_rows,
      object_count;
  END IF;

  IF to_regclass('storage.prefixes') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'storage'
         AND table_name = 'prefixes'
         AND column_name = 'bucket_id'
     ) THEN
    EXECUTE $sql$
      DELETE FROM storage.prefixes
      WHERE bucket_id = 'chat-media'
    $sql$;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RAISE NOTICE 'chat-media prefixes removidos: %', affected_rows;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id = 'chat-media'
  ) THEN
    RAISE EXCEPTION 'chat-media ainda contem objetos depois do descarte';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'chat-media'
      AND public
  ) THEN
    RAISE EXCEPTION 'a configuracao do bucket chat-media nao foi preservada';
  END IF;

  RAISE NOTICE
    'chat-media limpo somente no destino: % objetos historicos, % bytes inventariados',
    object_count,
    object_bytes;
END
$discard_chat_media$;

COMMIT;

\echo 'chat-media preservado e vazio no destino.'
