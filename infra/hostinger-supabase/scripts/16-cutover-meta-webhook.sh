#!/usr/bin/env bash

# Inventory, switch, or roll back the Meta App page/leadgen webhook callback.
# Secrets are consumed only from the protected Functions env and runtime files.
# shellcheck shell=bash

set -Eeuo pipefail
set +x
IFS=$'\n\t'
umask 077
ulimit -c 0 || exit 1

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

usage() {
  cat >&2 <<'USAGE'
Uso:
  16-cutover-meta-webhook.sh preflight
  16-cutover-meta-webhook.sh dry-run
  CONFIRM_META_WEBHOOK_CUTOVER=YES_POINT_CRM_META_TO_VPS \
    16-cutover-meta-webhook.sh apply
  CONFIRM_META_WEBHOOK_ROLLBACK=YES_RESTORE_PREVIOUS_META_WEBHOOK \
    16-cutover-meta-webhook.sh rollback /caminho/absoluto/do/snapshot
USAGE
  exit 2
}

[[ $# -ge 1 ]] || usage
mode="$1"
shift
case "$mode" in
  preflight|dry-run|apply)
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
require_command curl docker flock jq mktemp realpath sha256sum stat

functions_env_file="$INSTALL_DIR/functions.env"
require_secret_file "$functions_env_file"
load_env_file "$functions_env_file"

facebook_app_id="${FACEBOOK_APP_ID:-}"
facebook_app_secret="${FACEBOOK_APP_SECRET:-}"
facebook_verify_token="${FACEBOOK_WEBHOOK_VERIFY_TOKEN:-}"
target_callback='https://api.kairozcrm.com.br/functions/v1/facebook-leads-webhook'
source_callback='https://uxttihjsxfowursjyult.supabase.co/functions/v1/facebook-leads-webhook'

while IFS='=' read -r env_key _; do
  if [[ "$env_key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    export -n "$env_key" 2>/dev/null || true
  fi
done <"$functions_env_file"
unset FACEBOOK_APP_ID FACEBOOK_APP_SECRET FACEBOOK_WEBHOOK_VERIFY_TOKEN

[[ "$facebook_app_id" =~ ^[0-9]{5,32}$ ]] \
  || die 'FACEBOOK_APP_ID ausente ou fora do formato esperado'
[[ ${#facebook_app_secret} -ge 16 \
   && "$facebook_app_secret" =~ ^[A-Za-z0-9._~-]+$ ]] \
  || die 'FACEBOOK_APP_SECRET ausente ou fora do formato seguro esperado'
[[ "$facebook_verify_token" =~ ^[0-9a-f]{64}$ ]] \
  || die 'FACEBOOK_WEBHOOK_VERIFY_TOKEN ausente ou fora do formato seguro esperado'

runtime_dir="$(mktemp -d /run/crm-meta-cutover.XXXXXX)"
[[ "$runtime_dir" =~ ^/run/crm-meta-cutover\.[A-Za-z0-9]+$ ]] \
  || die 'mktemp retornou runtime inesperado'
graph_headers="$runtime_dir/graph-headers"
app_access_token="${facebook_app_id}|${facebook_app_secret}"
printf 'header = "Authorization: Bearer %s"\n' "$app_access_token" >"$graph_headers"
chmod 0600 "$graph_headers"

snapshot_root="$BACKUP_DIR/meta-webhook"
if [[ "$mode" != 'preflight' ]]; then
  install -d -m 0700 "$snapshot_root"
  exec 9>"$INSTALL_DIR/.meta-webhook-cutover.lock"
  flock -n 9 || die 'outra operacao do webhook Meta esta em execucao'
fi

apply_started=false
apply_complete=false
snapshot=''

graph_request() {
  local method="$1"
  local output_file="$2"
  local body_file="${3:-}"
  local -a args=(
    --disable
    --silent --show-error
    --connect-timeout 8 --max-time 30
    --proto '=https' --proto-redir '=https'
    --request "$method"
    --config "$graph_headers"
    --header 'content-type: application/x-www-form-urlencoded'
    --output "$output_file"
    --write-out '%{http_code}'
  )
  if [[ -n "$body_file" ]]; then
    args+=(--data-binary "@$body_file")
  fi
  args+=("https://graph.facebook.com/$facebook_app_id/subscriptions")
  curl "${args[@]}"
}

callback_challenge() {
  local callback="$1"
  local output_file="$2"
  local challenge encoded_token curl_config status

  [[ "$callback" == "$source_callback" || "$callback" == "$target_callback" ]] \
    || die 'callback Meta fora das origens/caminhos aprovados'
  challenge="$(date -u +'%Y%m%d%H%M%S')$RANDOM"
  encoded_token="$(jq -nr --arg value "$facebook_verify_token" '$value|@uri')"
  curl_config="$runtime_dir/challenge.curl"
  printf '%s\n' \
    'silent' \
    'show-error' \
    'connect-timeout = 8' \
    'max-time = 20' \
    'proto = "=https"' \
    'proto-redir = "=https"' \
    "url = \"${callback}?hub.mode=subscribe&hub.verify_token=${encoded_token}&hub.challenge=${challenge}\"" \
    >"$curl_config"
  chmod 0600 "$curl_config"
  status="$(curl --disable --config "$curl_config" --output "$output_file" --write-out '%{http_code}' \
    2>"$runtime_dir/challenge.stderr" || true)"
  rm -f -- "$curl_config"
  [[ "$status" == '200' && "$(cat "$output_file")" == "$challenge" ]]
}

validate_page_subscription() {
  local response_file="$1"
  local expected_callback="$2"
  jq -e --arg callback "$expected_callback" '
    (.data | type == "array")
    and ([.data[] | select(.object == "page")] | length == 1)
    and ([.data[] | select(.object == "page")][0] as $page
      | $page.active == true
      and $page.callback_url == $callback
      and ($page.fields | type == "array")
      and ([$page.fields[] | if type == "object" then .name else . end] | index("leadgen") != null))
  ' "$response_file" >/dev/null
}

build_subscription_body() {
  local callback="$1"
  local response_file="$2"
  local body_file="$3"
  local fields

  fields="$(jq -er '
    [.data[] | select(.object == "page")][0].fields
    | map(if type == "object" then .name else . end)
    | map(select(type == "string" and length > 0))
    | unique
    | join(",")
  ' "$response_file")"
  [[ ",$fields," == *',leadgen,'* ]] || die 'subscription page nao contem leadgen'
  jq -nr \
    --arg callback "$callback" \
    --arg fields "$fields" \
    --arg token "$facebook_verify_token" \
    '"object=page&callback_url=\($callback|@uri)&fields=\($fields|@uri)&verify_token=\($token|@uri)"' \
    >"$body_file"
  chmod 0600 "$body_file"
}

verify_snapshot() {
  local candidate="$1"
  [[ "$candidate" == "$snapshot_root"/* && ! -L "$candidate" && -d "$candidate" ]] \
    || die 'snapshot Meta fora do diretorio aprovado'
  for file in METADATA subscription.json SHA256SUMS; do
    [[ ! -L "$candidate/$file" ]]
    require_secret_file "$candidate/$file"
  done
  (cd "$candidate" && sha256sum --quiet -c SHA256SUMS) \
    || die 'checksum do snapshot Meta divergiu'
  [[ "$(env_file_value "$candidate/METADATA" status)" == 'captured' ]] \
    || die 'snapshot Meta nao esta completo'
  validate_page_subscription "$candidate/subscription.json" "$source_callback" \
    || die 'snapshot Meta nao representa o callback blue aprovado'
}

restore_snapshot() {
  local candidate="$1"
  local body="$runtime_dir/rollback.body"
  local response="$runtime_dir/rollback.response"
  local verify="$runtime_dir/rollback.verify"
  local challenge_response="$runtime_dir/rollback.challenge"
  local status verify_status

  verify_snapshot "$candidate"
  callback_challenge "$source_callback" "$challenge_response" \
    || die 'token configurado nao valida o callback blue; rollback Meta recusado'
  build_subscription_body "$source_callback" "$candidate/subscription.json" "$body"
  status="$(graph_request POST "$response" "$body" || true)"
  [[ "$status" == '200' && "$(jq -r '.success // false' "$response")" == 'true' ]] \
    || return 1
  verify_status="$(graph_request GET "$verify" || true)"
  [[ "$verify_status" == '200' ]] || return 1
  validate_page_subscription "$verify" "$source_callback"
}

cleanup_runtime() {
  local status=$?
  local rollback_status=0
  if (( status != 0 )) \
     && [[ "$apply_started" == true && "$apply_complete" != true && -n "$snapshot" ]]; then
    warn 'Corte Meta incompleto; tentando restaurar automaticamente o callback blue'
    set +e
    restore_snapshot "$snapshot"
    rollback_status=$?
    set -e
    if (( rollback_status != 0 )); then
      warn 'ROLLBACK META INCOMPLETO; mantenha a aplicacao em manutencao'
    fi
  fi
  unset app_access_token facebook_app_secret facebook_verify_token
  if [[ -n "${runtime_dir:-}" \
     && "$runtime_dir" =~ ^/run/crm-meta-cutover\.[A-Za-z0-9]+$ \
     && -d "$runtime_dir" ]]; then
    rm -rf -- "$runtime_dir"
  fi
  trap - EXIT
  exit "$status"
}
trap cleanup_runtime EXIT

if [[ "$mode" == 'rollback' ]]; then
  [[ "${CONFIRM_META_WEBHOOK_ROLLBACK:-}" == 'YES_RESTORE_PREVIOUS_META_WEBHOOK' ]] \
    || die 'rollback exige CONFIRM_META_WEBHOOK_ROLLBACK=YES_RESTORE_PREVIOUS_META_WEBHOOK'
  snapshot="$(realpath -e -- "$requested_snapshot")"
  restore_snapshot "$snapshot" \
    || die 'rollback do callback Meta falhou; mantenha a aplicacao em manutencao'
  log 'Callback Meta blue restaurado e verificado'
  exit 0
fi

if [[ "$mode" == 'preflight' ]]; then
  http_code="$(graph_request GET "$runtime_dir/subscription.json" || true)"
  [[ "$http_code" == '200' ]] || die "Meta recusou o inventario preflight do App (HTTP $http_code)"
  validate_page_subscription "$runtime_dir/subscription.json" "$source_callback" \
    || die 'subscription page/leadgen atual nao aponta exatamente para o Supabase blue esperado'
  callback_challenge "$source_callback" "$runtime_dir/source.challenge" \
    || die 'FACEBOOK_WEBHOOK_VERIFY_TOKEN nao e o token historico do callback blue'
  log 'Preflight Meta PASS: App, callback blue, leadgen e token historico validados; nada foi alterado'
  exit 0
fi

timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
snapshot="$snapshot_root/${timestamp}-${mode}"
[[ ! -e "$snapshot" ]] || die "snapshot ja existe: $snapshot"
install -d -m 0700 "$snapshot"

http_code="$(graph_request GET "$snapshot/subscription.json" || true)"
chmod 0600 "$snapshot/subscription.json"
[[ "$http_code" == '200' ]] || die "Meta recusou inventario do App (HTTP $http_code)"
validate_page_subscription "$snapshot/subscription.json" "$source_callback" \
  || die 'subscription page/leadgen atual nao aponta exatamente para o Supabase blue esperado'
callback_challenge "$source_callback" "$runtime_dir/source.challenge" \
  || die 'FACEBOOK_WEBHOOK_VERIFY_TOKEN nao e o token historico do callback blue'

field_names="$(jq -er '[.data[] | select(.object == "page")][0].fields | map(if type == "object" then .name else . end) | sort | join(",")' "$snapshot/subscription.json")"
printf '%s\n' \
  'status=captured' \
  "captured_at_utc=$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  "mode=$mode" \
  "app_id=$facebook_app_id" \
  'object=page' \
  "fields=$field_names" \
  "source_callback=$source_callback" \
  "target_callback=$target_callback" \
  'historical_verify_token_validated=true' \
  >"$snapshot/METADATA"
chmod 0600 "$snapshot/METADATA"
(cd "$snapshot" && sha256sum METADATA subscription.json >SHA256SUMS)
chmod 0600 "$snapshot/SHA256SUMS"
log "Meta inventariada; snapshot protegido para rollback: $snapshot"

if [[ "$mode" == 'dry-run' ]]; then
  log 'Dry-run Meta concluido; nenhum callback foi alterado'
  exit 0
fi

[[ "${CONFIRM_META_WEBHOOK_CUTOVER:-}" == 'YES_POINT_CRM_META_TO_VPS' ]] \
  || die 'apply exige CONFIRM_META_WEBHOOK_CUTOVER=YES_POINT_CRM_META_TO_VPS'
for required_service in api-gw functions; do
  container_id="$(compose ps -a -q "$required_service")"
  [[ -n "$container_id" ]] || die "servico ausente antes do corte Meta: $required_service"
  state="$(docker inspect --format '{{.State.Status}}' "$container_id")"
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id")"
  [[ "$state" == 'running' && "$health" == 'healthy' ]] \
    || die "servico nao esta saudavel antes do corte Meta: $required_service"
done
callback_challenge "$target_callback" "$runtime_dir/target.challenge" \
  || die 'callback Meta da VPS nao respondeu ao challenge com o token configurado'

build_subscription_body "$target_callback" "$snapshot/subscription.json" "$runtime_dir/apply.body"
apply_started=true
apply_code="$(graph_request POST "$runtime_dir/apply.response" "$runtime_dir/apply.body" || true)"
[[ "$apply_code" == '200' && "$(jq -r '.success // false' "$runtime_dir/apply.response")" == 'true' ]] \
  || die "Meta recusou a troca do callback (HTTP $apply_code)"
verify_code="$(graph_request GET "$runtime_dir/apply.verify" || true)"
[[ "$verify_code" == '200' ]] || die "Meta nao confirmou a troca (HTTP $verify_code)"
validate_page_subscription "$runtime_dir/apply.verify" "$target_callback" \
  || die 'Meta devolveu callback/fields divergentes apos o apply'

printf '%s\n' \
  'status=applied' \
  "applied_at_utc=$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  "target_callback=$target_callback" \
  >"$snapshot/APPLIED"
chmod 0600 "$snapshot/APPLIED"
(cd "$snapshot" && sha256sum APPLIED >>SHA256SUMS)
apply_complete=true
log "Callback Meta page/leadgen apontado para a VPS; snapshot de rollback: $snapshot"
