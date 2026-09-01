#!/usr/bin/env bash

# Synchronize repository Edge Functions and install the custom main runtime.
# shellcheck shell=bash

set -Eeuo pipefail
IFS=$'\n\t'
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

require_root
load_versions
require_command docker find flock mktemp realpath rsync wc

START_INFRASTRUCTURE=false
START_FUNCTIONS=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --start-infrastructure)
      START_INFRASTRUCTURE=true
      ;;
    --start)
      START_INFRASTRUCTURE=true
      START_FUNCTIONS=true
      ;;
    *)
      [[ -z "${FUNCTION_SOURCE:-}" ]] || die 'FUNCTION_SOURCE foi informado mais de uma vez'
      FUNCTION_SOURCE="$1"
      ;;
  esac
  shift
done

REPO_ROOT="$(cd -- "$KIT_DIR/../.." && pwd -P)"
if [[ -z "${FUNCTION_SOURCE:-}" ]]; then
  if [[ -d "$REPO_ROOT/supabase/functions" ]]; then
    FUNCTION_SOURCE="$REPO_ROOT/supabase/functions"
  elif [[ -d "$KIT_DIR/app-functions" ]]; then
    FUNCTION_SOURCE="$KIT_DIR/app-functions"
  else
    die 'fonte das Edge Functions ausente; copie supabase/functions ao servidor e informe o caminho como argumento ou FUNCTION_SOURCE'
  fi
fi
FUNCTION_SOURCE="$(realpath -e -- "$FUNCTION_SOURCE")"
require_dir "$FUNCTION_SOURCE"
[[ "$FUNCTION_SOURCE" != '/' && "$FUNCTION_SOURCE" != '/opt' && "$FUNCTION_SOURCE" != '/var' ]] \
  || die 'fonte das Edge Functions ampla demais'
require_dir "$FUNCTION_SOURCE/_shared"
require_file "$FUNCTION_SOURCE/_shared/cors.ts"
require_file "$FUNCTION_SOURCE/send-whatsapp-message/index.ts"
function_entrypoint_count="$(find "$FUNCTION_SOURCE" -mindepth 2 -maxdepth 2 -type f -name index.ts | wc -l)"
[[ "$function_entrypoint_count" =~ ^[0-9]+$ ]] \
  && (( function_entrypoint_count == EXPECTED_EDGE_FUNCTION_COUNT )) \
  || die "fonte das Edge Functions divergiu do inventario aprovado (esperado=$EXPECTED_EDGE_FUNCTION_COUNT; encontrado=$function_entrypoint_count)"
require_file "$KIT_DIR/runtime/main/index.ts"
require_file "$INSTALL_DIR/.crm-supabase-commit"
[[ "$(tr -d '[:space:]' <"$INSTALL_DIR/.crm-supabase-commit")" == "$SUPABASE_COMMIT" ]] \
  || die 'a stack de destino nao esta no commit fixado'
require_secret_file "$INSTALL_DIR/.env"
require_secret_file "$INSTALL_DIR/functions.env"

google_auth_enabled="$(env_file_value "$INSTALL_DIR/.env" GOOGLE_ENABLED)"
[[ -z "$google_auth_enabled" || "$google_auth_enabled" == 'false' || "$google_auth_enabled" == 'true' ]] \
  || die 'GOOGLE_ENABLED precisa ser true ou false em .env'
if [[ "$google_auth_enabled" == 'true' ]]; then
  require_configured_env_key "$INSTALL_DIR/.env" GOOGLE_CLIENT_ID
  require_configured_env_key "$INSTALL_DIR/.env" GOOGLE_SECRET
  require_configured_env_key "$INSTALL_DIR/functions.env" GOOGLE_CLIENT_ID
  require_configured_env_key "$INSTALL_DIR/functions.env" GOOGLE_CLIENT_SECRET
  [[ "$(env_file_value "$INSTALL_DIR/.env" GOOGLE_CLIENT_ID)" == "$(env_file_value "$INSTALL_DIR/functions.env" GOOGLE_CLIENT_ID)" ]] \
    || die 'GOOGLE_CLIENT_ID diverge entre Auth (.env) e Edge Functions'
  [[ "$(env_file_value "$INSTALL_DIR/.env" GOOGLE_SECRET)" == "$(env_file_value "$INSTALL_DIR/functions.env" GOOGLE_CLIENT_SECRET)" ]] \
    || die 'GOOGLE_SECRET do Auth diverge de GOOGLE_CLIENT_SECRET das Edge Functions'
