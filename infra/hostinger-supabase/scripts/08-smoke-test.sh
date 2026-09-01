#!/usr/bin/env bash

# Read-only smoke tests for the self-hosted Supabase stack.
# shellcheck shell=bash

set -Eeuo pipefail
IFS=$'\n\t'
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

load_versions
require_command curl docker ss
load_env_file "$INSTALL_DIR/.env"
require_non_placeholder SUPABASE_PUBLIC_URL
require_non_placeholder ANON_KEY

if [[ "${ALLOW_LOCAL_HTTP:-false}" != 'true' ]]; then
  require_https_url SUPABASE_PUBLIC_URL
fi

failures=0
check_url() {
  local name="$1"
  local url="$2"
  shift 2
  local status

  status="$(curl --silent --show-error \
    --connect-timeout 10 --max-time 30 --retry 2 \
    --output /dev/null --write-out '%{http_code}' "$@" "$url" || true)"
  if [[ "$status" =~ ^2[0-9][0-9]$ ]]; then
    log "PASS HTTP: $name ($status)"
  else
    warn "FAIL HTTP: $name (status ${status:-indisponível})"
    failures=$((failures + 1))
  fi
}

mapfile -t services < <(compose config --services)
for service in "${services[@]}"; do
  container_id="$(compose ps -a -q "$service" 2>/dev/null || true)"
  if [[ -z "$container_id" ]]; then
    warn "FAIL container: $service não foi criado"
    failures=$((failures + 1))
    continue
  fi
  state="$(docker inspect --format '{{.State.Status}}' "$container_id")"
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id")"
  if [[ "$state" == 'running' && ( "$health" == 'healthy' || "$health" == 'none' ) ]]; then
    log "PASS container: $service ($health)"
  else
    warn "FAIL container: $service (state=$state, health=$health)"
    failures=$((failures + 1))
  fi
done

if ss -H -ltn | awk '{print $4}' | grep -Eq '^(0\.0\.0\.0|\[::\]|\*):(5432|6543|8000)$'; then
  warn 'FAIL rede: uma porta interna (5432, 6543 ou 8000) está publicada globalmente'
  failures=$((failures + 1))
else
  log 'PASS rede: Postgres, pooler e gateway interno não estão publicados'
fi

base_url="${SUPABASE_PUBLIC_URL%/}"
check_url 'Auth health' "$base_url/auth/v1/health" \
  -H "apikey: $ANON_KEY"
check_url 'PostgREST profiles (limit 0)' "$base_url/rest/v1/profiles?select=id&limit=0" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
check_url 'Storage health' "$base_url/storage/v1/status" \
  -H "apikey: $ANON_KEY"

function_name="${SMOKE_FUNCTION_NAME:-check-subscription}"
[[ "$function_name" =~ ^[A-Za-z0-9_-]+$ ]] || die 'SMOKE_FUNCTION_NAME inválido'
check_url "Edge Function OPTIONS ($function_name)" "$base_url/functions/v1/$function_name" \
  -X OPTIONS \
  -H 'Origin: https://www.kairozcrm.com.br' \
  -H 'Access-Control-Request-Method: POST' \
  -H "apikey: $ANON_KEY"

if (( failures > 0 )); then
  die "$failures smoke test(s) falharam"
fi
log 'Todos os smoke tests de infraestrutura passaram'
