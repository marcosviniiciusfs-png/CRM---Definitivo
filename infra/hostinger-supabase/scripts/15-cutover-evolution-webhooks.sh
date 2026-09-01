#!/usr/bin/env bash

# Inventory, switch, or roll back Evolution webhooks for CRM instances.
# Provider secrets and webhook headers are written only to root-owned 0600 files.
# shellcheck shell=bash

set -Eeuo pipefail
set +x
IFS=$'\n\t'
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

usage() {
  cat >&2 <<'USAGE'
Uso:
  15-cutover-evolution-webhooks.sh dry-run
  CONFIRM_EVOLUTION_WEBHOOK_CUTOVER=YES_POINT_CRM_EVOLUTION_TO_VPS \
    15-cutover-evolution-webhooks.sh apply
  CONFIRM_EVOLUTION_WEBHOOK_ROLLBACK=YES_RESTORE_PREVIOUS_EVOLUTION_WEBHOOKS \
    15-cutover-evolution-webhooks.sh rollback /caminho/absoluto/do/snapshot
USAGE
  exit 2
}

[[ $# -ge 1 ]] || usage
mode="$1"
shift
case "$mode" in
  dry-run|apply)
    [[ $# -eq 0 ]] || usage
    ;;
  rollback)
    [[ $# -eq 1 ]] || usage
    requested_snapshot="$1"
    ;;
  *) usage ;;
esac

require_root
load_versions
require_command curl cut docker flock jq mktemp realpath sha256sum sort uniq wc

functions_env_file="$INSTALL_DIR/functions.env"
migration_env_file="${MIGRATION_ENV_FILE:-/etc/crm-supabase/migration.env}"
require_secret_file "$INSTALL_DIR/.env"
load_env_file "$migration_env_file"
load_env_file "$functions_env_file"

evolution_api_url="${EVOLUTION_API_URL%/}"
evolution_api_key="$EVOLUTION_API_KEY"
evolution_webhook_secret="$EVOLUTION_WEBHOOK_SECRET"
target_public_url="${NEW_SUPABASE_PUBLIC_URL%/}"
target_anon_key="$(env_file_value "$INSTALL_DIR/.env" ANON_KEY)"

for loaded_env_file in "$migration_env_file" "$functions_env_file"; do
  while IFS='=' read -r env_key _; do
    if [[ "$env_key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      export -n "${env_key?}" 2>/dev/null || true
    fi
  done <"$loaded_env_file"
done
unset EVOLUTION_API_URL EVOLUTION_API_KEY EVOLUTION_WEBHOOK_SECRET NEW_SUPABASE_PUBLIC_URL

[[ "$evolution_api_url" =~ ^https?://[A-Za-z0-9._:-]+$ ]] \
  || die 'EVOLUTION_API_URL deve ser uma URL-base http(s), sem /manager nem caminho adicional'
[[ ${#evolution_api_key} -ge 16 && "$evolution_api_key" != *[[:space:]]* ]] \
  || die 'EVOLUTION_API_KEY ausente ou invalida'
[[ ${#evolution_webhook_secret} -ge 16 && "$evolution_webhook_secret" != *[[:space:]]* ]] \
  || die 'EVOLUTION_WEBHOOK_SECRET ausente ou invalido'
[[ "$target_public_url" =~ ^https://[A-Za-z0-9.-]+$ ]] \
  || die 'NEW_SUPABASE_PUBLIC_URL deve ser uma origem HTTPS sem caminho'
[[ ${#target_anon_key} -ge 20 && "$target_anon_key" != *[[:space:]]* ]] \
  || die 'ANON_KEY do destino ausente ou invalida'
target_webhook_url="$target_public_url/functions/v1/whatsapp-message-webhook"

if [[ "$evolution_api_url" == http://* ]]; then
  warn 'Evolution usa HTTP sem TLS; a credencial administrativa trafega sem criptografia'
fi

snapshot_root="$BACKUP_DIR/evolution-webhooks"
install -d -m 0700 "$snapshot_root"
exec 9>"$INSTALL_DIR/.evolution-webhook-cutover.lock"
flock -n 9 || die 'outra operacao de webhook Evolution esta em execucao'

runtime_dir="$(mktemp -d /run/crm-evolution-cutover.XXXXXX)"
[[ "$runtime_dir" =~ ^/run/crm-evolution-cutover\.[A-Za-z0-9]+$ ]] \
  || die 'mktemp retornou runtime inesperado'
apply_started=false
apply_complete=false
cleanup_runtime() {
  local status=$?
  local rollback_status=0

  # `die` exits directly and therefore does not reliably trigger Bash's ERR
  # trap. Perform the compensating action from EXIT so every failed apply,
  # including an explicit validation failure, restores the captured snapshot.
  if (( status != 0 )) \
     && [[ "${apply_started:-false}" == true \
        && "${apply_complete:-false}" != true \
        && -n "${snapshot:-}" ]]; then
    warn 'Corte Evolution incompleto; tentando restaurar automaticamente todos os webhooks anteriores'
    set +e
    rollback_snapshot "$snapshot"
    rollback_status=$?
    set -e
    if (( rollback_status != 0 )); then
      warn 'ROLLBACK EVOLUTION INCOMPLETO; mantenha a aplicacao em manutencao'
    fi
  fi

  unset evolution_api_key evolution_webhook_secret
  unset CRM_EVOLUTION_WEBHOOK_SECRET
  if [[ -n "${runtime_dir:-}" \
     && "$runtime_dir" =~ ^/run/crm-evolution-cutover\.[A-Za-z0-9]+$ \
     && -d "$runtime_dir" ]]; then
    rm -rf -- "$runtime_dir"
  fi
  trap - EXIT
  exit "$status"
}
trap cleanup_runtime EXIT

printf 'apikey: %s\ncontent-type: application/json\n' "$evolution_api_key" \
  >"$runtime_dir/provider-headers"
chmod 0600 "$runtime_dir/provider-headers"
printf 'apikey: %s\n' "$target_anon_key" >"$runtime_dir/target-headers"
chmod 0600 "$runtime_dir/target-headers"
unset target_anon_key

provider_request() {
  local method="$1"
  local path="$2"
  local output_file="$3"
  local payload_file="${4:-}"
  local -a curl_args=(
    --silent --show-error
    --connect-timeout 5 --max-time 20
    --request "$method"
    --header "@$runtime_dir/provider-headers"
    --output "$output_file"
    --write-out '%{http_code}'
    "$evolution_api_url$path"
  )
  if [[ -n "$payload_file" ]]; then
    curl_args+=(--data-binary "@$payload_file")
  fi
  curl "${curl_args[@]}"
}

encode_instance_name() {
  jq -nr --arg value "$1" '$value|@uri'
}

verify_snapshot() {
  local snapshot="$1"
  [[ "$snapshot" == "$snapshot_root"/* ]] \
    || die 'snapshot de webhook esta fora do diretorio aprovado'
  [[ ! -L "$snapshot" && -d "$snapshot" ]] \
    || die 'snapshot de webhook precisa ser um diretorio regular'
  for snapshot_file in METADATA webhooks.ndjson SHA256SUMS; do
    [[ ! -L "$snapshot/$snapshot_file" ]] \
      || die "arquivo symlink recusado no snapshot: $snapshot_file"
  done
  require_secret_file "$snapshot/METADATA"
  require_secret_file "$snapshot/webhooks.ndjson"
  require_secret_file "$snapshot/SHA256SUMS"
  (
    cd "$snapshot"
    sha256sum --quiet -c SHA256SUMS
  ) || die 'checksum do snapshot de webhooks divergiu'
  [[ "$(env_file_value "$snapshot/METADATA" status)" == 'captured' ]] \
    || die 'snapshot de webhooks nao esta completo'
}

rollback_snapshot() {
  local snapshot="$1"
  local row_file="$runtime_dir/rollback-row.json"
  local payload_file="$runtime_dir/rollback-payload.json"
  local response_file="$runtime_dir/rollback-response.json"
  local row instance_name encoded_name http_code rollback_failures=0 restored=0

  verify_snapshot "$snapshot"
  while IFS= read -r row; do
    printf '%s\n' "$row" >"$row_file"
    chmod 0600 "$row_file"
    instance_name="$(jq -er '.meta.name' "$row_file")" || {
      rollback_failures=$((rollback_failures + 1))
      continue
    }
    jq -e '
      .http_code == "200"
      and (.response.url | type == "string")
      and (.response.events | type == "array")
      and (.response.headers | type == "object")
    ' "$row_file" >/dev/null || {
      rollback_failures=$((rollback_failures + 1))
      continue
    }
    jq '{webhook:{
      enabled:.response.enabled,
      url:.response.url,
      webhook_by_events:.response.webhookByEvents,
      webhook_base64:.response.webhookBase64,
      events:.response.events,
      headers:.response.headers
    }}' "$row_file" >"$payload_file"
    chmod 0600 "$payload_file"
    encoded_name="$(encode_instance_name "$instance_name")"
    http_code="$(provider_request POST "/webhook/set/$encoded_name" "$response_file" "$payload_file" || true)"
    if [[ "$http_code" =~ ^2[0-9][0-9]$ ]]; then
      restored=$((restored + 1))
    else
      rollback_failures=$((rollback_failures + 1))
    fi
  done <"$snapshot/webhooks.ndjson"

  log "Rollback Evolution: restaurados=$restored falhas=$rollback_failures"
  (( rollback_failures == 0 )) || return 1
}

if [[ "$mode" == 'rollback' ]]; then
  [[ "${CONFIRM_EVOLUTION_WEBHOOK_ROLLBACK:-}" == 'YES_RESTORE_PREVIOUS_EVOLUTION_WEBHOOKS' ]] \
    || die 'rollback exige CONFIRM_EVOLUTION_WEBHOOK_ROLLBACK=YES_RESTORE_PREVIOUS_EVOLUTION_WEBHOOKS'
  snapshot="$(realpath -e -- "$requested_snapshot")"
  rollback_snapshot "$snapshot" \
    || die 'rollback de um ou mais webhooks falhou; mantenha a aplicacao em manutencao'
  log 'Webhooks Evolution anteriores foram restaurados'
  exit 0
fi

timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
snapshot="$snapshot_root/${timestamp}-${mode}"
[[ ! -e "$snapshot" ]] || die "snapshot ja existe: $snapshot"
install -d -m 0700 "$snapshot"

instances_http_code="$(provider_request GET '/instance/fetchInstances' "$runtime_dir/provider-instances-raw.json" || true)"
[[ "$instances_http_code" == '200' ]] \
  || die "Evolution recusou o inventario de instancias (HTTP $instances_http_code)"
jq -e 'type == "array" and length > 0' "$runtime_dir/provider-instances-raw.json" >/dev/null \
  || die 'inventario de instancias Evolution nao e um array nao vazio'
jq '[.[] | {name,connectionStatus,integration}]' \
  "$runtime_dir/provider-instances-raw.json" >"$snapshot/provider-instances.json"
chmod 0600 "$snapshot/provider-instances.json"
rm -f -- "$runtime_dir/provider-instances-raw.json"
provider_duplicate_names="$(jq '[group_by(.name)[] | select(length > 1)] | length' "$snapshot/provider-instances.json")"
[[ "$provider_duplicate_names" == '0' ]] || die 'Evolution retornou nomes de instancia duplicados'

compose up -d db
wait_for_container_health supabase-db 240
docker exec supabase-db psql -XAt -F $'\t' -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT coalesce(status, ''), instance_name FROM public.whatsapp_instances WHERE instance_name IS NOT NULL AND btrim(instance_name) <> '' ORDER BY instance_name;" \
  >"$snapshot/db-instances.tsv"
chmod 0600 "$snapshot/db-instances.tsv"
[[ -s "$snapshot/db-instances.tsv" ]] || die 'o banco do CRM nao possui instancias WhatsApp'
db_duplicate_names="$(cut -f2 "$snapshot/db-instances.tsv" | sort | uniq -d | wc -l)"
[[ "$db_duplicate_names" == '0' ]] || die 'o banco do CRM possui nomes de instancia duplicados'

jq -Rn '[inputs | split("\t") | {db_status:.[0],name:.[1]}]' \
  <"$snapshot/db-instances.tsv" >"$runtime_dir/db-instances.json"
jq --slurpfile db "$runtime_dir/db-instances.json" '
  [ $db[0][] as $db_instance
    | .[]
    | select(.name == $db_instance.name)
    | {name,status:.connectionStatus,db_status:$db_instance.db_status}
  ]
' "$snapshot/provider-instances.json" >"$snapshot/matched-instances.json"
chmod 0600 "$snapshot/matched-instances.json"

db_count="$(jq 'length' "$runtime_dir/db-instances.json")"
matched_count="$(jq 'length' "$snapshot/matched-instances.json")"
missing_count=$((db_count - matched_count))
(( matched_count > 0 && matched_count <= db_count )) \
  || die 'nenhuma instancia do banco corresponde ao provedor Evolution'

: >"$snapshot/webhooks.ndjson"
chmod 0600 "$snapshot/webhooks.ndjson"
while IFS= read -r row; do
  instance_name="$(jq -er '.name' <<<"$row")"
  encoded_name="$(encode_instance_name "$instance_name")"
  response_file="$(mktemp "$runtime_dir/webhook.XXXXXX")"
  http_code="$(provider_request GET "/webhook/find/$encoded_name" "$response_file" || true)"
  if [[ "$http_code" == '200' ]] && jq -e 'type == "object"' "$response_file" >/dev/null 2>&1; then
    jq -nc --argjson meta "$row" --slurpfile response "$response_file" --arg code "$http_code" \
      '{meta:$meta,http_code:$code,response:$response[0]}' >>"$snapshot/webhooks.ndjson"
  else
    jq -nc --argjson meta "$row" --arg code "$http_code" \
      '{meta:$meta,http_code:$code,response:null}' >>"$snapshot/webhooks.ndjson"
  fi
  rm -f -- "$response_file"
done < <(jq -c '.[]' "$snapshot/matched-instances.json")

captured_count="$(wc -l <"$snapshot/webhooks.ndjson")"
valid_webhook_count="$(jq -rs '[.[] | select(
  .http_code == "200"
  and (.response.url | type == "string")
  and (.response.events | type == "array")
  and (.response.headers | type == "object")
)] | length' "$snapshot/webhooks.ndjson")"
[[ "$captured_count" == "$matched_count" && "$valid_webhook_count" == "$matched_count" ]] \
  || die 'nao foi possivel capturar a configuracao anterior de todos os webhooks correspondentes'

printf '%s\n' \
  'status=captured' \
  "captured_at_utc=$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  "mode=$mode" \
  "database_instances=$db_count" \
  "provider_instances=$(jq 'length' "$snapshot/provider-instances.json")" \
  "matched_instances=$matched_count" \
  "missing_provider_instances=$missing_count" \
  "target_webhook_url=$target_webhook_url" \
  >"$snapshot/METADATA"
chmod 0600 "$snapshot/METADATA"
(
  cd "$snapshot"
  sha256sum METADATA db-instances.tsv matched-instances.json provider-instances.json webhooks.ndjson \
    >SHA256SUMS
  chmod 0600 SHA256SUMS
)

source_url_count="$(jq -rs '[.[] | select((.response.url // "") | startswith("https://uxttihjsxfowursjyult.supabase.co/"))] | length' "$snapshot/webhooks.ndjson")"
log "Evolution inventariada: banco=$db_count correspondentes=$matched_count ausentes_no_provedor=$missing_count ainda_na_origem=$source_url_count"
log "Snapshot protegido para rollback: $snapshot"

if [[ "$mode" == 'dry-run' ]]; then
  log 'Dry-run concluido; nenhum webhook foi alterado'
  exit 0
fi

[[ "${CONFIRM_EVOLUTION_WEBHOOK_CUTOVER:-}" == 'YES_POINT_CRM_EVOLUTION_TO_VPS' ]] \
  || die 'apply exige CONFIRM_EVOLUTION_WEBHOOK_CUTOVER=YES_POINT_CRM_EVOLUTION_TO_VPS'

for required_service in api-gw functions; do
  container_id="$(compose ps -a -q "$required_service")"
  [[ -n "$container_id" ]] || die "servico ausente antes do corte Evolution: $required_service"
  container_state="$(docker inspect --format '{{.State.Status}}' "$container_id")"
  container_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id")"
  [[ "$container_state" == 'running' && "$container_health" == 'healthy' ]] \
    || die "servico nao esta saudavel antes do corte Evolution: $required_service"
done
curl --silent --show-error --fail --connect-timeout 5 --max-time 15 \
  --header "@$runtime_dir/target-headers" \
  --output /dev/null "$target_public_url/auth/v1/health" \
  || die 'a API HTTPS nova nao esta acessivel; webhooks nao serao alterados'

export CRM_EVOLUTION_WEBHOOK_SECRET="$evolution_webhook_secret"
jq -n --arg url "$target_webhook_url" '{webhook:{
  enabled:true,
  url:$url,
  webhook_by_events:false,
  webhook_base64:false,
  events:["QRCODE_UPDATED","CONNECTION_UPDATE","MESSAGES_UPSERT","MESSAGES_UPDATE","SEND_MESSAGE"],
  headers:{"x-api-key":env.CRM_EVOLUTION_WEBHOOK_SECRET}
}}' >"$runtime_dir/target-webhook.json"
chmod 0600 "$runtime_dir/target-webhook.json"

apply_started=true

applied=0
while IFS= read -r row; do
  instance_name="$(jq -er '.name' <<<"$row")"
  encoded_name="$(encode_instance_name "$instance_name")"
  response_file="$runtime_dir/apply-response.json"
  http_code="$(provider_request POST "/webhook/set/$encoded_name" "$response_file" "$runtime_dir/target-webhook.json" || true)"
  [[ "$http_code" =~ ^2[0-9][0-9]$ ]] || die "Evolution recusou a configuracao de uma instancia (HTTP $http_code)"

  verify_file="$runtime_dir/verify-response.json"
  verify_code="$(provider_request GET "/webhook/find/$encoded_name" "$verify_file" || true)"
  [[ "$verify_code" == '200' ]] || die "Evolution nao confirmou uma instancia (HTTP $verify_code)"
  jq -e --arg url "$target_webhook_url" '
    .enabled == true
    and .url == $url
    and .webhookByEvents == false
    and .webhookBase64 == false
    and .headers["x-api-key"] == env.CRM_EVOLUTION_WEBHOOK_SECRET
    and ((.events | sort) == (["QRCODE_UPDATED","CONNECTION_UPDATE","MESSAGES_UPSERT","MESSAGES_UPDATE","SEND_MESSAGE"] | sort))
  ' "$verify_file" >/dev/null || die 'Evolution devolveu configuracao divergente apos o apply'
  applied=$((applied + 1))
done < <(jq -c '.[]' "$snapshot/matched-instances.json")

[[ "$applied" == "$matched_count" ]] || die 'nem todas as instancias correspondentes foram atualizadas'
unset CRM_EVOLUTION_WEBHOOK_SECRET

printf '%s\n' \
  'status=applied' \
  "applied_at_utc=$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  "matched_instances=$matched_count" \
  "target_webhook_url=$target_webhook_url" \
  >"$snapshot/APPLIED"
chmod 0600 "$snapshot/APPLIED"
(
  cd "$snapshot"
  sha256sum APPLIED >>SHA256SUMS
)

apply_complete=true

log "Evolution apontada para a VPS e verificada em $applied instancias; snapshot de rollback: $snapshot"