fi

for key in ADMIN_JWT_SECRET CRON_SECRET OAUTH_STATE_SECRET; do
  require_minimum_env_key_length "$INSTALL_DIR/functions.env" "$key" 32
done
if [[ "$START_FUNCTIONS" == true ]]; then
  require_configured_env_key "$INSTALL_DIR/functions.env" META_TOKEN_ENCRYPTION_KEY
  for key in \
    EVOLUTION_API_URL EVOLUTION_API_KEY EVOLUTION_WEBHOOK_SECRET \
    FACEBOOK_APP_ID FACEBOOK_APP_SECRET FACEBOOK_WEBHOOK_VERIFY_TOKEN \
    SITE_URL; do
    require_configured_env_key "$INSTALL_DIR/functions.env" "$key"
  done
fi

exec 9>"$INSTALL_DIR/.functions-deploy.lock"
flock -n 9 || die 'outro deploy de Edge Functions ja esta em execucao'
compose config --quiet

target_functions="$INSTALL_DIR/volumes/functions"
staging_functions=''
was_running=false
deployment_complete=false

cleanup_staging() {
  if [[ -n "$staging_functions" && -d "$staging_functions" ]]; then
    case "$staging_functions" in
      "$INSTALL_DIR"/volumes/.functions-staging.*)
        rm -rf -- "$staging_functions"
        ;;
      *)
        warn "staging inesperado nao removido: $staging_functions"
        ;;
    esac
  fi
  if [[ "$was_running" == true && "$deployment_complete" != true ]]; then
    warn 'deploy interrompido; Edge Functions permanecem paradas para evitar codigo parcialmente atualizado'
  fi
}
trap cleanup_staging EXIT

function_container_id="$(compose ps -a -q functions)"
if [[ -n "$function_container_id" ]] && [[ "$(docker inspect --format '{{.State.Running}}' "$function_container_id")" == 'true' ]]; then
  was_running=true
  log 'Parando Edge Functions antes de preparar ou substituir arquivos'
  compose stop functions >/dev/null
  [[ "$(docker inspect --format '{{.State.Running}}' "$function_container_id")" == 'false' ]] \
    || die 'o container de Edge Functions nao parou; sincronizacao recusada'
fi

assert_safe_absolute_dir "$target_functions" "$INSTALL_DIR"
install -d -m 0755 "$target_functions" "$INSTALL_DIR/runtime/main"

log 'Sincronizando Edge Functions do repositório'
staging_functions="$(mktemp -d "$INSTALL_DIR/volumes/.functions-staging.XXXXXX")"
assert_safe_absolute_dir "$staging_functions" "$INSTALL_DIR"
rsync -a --checksum --delete --exclude='/main/' -- "$FUNCTION_SOURCE/" "$staging_functions/"
if [[ -n "$(rsync -ani --checksum --delete --exclude='/main/' -- "$FUNCTION_SOURCE/" "$staging_functions/")" ]]; then
  die 'a fonte das Edge Functions mudou durante o staging; sincronizacao recusada'
fi
rsync -a --checksum --delete-delay --delay-updates --exclude='/main/' -- \
  "$staging_functions/" "$target_functions/"
install -m 0644 "$KIT_DIR/runtime/main/index.ts" "$INSTALL_DIR/runtime/main/index.ts"

if [[ "$START_INFRASTRUCTURE" == true ]]; then
  mapfile -t safe_services < <(compose config --services | grep -Ev '^functions$')
  (( ${#safe_services[@]} > 0 )) || die 'nenhum serviço seguro foi encontrado no compose'
  compose up -d --wait --wait-timeout 300 "${safe_services[@]}"
  log 'Infraestrutura saudável sem Edge Functions; o endpoint S3 já pode ser validado'
fi

if [[ "$START_FUNCTIONS" == true || "$was_running" == true ]]; then
  compose up -d --no-deps --force-recreate functions
  wait_for_container_health supabase-edge-functions 180
  log 'Edge Functions recriadas e saudáveis'
else
  log 'Arquivos implantados; o serviço functions permaneceu parado. Use --start somente quando efeitos externos forem permitidos.'
fi

deployment_complete=true
cleanup_staging
trap - EXIT
