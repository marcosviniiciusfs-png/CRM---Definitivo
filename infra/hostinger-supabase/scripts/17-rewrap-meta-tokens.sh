#!/usr/bin/env bash

# Re-encrypt Meta/Facebook token ciphertext on the self-hosted target by using
# a temporary, authenticated managed Edge Function as a cryptographic oracle.
# Plaintext is never returned by the oracle and never leaves process memory.

set -Eeuo pipefail
set +x
IFS=$'\n\t'
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

EXPECTED_PROJECT_REF='uxttihjsxfowursjyult'
REWRAP_ENDPOINT="https://${EXPECTED_PROJECT_REF}.supabase.co/functions/v1/meta-token-rewrap"
SECRET_FILE='/run/crm-meta-rewrap.env'
EXPECTED_NONEMPTY=''
EXPECTED_META_READABLE=''
EXPECTED_FALLBACK_READABLE=''
EXECUTE=false
INVENTORY=false
BATCH_SIZE=25

usage() {
  cat <<'USAGE'
Usage: 17-rewrap-meta-tokens.sh [options]

Outside inventory, dry-run is the default and all three freshly captured
expected counts are mandatory. PostgreSQL is changed only with --execute.

Options:
  --inventory                     Read-only oracle inventory; emit one tagged JSON line.
  --metrics-json                  Alias for --inventory (machine-readable output).
  --execute                       Apply the staged values in one DB transaction.
  --dry-run                       Validate only (default).
  --secret-file ABSOLUTE_PATH     One-time bearer file (default: /run/crm-meta-rewrap.env).
  --expected-nonempty N           Required outside inventory: non-empty token slots.
  --expected-meta-readable N      Required outside inventory: Meta-readable slots.
  --expected-fallback-readable N  Required outside inventory: target-fallback slots.
  -h, --help                      Show this help.
USAGE
}

