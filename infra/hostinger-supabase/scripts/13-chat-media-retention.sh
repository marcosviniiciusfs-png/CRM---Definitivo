#!/usr/bin/env bash

# Delete target chat-media objects older than seven days through Storage API.
# SQL is read-only and is used only to select/count eligible object names.
# shellcheck shell=bash

set -Eeuo pipefail
IFS=$'\n\t'
umask 077

case "$-" in
  *x*)
    set +x
    ;;
esac

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

require_root
load_versions
require_command date docker flock jq mktemp sort stat
[[ $# -eq 0 ]] || die 'uso: 13-chat-media-retention.sh'

RETENTION_DAYS=7
RETENTION_BATCH_SIZE="${RETENTION_BATCH_SIZE:-250}"
RETENTION_MAX_OBJECTS_PER_RUN="${RETENTION_MAX_OBJECTS_PER_RUN:-2000}"
RETENTION_MAX_RUNTIME_SECONDS="${RETENTION_MAX_RUNTIME_SECONDS:-300}"
RETENTION_API_TIMEOUT_SECONDS="${RETENTION_API_TIMEOUT_SECONDS:-60}"

[[ "$RETENTION_BATCH_SIZE" =~ ^[0-9]+$ \
   && "$RETENTION_BATCH_SIZE" -ge 1 \
   && "$RETENTION_BATCH_SIZE" -le 1000 ]] \
  || die 'RETENTION_BATCH_SIZE deve ser inteiro entre 1 e 1000'
[[ "$RETENTION_MAX_OBJECTS_PER_RUN" =~ ^[0-9]+$ \
   && "$RETENTION_MAX_OBJECTS_PER_RUN" -ge 1 \
   && "$RETENTION_MAX_OBJECTS_PER_RUN" -le 10000 ]] \
  || die 'RETENTION_MAX_OBJECTS_PER_RUN deve ser inteiro entre 1 e 10000'
[[ "$RETENTION_MAX_RUNTIME_SECONDS" =~ ^[0-9]+$ \
   && "$RETENTION_MAX_RUNTIME_SECONDS" -ge 30 \
   && "$RETENTION_MAX_RUNTIME_SECONDS" -le 1800 ]] \
  || die 'RETENTION_MAX_RUNTIME_SECONDS deve ser inteiro entre 30 e 1800'
[[ "$RETENTION_API_TIMEOUT_SECONDS" =~ ^[0-9]+$ \
   && "$RETENTION_API_TIMEOUT_SECONDS" -ge 5 \
   && "$RETENTION_API_TIMEOUT_SECONDS" -le 300 ]] \
  || die 'RETENTION_API_TIMEOUT_SECONDS deve ser inteiro entre 5 e 300'

[[ ! -L "$INSTALL_DIR/.crm-supabase-commit" ]] || die 'marcador de commit symlink recusado'
require_file "$INSTALL_DIR/.crm-supabase-commit"
[[ "$(tr -d '[:space:]' <"$INSTALL_DIR/.crm-supabase-commit")" == "$SUPABASE_COMMIT" ]] \
  || die 'a stack de destino nao esta no commit fixado'

restore_marker="$INSTALL_DIR/.crm-last-restore"
restore_in_progress_marker="$INSTALL_DIR/.crm-restore-in-progress"
discard_marker="$INSTALL_DIR/.crm-chat-media-discarded"
enabled_marker="$INSTALL_DIR/.crm-chat-media-retention-enabled"
[[ ! -e "$restore_in_progress_marker" && ! -L "$restore_in_progress_marker" ]] \
  || die 'o marcador de restore em andamento ainda existe; retencao recusada'
for marker_file in "$restore_marker" "$discard_marker" "$enabled_marker"; do
  [[ ! -L "$marker_file" ]] || die "marcador symlink recusado: $marker_file"
  require_secret_file "$marker_file"
done

[[ "$(env_file_value "$restore_marker" status)" == 'restored' ]] \
  || die 'o marcador nao confirma um restore concluido'
restore_manifest_sha256="$(env_file_value "$restore_marker" manifest_sha256)"
[[ "$restore_manifest_sha256" =~ ^[0-9a-f]{64}$ ]] \
  || die 'o marcador de restore nao contem SHA-256 valido'
discarded_chat_media_objects="$(env_file_value "$discard_marker" discarded_objects)"
discarded_chat_media_bytes="$(env_file_value "$discard_marker" discarded_bytes)"
[[ "$(env_file_value "$discard_marker" status)" == 'discarded' \
   && "$(env_file_value "$discard_marker" restore_manifest_sha256)" == "$restore_manifest_sha256" \
   && "$discarded_chat_media_objects" =~ ^[0-9]+$ \
   && "$discarded_chat_media_bytes" =~ ^[0-9]+$ \
   && "$(env_file_value "$discard_marker" objects_without_numeric_size)" == '0' ]] \
  || die 'o descarte inicial de chat-media nao pertence ao restore atual ou possui inventario invalido'
[[ "$(env_file_value "$enabled_marker" status)" == 'enabled' \
   && "$(env_file_value "$enabled_marker" restore_manifest_sha256)" == "$restore_manifest_sha256" \
   && "$(env_file_value "$enabled_marker" retention_days)" == "$RETENTION_DAYS" ]] \
  || die 'a retencao nao foi habilitada explicitamente para o restore atual'
retention_enabled_at_utc="$(env_file_value "$enabled_marker" enabled_at_utc)"
[[ "$retention_enabled_at_utc" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] \
  || die 'timestamp de ativacao da retencao invalido'
retention_enabled_epoch="$(date -d "$retention_enabled_at_utc" +%s 2>/dev/null)" \
  || die 'timestamp de ativacao da retencao nao pode ser interpretado'
(( retention_enabled_epoch <= $(date +%s) + 300 )) \
  || die 'timestamp de ativacao da retencao esta no futuro'

target_env_file="$INSTALL_DIR/.env"
[[ ! -L "$target_env_file" ]] || die '.env symlink recusado'
require_secret_file "$target_env_file"
service_role_key_count="$(awk -F= '$1 == "SERVICE_ROLE_KEY" { count++ } END { print count + 0 }' "$target_env_file")"
[[ "$service_role_key_count" == '1' ]] \
  || die 'SERVICE_ROLE_KEY precisa existir exatamente uma vez em .env'
retention_service_key="$(env_file_value "$target_env_file" SERVICE_ROLE_KEY)"
[[ ${#retention_service_key} -ge 20 \
   && "$retention_service_key" != *[[:space:]]* \
   && "$retention_service_key" != REPLACE* ]] \
  || die 'SERVICE_ROLE_KEY ausente ou invalida em .env'
export -n SERVICE_ROLE_KEY 2>/dev/null || true
unset SERVICE_ROLE_KEY

cleanup_sensitive_state() {
  unset retention_service_key candidate_json api_result
}
trap cleanup_sensitive_state EXIT

install -d -m 0700 "$BACKUP_DIR" "$BACKUP_DIR/retention"
exec 8>"$BACKUP_DIR/.backup.lock"
if ! flock -n 8; then
  log 'Retencao chat-media adiada: backup/maintenance em execucao; nenhum objeto foi alterado.'
  exit 0
fi
exec 9>"$INSTALL_DIR/.chat-media-retention.lock"
if ! flock -n 9; then
  log 'Retencao chat-media adiada: outra execucao esta ativa; nenhum objeto foi alterado.'
  exit 0
fi

compose config --quiet
db_container_id="$(compose ps -a -q db)"
storage_container_id="$(compose ps -a -q storage)"
gateway_container_id="$(compose ps -a -q api-gw)"
[[ -n "$db_container_id" && -n "$storage_container_id" && -n "$gateway_container_id" ]] \
  || die 'db, storage ou api-gw ausente no compose do destino'

require_running_container() {
  local service_name="$1"
  local container_id="$2"
  local state health
  state="$(docker inspect --format '{{.State.Status}}' "$container_id")"
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id")"
  [[ "$state" == 'running' && ( "$health" == 'healthy' || "$health" == 'none' ) ]] \
    || die "$service_name nao esta pronto (state=$state health=$health)"
}
require_running_container db "$db_container_id"
require_running_container storage "$storage_container_id"
require_running_container api-gw "$gateway_container_id"
docker exec "$storage_container_id" node -e \
  'if (typeof fetch !== "function" || typeof AbortController !== "function") process.exit(1)' \
  >/dev/null 2>&1 \
  || die 'runtime Node do servico storage nao oferece o cliente HTTP exigido'

gateway_bindings="$(docker inspect --format '{{range $bindings := .NetworkSettings.Ports}}{{range $bindings}}{{println .HostIp .HostPort}}{{end}}{{end}}' "$gateway_container_id")"
[[ -z "$gateway_bindings" ]] \
  || die 'api-gw possui porta publicada no host; rota de retencao interna recusada'

mapfile -t storage_networks < <(
  docker inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' \
    "$storage_container_id" | LC_ALL=C sort -u
)
mapfile -t gateway_networks < <(
  docker inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' \
    "$gateway_container_id" | LC_ALL=C sort -u
)
shared_network=false
for storage_network in "${storage_networks[@]}"; do
  for gateway_network in "${gateway_networks[@]}"; do
    if [[ -n "$storage_network" && "$storage_network" == "$gateway_network" ]]; then
      shared_network=true
    fi
  done
done
[[ "$shared_network" == true ]] \
  || die 'storage e api-gw nao compartilham uma network Docker interna'

preflight="$(docker exec "$db_container_id" psql -XAtq -F '|' -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c 'BEGIN TRANSACTION READ ONLY;' \
  -c "SELECT current_database(), pg_is_in_recovery(), current_setting('transaction_read_only'), (to_regclass('storage.objects') IS NOT NULL AND to_regclass('storage.buckets') IS NOT NULL), (SELECT count(*) FROM storage.buckets WHERE id = 'chat-media'), (SELECT bool_and(public) FROM storage.buckets WHERE id = 'chat-media'), (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'storage' AND table_name = 'objects' AND column_name IN ('name','bucket_id','updated_at','created_at'));" \
  -c 'COMMIT;' 2>/dev/null)" \
  || die 'preflight SQL read-only da retencao falhou'
IFS='|' read -r database_name database_in_recovery database_read_only storage_catalog_ready bucket_count bucket_public required_column_count <<<"$preflight"
[[ "$database_name" == 'postgres' \
   && "$database_in_recovery" == 'f' \
   && "$database_read_only" == 'on' \
   && "$storage_catalog_ready" == 't' ]] \
  || die 'o banco nao e o destino postgres esperado ou a leitura nao ficou read-only'
[[ "$bucket_count" == '1' && "$bucket_public" == 't' ]] \
  || die 'chat-media precisa existir exatamente uma vez e continuar publico'
[[ "$required_column_count" == '4' ]] \
  || die 'schema de storage.objects incompativel com a retencao preparada'

api_delete_program='(async () => {
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
let names;
try {
  names = JSON.parse(Buffer.concat(chunks).toString("utf8"));
} catch {
  console.error("retention-invalid-request-json");
  process.exit(20);
}
if (!Array.isArray(names) || names.length < 1 || names.length > 1000 ||
    names.some((name) => typeof name !== "string" || name.length < 1 || name.includes("\u0000")) ||
    new Set(names).size !== names.length) {
  console.error("retention-invalid-request-shape");
  process.exit(21);
}
const key = process.env.RETENTION_SERVICE_KEY;
const timeoutMs = Number(process.env.RETENTION_API_TIMEOUT_MS);
if (typeof key !== "string" || key.length < 20 || !Number.isInteger(timeoutMs) || timeoutMs < 5000) {
  console.error("retention-invalid-runtime-config");
  process.exit(22);
}
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), timeoutMs);
try {
  const response = await fetch("http://api-gw:8000/storage/v1/object/chat-media", {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${key}`,
      "apikey": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefixes: names }),
    redirect: "error",
    signal: controller.signal,
  });
  const responseText = await response.text();
  if (!response.ok) {
    console.error(`retention-storage-api-http-${response.status}`);
    process.exit(23);
  }
  let deleted;
  try {
    deleted = JSON.parse(responseText);
  } catch {
    console.error("retention-storage-api-invalid-json");
    process.exit(24);
  }
  if (!Array.isArray(deleted) || deleted.length !== names.length) {
    console.error("retention-storage-api-count-mismatch");
    process.exit(25);
  }
  const returnedNames = deleted.map((item) => item && item.name);
  const returnedNameSet = new Set(returnedNames);
  if (returnedNames.some((name) => typeof name !== "string") ||
      returnedNameSet.size !== names.length ||
      names.some((name) => !returnedNameSet.has(name))) {
    console.error("retention-storage-api-response-mismatch");
    process.exit(26);
  }
  process.stdout.write(String(deleted.length));
} catch {
  console.error("retention-storage-api-request-failed");
  process.exit(27);
} finally {
  clearTimeout(timeout);
}
})().catch(() => {
  console.error("retention-storage-api-program-failed");
  process.exit(28);
});'

started_epoch="$(date +%s)"
deleted_total=0
batch_number=0

while (( deleted_total < RETENTION_MAX_OBJECTS_PER_RUN )); do
  elapsed_seconds=$(( $(date +%s) - started_epoch ))
  if (( elapsed_seconds >= RETENTION_MAX_RUNTIME_SECONDS )); then
    warn 'limite de tempo da retencao atingido; backlog agregado sera monitorado'
    break
  fi

  remaining_capacity=$((RETENTION_MAX_OBJECTS_PER_RUN - deleted_total))
  current_batch_size="$RETENTION_BATCH_SIZE"
  (( current_batch_size <= remaining_capacity )) || current_batch_size="$remaining_capacity"

  candidate_json="$(docker exec -i "$db_container_id" psql -XAtq -U postgres -d postgres -v ON_ERROR_STOP=1 <<SQL
BEGIN TRANSACTION READ ONLY;
SELECT COALESCE(jsonb_agg(candidate.name ORDER BY candidate.effective_at, candidate.name), '[]'::jsonb)::text
FROM (
  SELECT name, COALESCE(updated_at, created_at) AS effective_at
  FROM storage.objects
  WHERE bucket_id = 'chat-media'
    AND COALESCE(updated_at, created_at) < clock_timestamp() - interval '${RETENTION_DAYS} days'
  ORDER BY COALESCE(updated_at, created_at), name
  LIMIT $current_batch_size
) AS candidate;
COMMIT;
SQL
)" || die 'selecao SQL read-only de candidatos falhou'

  if ! candidate_count="$(jq -er '
      if type == "array"
         and length <= 1000
         and all(.[]; type == "string" and length > 0)
         and length == (unique | length)
      then length
      else error("invalid candidate set")
      end
    ' <<<"$candidate_json" 2>/dev/null)"; then
    die 'selecao SQL retornou conjunto de candidatos invalido'
  fi
  [[ "$candidate_count" =~ ^[0-9]+$ ]] || die 'contagem de candidatos invalida'
  (( candidate_count <= current_batch_size && candidate_count <= 1000 )) \
    || die 'selecao SQL excedeu o lote aprovado'
  (( candidate_count > 0 )) || break

  api_result="$(
    printf '%s' "$candidate_json" |
      RETENTION_SERVICE_KEY="$retention_service_key" \
      RETENTION_API_TIMEOUT_MS="$((RETENTION_API_TIMEOUT_SECONDS * 1000))" \
      docker exec -i \
        --env RETENTION_SERVICE_KEY \
        --env RETENTION_API_TIMEOUT_MS \
        "$storage_container_id" \
        node -e "$api_delete_program"
  )" || die 'Storage API recusou o lote; nenhum path foi registrado no log'

  [[ "$api_result" =~ ^[0-9]+$ && "$api_result" == "$candidate_count" ]] \
    || die 'Storage API nao confirmou exatamente o lote solicitado'

  deleted_total=$((deleted_total + candidate_count))
  batch_number=$((batch_number + 1))
  log "Retencao chat-media: lote=$batch_number removidos=$candidate_count total=$deleted_total"
  unset candidate_json api_result

  (( candidate_count == current_batch_size )) || break
done

backlog_state="$(docker exec "$db_container_id" psql -XAt -F '|' -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "BEGIN TRANSACTION READ ONLY; SELECT count(*)::bigint, COALESCE(extract(epoch FROM clock_timestamp() - min(COALESCE(updated_at, created_at)))::bigint, 0) FROM storage.objects WHERE bucket_id = 'chat-media' AND COALESCE(updated_at, created_at) < clock_timestamp() - interval '${RETENTION_DAYS} days'; COMMIT;" 2>/dev/null)" \
  || die 'nao foi possivel medir o backlog final da retencao'
# psql pode emitir tags BEGIN/COMMIT sem -q; mantenha apenas a linha agregada.
backlog_state="$(awk -F '|' 'NF == 2 && $1 ~ /^[0-9]+$/ && $2 ~ /^[0-9]+$/ { print; exit }' <<<"$backlog_state")"
IFS='|' read -r eligible_remaining oldest_eligible_age_seconds <<<"$backlog_state"
[[ "$eligible_remaining" =~ ^[0-9]+$ && "$oldest_eligible_age_seconds" =~ ^[0-9]+$ ]] \
  || die 'metricas finais de backlog invalidas'

last_success_marker="$BACKUP_DIR/retention/chat-media.last-success"
temp_marker="$(mktemp "${last_success_marker}.XXXXXX")"
printf '%s\n' \
  'status=success' \
  "completed_at_utc=$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  "restore_manifest_sha256=$restore_manifest_sha256" \
  "retention_days=$RETENTION_DAYS" \
  "batch_size=$RETENTION_BATCH_SIZE" \
  "max_objects_per_run=$RETENTION_MAX_OBJECTS_PER_RUN" \
  "deleted_objects=$deleted_total" \
  "eligible_remaining=$eligible_remaining" \
  "oldest_eligible_age_seconds=$oldest_eligible_age_seconds" \
  >"$temp_marker"
chmod 0600 "$temp_marker"
mv -f -- "$temp_marker" "$last_success_marker"

if (( eligible_remaining > 0 )); then
  warn "Retencao chat-media concluiu com backlog agregado: restantes=$eligible_remaining"
else
  log "Retencao chat-media concluida: removidos=$deleted_total backlog=0"
fi