while (( $# > 0 )); do
  case "$1" in
    --inventory|--metrics-json)
      INVENTORY=true
      shift
      ;;
    --execute)
      EXECUTE=true
      shift
      ;;
    --dry-run)
      EXECUTE=false
      shift
      ;;
    --secret-file)
      (( $# >= 2 )) || die '--secret-file exige um caminho'
      SECRET_FILE="$2"
      shift 2
      ;;
    --expected-nonempty)
      (( $# >= 2 )) || die '--expected-nonempty exige um número'
      EXPECTED_NONEMPTY="$2"
      shift 2
      ;;
    --expected-meta-readable)
      (( $# >= 2 )) || die '--expected-meta-readable exige um número'
      EXPECTED_META_READABLE="$2"
      shift 2
      ;;
    --expected-fallback-readable)
      (( $# >= 2 )) || die '--expected-fallback-readable exige um número'
      EXPECTED_FALLBACK_READABLE="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "opção desconhecida: $1"
      ;;
  esac
done

require_root
load_versions
require_command curl docker flock grep jq mktemp openssl python3 realpath sed sha256sum shred stat
require_file "$SCRIPT_DIR/rewrap-meta-token-artifacts.py"
require_file "$INSTALL_DIR/functions.env"
require_secret_file "$INSTALL_DIR/functions.env"
require_file "$INSTALL_DIR/.crm-last-restore"

[[ "$SECRET_FILE" == /* ]] || die '--secret-file precisa ser absoluto'
require_secret_file "$SECRET_FILE"
if [[ "$INVENTORY" == true ]]; then
  [[ "$EXECUTE" != true ]] || die '--inventory e --execute são mutuamente exclusivos'
  [[ -z "$EXPECTED_NONEMPTY$EXPECTED_META_READABLE$EXPECTED_FALLBACK_READABLE" ]] \
    || die '--inventory não aceita contagens esperadas'
else
  for value_name in EXPECTED_NONEMPTY EXPECTED_META_READABLE EXPECTED_FALLBACK_READABLE; do
    value="${!value_name}"
    [[ "$value" =~ ^[0-9]+$ ]] \
      || die "$value_name é obrigatório e precisa ser inteiro não negativo"
  done
  (( EXPECTED_META_READABLE + EXPECTED_FALLBACK_READABLE == EXPECTED_NONEMPTY )) \
    || die 'as contagens Meta + fallback precisam totalizar --expected-nonempty'
fi
(( BATCH_SIZE > 0 && BATCH_SIZE <= 25 )) || die 'BATCH_SIZE fora do limite do endpoint'

python3 - <<'PY' >/dev/null 2>&1 || die 'python3-cryptography/AESGCM não está disponível na VPS'
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
assert AESGCM
PY

secret_count="$(grep -c '^META_REWRAP_ONE_TIME_SECRET=' "$SECRET_FILE" || true)"
[[ "$secret_count" == 1 ]] || die 'META_REWRAP_ONE_TIME_SECRET precisa existir exatamente uma vez no arquivo one-time'
one_time_secret="$(env_file_value "$SECRET_FILE" META_REWRAP_ONE_TIME_SECRET)"
[[ "$one_time_secret" =~ ^[0-9a-fA-F]{64,128}$ ]] \
  || die 'META_REWRAP_ONE_TIME_SECRET precisa ter 64-128 caracteres hexadecimais'

meta_key_count="$(grep -c '^META_TOKEN_ENCRYPTION_KEY=' "$INSTALL_DIR/functions.env" || true)"
fallback_key_count="$(grep -c '^GOOGLE_CALENDAR_ENCRYPTION_KEY=' "$INSTALL_DIR/functions.env" || true)"
[[ "$meta_key_count" == 1 && "$fallback_key_count" == 1 ]] \
  || die 'as chaves Meta e fallback precisam existir exatamente uma vez em functions.env'
meta_key="$(env_file_value "$INSTALL_DIR/functions.env" META_TOKEN_ENCRYPTION_KEY)"
fallback_key="$(env_file_value "$INSTALL_DIR/functions.env" GOOGLE_CALENDAR_ENCRYPTION_KEY)"
[[ "$meta_key" =~ ^[0-9a-fA-F]{64}$ ]] || die 'META_TOKEN_ENCRYPTION_KEY precisa ser hex de 32 bytes'
[[ ${#fallback_key} -ge 16 && ${#fallback_key} -le 256 && "$fallback_key" != *[[:space:]]* ]] \
  || die 'GOOGLE_CALENDAR_ENCRYPTION_KEY legado é inválido'
[[ "${meta_key:0:32}" != "$(printf '%-32s' "$fallback_key" | tr ' ' '0' | cut -c1-32)" ]] \
  || die 'as chaves Meta e fallback normalizam para a mesma chave AES'

exec 9>/run/crm-meta-token-rewrap.lock
chmod 0600 /run/crm-meta-token-rewrap.lock
flock -n 9 || die 'outro rewrap de tokens Meta está em execução'

runtime_dir="$(mktemp -d /run/crm-meta-rewrap.XXXXXX)"
[[ "$runtime_dir" =~ ^/run/crm-meta-rewrap\.[A-Za-z0-9]+$ ]] || die 'diretório temporário inesperado'
chmod 0700 "$runtime_dir"
snapshot_file="$runtime_dir/snapshot.ndjson"
responses_file="$runtime_dir/responses.ndjson"
request_file="$runtime_dir/request.json"
response_file="$runtime_dir/response.json"
curl_config="$runtime_dir/request.curl"
error_file="$runtime_dir/error.log"
stage_file="$runtime_dir/stage.tsv"
post_snapshot_file="$runtime_dir/post-snapshot.ndjson"
transaction_output="$runtime_dir/transaction.out"

cleanup() {
  unset one_time_secret meta_key fallback_key
  if [[ -n "${runtime_dir:-}" && -d "$runtime_dir" \
     && "$runtime_dir" =~ ^/run/crm-meta-rewrap\.[A-Za-z0-9]+$ ]]; then
    find "$runtime_dir" -type f -exec shred -u -- {} + 2>/dev/null || true
    rmdir -- "$runtime_dir" 2>/dev/null || true
  fi
}
trap cleanup EXIT

for file in "$snapshot_file" "$responses_file" "$error_file" "$transaction_output"; do
  : >"$file"
  chmod 0600 "$file"
done

db_container_id="$(compose ps -q db)"
[[ -n "$db_container_id" ]] || die 'container PostgreSQL do target não encontrado'
[[ "$(docker inspect --format '{{.State.Running}}' "$db_container_id")" == true ]] \
  || die 'PostgreSQL do target não está em execução'

schema_preflight="$(docker exec "$db_container_id" psql -X -U supabase_admin -d postgres \
  --no-psqlrc -v ON_ERROR_STOP=1 -Atq -F '|' -c "
    SELECT
      to_regclass('public.facebook_integration_tokens') IS NOT NULL,
      count(*) FILTER (WHERE column_name IN ('id','encrypted_access_token','encrypted_page_access_token'))
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='facebook_integration_tokens';
  ")"
[[ "$schema_preflight" == 't|3' ]] || die 'schema alvo de tokens Meta não corresponde ao esperado'

capture_snapshot() {
  local destination="$1"
  local snapshot_error="$runtime_dir/snapshot-error.log"
  : >"$snapshot_error"
  chmod 0600 "$snapshot_error"
  if ! docker exec "$db_container_id" psql -X -U supabase_admin -d postgres \
    --no-psqlrc -v ON_ERROR_STOP=1 -Atq -c "
      COPY (
        SELECT jsonb_build_object(
          'row_id', token_row.id,
          'field', token_slot.field,
          'ciphertext', token_slot.ciphertext
        )::text
        FROM public.facebook_integration_tokens AS token_row
        CROSS JOIN LATERAL (
          VALUES
            ('encrypted_access_token'::text, token_row.encrypted_access_token),
            ('encrypted_page_access_token'::text, token_row.encrypted_page_access_token)
        ) AS token_slot(field, ciphertext)
        ORDER BY token_row.id, token_slot.field
      ) TO STDOUT;
    " >"$destination" 2>"$snapshot_error"; then
    die 'falha ao capturar snapshot sanitizado dos ciphertexts alvo'
  fi
  chmod 0600 "$destination"
}

capture_snapshot "$snapshot_file"
jq -s -e '
  length > 0 and
  all(.[];
    (keys | sort) == ["ciphertext","field","row_id"] and
    (.row_id | type == "string") and
    (.field == "encrypted_access_token" or .field == "encrypted_page_access_token") and
    (.ciphertext == null or (.ciphertext | type == "string"))
  )
' "$snapshot_file" >/dev/null || die 'snapshot alvo possui formato inesperado'

slot_count="$(jq -s 'length' "$snapshot_file")"
nonempty_count="$(jq -s '[.[] | select(.ciphertext != null and .ciphertext != "")] | length' "$snapshot_file")"
if [[ "$INVENTORY" != true ]]; then
  [[ "$nonempty_count" == "$EXPECTED_NONEMPTY" ]] \
    || die "contagem de tokens não vazios divergiu (esperado=$EXPECTED_NONEMPTY; encontrado=$nonempty_count)"
fi
(( slot_count >= nonempty_count )) || die 'contagens de slots inconsistentes'

offset=0
while (( offset < nonempty_count )); do
  jq -s --argjson offset "$offset" --argjson batch_size "$BATCH_SIZE" '
    [.[] | select(.ciphertext != null and .ciphertext != "")] as $items
    | {items: ($items[$offset:($offset + $batch_size)]
        | map({row_id, field, ciphertext}))}
  ' "$snapshot_file" >"$request_file"
  chmod 0600 "$request_file"
  batch_count="$(jq '.items | length' "$request_file")"
  (( batch_count > 0 && batch_count <= BATCH_SIZE )) || die 'lote local fora do limite'

  cat >"$curl_config" <<CURL_CONFIG
url = "$REWRAP_ENDPOINT"
request = "POST"
header = "Authorization: Bearer $one_time_secret"
header = "Content-Type: application/json"
header = "Accept: application/json"
data-binary = "@$request_file"
output = "$response_file"
write-out = "%{http_code}"
connect-timeout = 10
max-time = 45
max-filesize = 524288
proto = "=https"
tlsv1.2
silent
show-error
CURL_CONFIG
  chmod 0600 "$curl_config"
  : >"$response_file"
  chmod 0600 "$response_file"
  if ! http_status="$(curl --disable --config "$curl_config" 2>>"$error_file")"; then
    die 'chamada ao oráculo Meta falhou; resposta e detalhes não foram enviados aos logs'
  fi
  [[ "$http_status" == 200 ]] || die "oráculo Meta recusou o lote (HTTP $http_status)"
  (( $(stat -c '%s' "$response_file") <= 524288 )) || die 'resposta do oráculo excedeu o limite'

  jq -e --argjson expected "$batch_count" '
    type == "object" and
    ((keys | sort) == ["counts","results"]) and
    (.results | type == "array" and length == $expected) and
    (.counts.received == $expected) and
    all(.results[];
      ((keys - ["ciphertext","field","row_id","status"]) | length == 0) and
      (.row_id | type == "string") and
      (.field == "encrypted_access_token" or .field == "encrypted_page_access_token") and
      (.status == "rewrapped" or .status == "already_current" or .status == "unreadable") and
      (if .status == "rewrapped"
       then (.ciphertext | type == "string" and length > 0 and length <= 8192)
       else has("ciphertext") | not
       end)
    )
  ' "$response_file" >/dev/null || die 'resposta do oráculo possui schema inválido'
  jq -s -e '
    .[0].items as $request
    | .[1].results as $response
    | ([ $request[] | (.row_id + ":" + .field) ] | sort) ==
      ([ $response[] | (.row_id + ":" + .field) ] | sort)
    | select(.)
    | ([ $response[] | (.row_id + ":" + .field) ] | unique | length) == ($response | length)
  ' "$request_file" "$response_file" >/dev/null \
    || die 'identidades retornadas pelo oráculo não correspondem ao lote'
  jq -c '.results[]' "$response_file" >>"$responses_file"
  offset=$((offset + batch_count))
done

response_count="$(wc -l <"$responses_file" | tr -d '[:space:]')"
[[ "$response_count" == "$nonempty_count" ]] || die 'quantidade total de respostas divergiu'

if [[ "$INVENTORY" == true ]]; then
  if ! inventory_metrics="$({ printf '%s\n%s\n' "$meta_key" "$fallback_key"; } \
    | python3 "$SCRIPT_DIR/rewrap-meta-token-artifacts.py" inventory \
        --snapshot "$snapshot_file" \
        --responses "$responses_file" \
        2>>"$error_file")"; then
    die 'inventário criptográfico falhou; detalhes não foram enviados aos logs'
  fi

  metric_value() {
    local name="$1"
    local value
    value="$(tr ' ' '\n' <<<"$inventory_metrics" | awk -F= -v wanted="$name" '$1 == wanted {print $2; exit}')"
    [[ "$value" =~ ^[0-9]+$ ]] || die "métrica sanitizada ausente: $name"
    printf '%s' "$value"
  }

  inventory_nonempty="$(metric_value nonempty)"
  inventory_meta="$(metric_value meta_readable)"
  inventory_fallback="$(metric_value fallback_readable)"
  inventory_invalid="$(metric_value invalid)"
  (( inventory_meta + inventory_fallback + inventory_invalid == inventory_nonempty )) \
    || die 'métricas sanitizadas de inventário são inconsistentes'
  printf 'CRM_META_REWRAP_METRICS={"nonempty":%s,"meta_readable":%s,"fallback_readable":%s,"invalid":%s}\n' \
    "$inventory_nonempty" "$inventory_meta" "$inventory_fallback" "$inventory_invalid"
  exit 0
fi

if ! build_metrics="$({ printf '%s\n%s\n' "$meta_key" "$fallback_key"; } \
  | python3 "$SCRIPT_DIR/rewrap-meta-token-artifacts.py" build \
      --snapshot "$snapshot_file" \
      --responses "$responses_file" \
      --output "$stage_file" \
      --expected-nonempty "$EXPECTED_NONEMPTY" \
      2>>"$error_file")"; then
  die 'validação criptográfica pré-transação falhou'
fi
chmod 0600 "$stage_file"

metric_value() {
  local name="$1"
  local value
  value="$(tr ' ' '\n' <<<"$build_metrics" | awk -F= -v wanted="$name" '$1 == wanted {print $2; exit}')"
  [[ "$value" =~ ^[0-9]+$ ]] || die "métrica sanitizada ausente: $name"
  printf '%s' "$value"
}

rewrapped_count="$(metric_value rewrapped)"
already_current_count="$(metric_value already_current)"
fallback_rewrapped_count="$(metric_value fallback_rewrapped)"
changed_count="$(metric_value changed)"
meta_valid_count="$(metric_value meta_valid)"
fallback_valid_count="$(metric_value fallback_valid)"
(( rewrapped_count + already_current_count == EXPECTED_META_READABLE )) \
  || die 'cobertura da chave managed atual divergiu da expectativa'
[[ "$fallback_rewrapped_count" == "$EXPECTED_FALLBACK_READABLE" ]] \
  || die 'cobertura do fallback histórico divergiu da expectativa'
(( changed_count == rewrapped_count + fallback_rewrapped_count )) \
  || die 'contagem sanitizada de alterações divergiu'
[[ "$meta_valid_count" == "$EXPECTED_NONEMPTY" && "$fallback_valid_count" == 0 ]] \
  || die 'estado proposto não eliminou a dependência do fallback'

log "Preflight Meta rewrap: slots=$slot_count nonempty=$nonempty_count source_meta=$EXPECTED_META_READABLE source_fallback=$EXPECTED_FALLBACK_READABLE proposed_meta=$meta_valid_count proposed_fallback=0 invalid=0"

if [[ "$EXECUTE" != true ]]; then
  log 'DRY-RUN aprovado; PostgreSQL não foi alterado'
  exit 0
fi

transaction_error="$runtime_dir/transaction-error.log"
: >"$transaction_error"
chmod 0600 "$transaction_error"
if ! {
  cat <<'SQL_BEFORE_COPY'
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';
SELECT pg_advisory_xact_lock(hashtextextended('crm-meta-token-rewrap-v1', 0));
LOCK TABLE public.facebook_integration_tokens IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE meta_token_rewrap_stage (
  row_id uuid NOT NULL,
  field text NOT NULL CHECK (field IN ('encrypted_access_token','encrypted_page_access_token')),
  expected_state text NOT NULL CHECK (expected_state IN ('null','empty','cipher')),
  expected_b64 text NOT NULL,
  desired_state text NOT NULL CHECK (desired_state IN ('null','empty','cipher')),
  desired_b64 text NOT NULL,
  PRIMARY KEY (row_id, field)
) ON COMMIT DROP;

COPY meta_token_rewrap_stage (
  row_id, field, expected_state, expected_b64, desired_state, desired_b64
) FROM STDIN WITH (FORMAT text, DELIMITER E'\t', NULL '__NULL_NOT_USED__');
SQL_BEFORE_COPY
  cat "$stage_file"
  printf '\\.\n'
  cat <<'SQL_AFTER_COPY'

CREATE TEMP VIEW meta_token_rewrap_decoded AS
SELECT
  row_id,
  field,
  CASE expected_state
    WHEN 'null' THEN NULL
    WHEN 'empty' THEN ''
    ELSE convert_from(decode(expected_b64, 'base64'), 'UTF8')
  END AS expected_value,
  CASE desired_state
    WHEN 'null' THEN NULL
    WHEN 'empty' THEN ''
    ELSE convert_from(decode(desired_b64, 'base64'), 'UTF8')
  END AS desired_value
FROM meta_token_rewrap_stage;

CREATE TEMP TABLE meta_token_rewrap_expectation (
  expected_slots bigint NOT NULL,
  expected_changed bigint NOT NULL
) ON COMMIT DROP;
INSERT INTO meta_token_rewrap_expectation (expected_slots, expected_changed)
VALUES (:'expected_slots'::bigint, :'expected_changed'::bigint);

DO $crm_meta_rewrap$
DECLARE
  staged_slots bigint;
  target_slots bigint;
  changed_slots bigint;
  approved_slots bigint;
  approved_changed bigint;
BEGIN
  SELECT count(*) INTO staged_slots FROM meta_token_rewrap_stage;
  SELECT count(*) * 2 INTO target_slots FROM public.facebook_integration_tokens;
  SELECT count(*) INTO changed_slots
  FROM meta_token_rewrap_decoded
  WHERE expected_value IS DISTINCT FROM desired_value;
  SELECT expected_slots, expected_changed
    INTO approved_slots, approved_changed
  FROM meta_token_rewrap_expectation;

  IF staged_slots <> approved_slots OR target_slots <> staged_slots THEN
    RAISE EXCEPTION 'meta rewrap slot count mismatch';
  END IF;
  IF changed_slots <> approved_changed THEN
    RAISE EXCEPTION 'meta rewrap changed count mismatch';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM meta_token_rewrap_decoded AS staged
    LEFT JOIN public.facebook_integration_tokens AS target ON target.id = staged.row_id
    WHERE target.id IS NULL
       OR CASE staged.field
            WHEN 'encrypted_access_token' THEN target.encrypted_access_token
            WHEN 'encrypted_page_access_token' THEN target.encrypted_page_access_token
          END IS DISTINCT FROM staged.expected_value
  ) THEN
    RAISE EXCEPTION 'meta rewrap target changed after snapshot';
  END IF;
END
$crm_meta_rewrap$;

WITH desired_by_row AS (
  SELECT
    row_id,
    max(desired_value) FILTER (WHERE field = 'encrypted_access_token') AS access_token,
    max(desired_value) FILTER (WHERE field = 'encrypted_page_access_token') AS page_token
  FROM meta_token_rewrap_decoded
  GROUP BY row_id
)
UPDATE public.facebook_integration_tokens AS target
SET
  encrypted_access_token = desired.access_token,
  encrypted_page_access_token = desired.page_token,
  updated_at = clock_timestamp()
FROM desired_by_row AS desired
WHERE target.id = desired.row_id
  AND (
    target.encrypted_access_token IS DISTINCT FROM desired.access_token
    OR target.encrypted_page_access_token IS DISTINCT FROM desired.page_token
  );

DO $crm_meta_rewrap$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM meta_token_rewrap_decoded AS staged
    LEFT JOIN public.facebook_integration_tokens AS target ON target.id = staged.row_id
    WHERE target.id IS NULL
       OR CASE staged.field
            WHEN 'encrypted_access_token' THEN target.encrypted_access_token
            WHEN 'encrypted_page_access_token' THEN target.encrypted_page_access_token
          END IS DISTINCT FROM staged.desired_value
  ) THEN
    RAISE EXCEPTION 'meta rewrap transactional verification failed';
  END IF;
END
$crm_meta_rewrap$;

SELECT 'transaction_validated_slots=' || count(*) ||
       ' changed_slots=' || count(*) FILTER (WHERE expected_value IS DISTINCT FROM desired_value)
FROM meta_token_rewrap_decoded;
COMMIT;
SQL_AFTER_COPY
} | docker exec -i "$db_container_id" psql -X -U supabase_admin -d postgres \
      --no-psqlrc -qAt -v ON_ERROR_STOP=1 \
      --set="expected_slots=$slot_count" \
      --set="expected_changed=$changed_count" \
      >"$transaction_output" 2>"$transaction_error"; then
  die 'transação de rewrap falhou e foi revertida; detalhes não foram enviados aos logs'
fi

transaction_summary="$(grep '^transaction_validated_slots=' "$transaction_output" | tail -n1)"
[[ "$transaction_summary" == "transaction_validated_slots=$slot_count changed_slots=$changed_count" ]] \
  || die 'confirmação sanitizada da transação divergiu'

capture_snapshot "$post_snapshot_file"
if ! post_metrics="$({ printf '%s\n%s\n' "$meta_key" "$fallback_key"; } \
  | python3 "$SCRIPT_DIR/rewrap-meta-token-artifacts.py" verify \
      --snapshot "$post_snapshot_file" \
      --stage "$stage_file" \
      --expected-nonempty "$EXPECTED_NONEMPTY" \
      2>>"$error_file")"; then
  die 'validação criptográfica pós-commit falhou'
fi
[[ "$post_metrics" == *"post_meta_valid=$EXPECTED_NONEMPTY"* \
   && "$post_metrics" == *'post_fallback_valid=0'* \
   && "$post_metrics" == *'post_invalid=0'* ]] \
  || die 'métricas pós-commit divergiram da cobertura aprovada'

audit_dir='/var/lib/crm-migration'
install -d -m 0700 "$audit_dir"
audit_file="$audit_dir/meta-token-rewrap-last-success"
audit_temp="$(mktemp "$audit_dir/.meta-token-rewrap.XXXXXX")"
cat >"$audit_temp" <<AUDIT
completed_at_utc=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
project_ref=$EXPECTED_PROJECT_REF
restore_marker_sha256=$(sha256sum "$INSTALL_DIR/.crm-last-restore" | awk '{print $1}')
meta_key_sha256=$(printf '%s' "$meta_key" | sha256sum | awk '{print $1}')
fallback_key_sha256=$(printf '%s' "$fallback_key" | sha256sum | awk '{print $1}')
slots_total=$slot_count
nonempty=$nonempty_count
source_meta_readable=$EXPECTED_META_READABLE
source_fallback_readable=$EXPECTED_FALLBACK_READABLE
rewrapped=$rewrapped_count
already_current=$already_current_count
fallback_rewrapped=$fallback_rewrapped_count
changed=$changed_count
meta_valid=$meta_valid_count
fallback_valid=$fallback_valid_count
invalid=0
before_ciphertext_snapshot_sha256=$(sha256sum "$snapshot_file" | awk '{print $1}')
after_ciphertext_snapshot_sha256=$(sha256sum "$post_snapshot_file" | awk '{print $1}')
AUDIT
chmod 0600 "$audit_temp"
chown root:root "$audit_temp"
mv -f -- "$audit_temp" "$audit_file"

log "Rewrap Meta concluído: validated=$nonempty_count/$EXPECTED_NONEMPTY meta=$meta_valid_count fallback=0 invalid=0"
log 'Remova imediatamente a função managed e o segredo META_REWRAP_ONE_TIME_SECRET conforme META_TOKEN_REWRAP.md'
