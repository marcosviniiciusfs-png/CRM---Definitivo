#!/usr/bin/env bash

# Shared helpers for the CRM Supabase migration scripts.
# shellcheck shell=bash

set -Eeuo pipefail
IFS=$'\n\t'
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
KIT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
VERSIONS_FILE="${VERSIONS_FILE:-$KIT_DIR/versions.conf}"

log() {
  printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

warn() {
  printf '[%s] WARNING: %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*" >&2
}

die() {
  printf '[%s] ERROR: %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*" >&2
  exit 1
}

require_root() {
  [[ "$(id -u)" -eq 0 ]] || die 'execute como root (ou via sudo)'
}

require_command() {
  local command_name
  for command_name in "$@"; do
    command -v "$command_name" >/dev/null 2>&1 || die "comando obrigatório ausente: $command_name"
  done
}

require_file() {
  [[ -f "$1" ]] || die "arquivo obrigatório ausente: $1"
}

require_dir() {
  [[ -d "$1" ]] || die "diretório obrigatório ausente: $1"
}

require_secret_file() {
  local file="$1"
  local mode owner current_uid numeric_mode

  require_file "$file"
  mode="$(stat -c '%a' "$file")"
  owner="$(stat -c '%u' "$file")"
  current_uid="$(id -u)"
  numeric_mode=$((8#$mode))
  (( (numeric_mode & 8#077) == 0 )) || die "permissão insegura em $file ($mode); use chmod 600"
  [[ "$owner" == '0' || "$owner" == "$current_uid" ]] \
    || die "$file pertence a outro usuário (uid=$owner)"
  [[ -r "$file" ]] || die "arquivo secreto não é legível: $file"
}

load_env_file() {
  local file="$1"

  require_secret_file "$file"
  # Environment files are trusted, root-owned shell assignment files. Never
  # enable xtrace around this function: they contain production credentials.
  set -a
  # shellcheck disable=SC1090
  source "$file"
  set +a
}

load_versions() {
  require_file "$VERSIONS_FILE"
  # versions.conf is committed and contains only non-secret assignments.
  # shellcheck disable=SC1090
  source "$VERSIONS_FILE"

  : "${SUPABASE_TAG:?SUPABASE_TAG ausente em versions.conf}"
  : "${SUPABASE_TAG_OBJECT:?SUPABASE_TAG_OBJECT ausente em versions.conf}"
  : "${SUPABASE_COMMIT:?SUPABASE_COMMIT ausente em versions.conf}"
  : "${SUPABASE_CLI_VERSION:?SUPABASE_CLI_VERSION ausente em versions.conf}"
  : "${SUPABASE_CLI_DB_IMAGE:?SUPABASE_CLI_DB_IMAGE ausente em versions.conf}"
  : "${EXPECTED_EDGE_FUNCTION_COUNT:?EXPECTED_EDGE_FUNCTION_COUNT ausente em versions.conf}"
  : "${INSTALL_DIR:?INSTALL_DIR ausente em versions.conf}"
  : "${MIGRATION_KIT_DIR:?MIGRATION_KIT_DIR ausente em versions.conf}"
  : "${BACKUP_DIR:?BACKUP_DIR ausente em versions.conf}"
  [[ "$EXPECTED_EDGE_FUNCTION_COUNT" =~ ^[0-9]+$ && "$EXPECTED_EDGE_FUNCTION_COUNT" -gt 0 ]] \
    || die 'EXPECTED_EDGE_FUNCTION_COUNT precisa ser inteiro positivo'
}

require_non_placeholder() {
  local name="$1"
  local value="${!name:-}"

  [[ -n "$value" ]] || die "$name não foi definido"
  case "$value" in
    REPLACE*|*PROJECT_REF*|*PASSWORD*|*S3_ENDPOINT*|your-*|YOUR_*)
      die "$name ainda contém placeholder"
      ;;
  esac
}

env_file_value() {
  local file="$1"
  local key="$2"
  awk -F= -v wanted="$key" '$1 == wanted {sub(/^[^=]*=/, ""); print; exit}' "$file"
}

require_managed_source_cold_approval() {
  local expected_project_ref="${1:-uxttihjsxfowursjyult}"
  local approval_file="${COLD_BACKUP_APPROVAL_FILE:-/etc/crm-supabase/managed-source-cold-approved}"
  local approved_at approval_key

  [[ "$approval_file" == '/etc/crm-supabase/managed-source-cold-approved' ]] \
    || die 'COLD_BACKUP_APPROVAL_FILE diverge do caminho protegido aprovado'
  [[ ! -L "$approval_file" ]] || die 'marcador de aprovacao do backup frio nao pode ser symlink'
  require_secret_file "$approval_file"
  [[ "$(stat -c '%u:%a' "$approval_file")" == '0:600' ]] \
    || die 'marcador de aprovacao do backup frio deve pertencer a root e ter modo 0600'
  for approval_key in status mode project_ref approved_at_utc; do
    [[ "$(grep -c "^${approval_key}=" "$approval_file" || true)" == '1' ]] \
      || die "marcador de backup frio possui chave ausente/duplicada: $approval_key"
  done
  [[ "$(env_file_value "$approval_file" status)" == 'approved' \
     && "$(env_file_value "$approval_file" mode)" == 'managed-source-cold' \
     && "$(env_file_value "$approval_file" project_ref)" == "$expected_project_ref" ]] \
    || die 'marcador de aprovacao do backup frio diverge do projeto/modo autorizado'
  approved_at="$(env_file_value "$approval_file" approved_at_utc)"
  [[ "$approved_at" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] \
    || die 'timestamp do marcador de backup frio e invalido'
}

require_configured_env_key() {
  local file="$1"
  local key="$2"
  local value

  require_secret_file "$file"
  value="$(env_file_value "$file" "$key")"
  [[ -n "$value" ]] || die "$key está vazio ou ausente em $file"
  case "$value" in
    REPLACE*|*PROJECT_REF*|*S3_ENDPOINT*|your-*|YOUR_*)
      die "$key ainda contém placeholder em $file"
      ;;
  esac
}

require_minimum_env_key_length() {
  local file="$1"
  local key="$2"
  local minimum="$3"
  local value

  require_configured_env_key "$file" "$key"
  value="$(env_file_value "$file" "$key")"
  (( ${#value} >= minimum )) || die "$key precisa conter ao menos $minimum caracteres em $file"
  [[ "$value" != *[[:space:]]* ]] || die "$key não pode conter espaços"
}

require_https_url() {
  local name="$1"
  local value="${!name:-}"
  [[ "$value" =~ ^https://[^[:space:]]+$ ]] || die "$name deve ser uma URL https válida"
}

assert_safe_absolute_dir() {
  local path="$1"
  local allowed_parent="$2"

  [[ "$path" == /* ]] || die "caminho precisa ser absoluto: $path"
  [[ "$path" != '/' && "$path" != '/opt' && "$path" != '/var' ]] || die "caminho amplo recusado: $path"
  [[ "$path" == "$allowed_parent"/* ]] || die "$path está fora de $allowed_parent"
}

compose() {
  require_dir "$INSTALL_DIR"
  (
    cd "$INSTALL_DIR"
    docker compose "$@"
  )
}

wait_for_container_health() {
  local container="$1"
  local timeout_seconds="${2:-180}"
  local deadline=$((SECONDS + timeout_seconds))
  local state health

  while (( SECONDS < deadline )); do
    state="$(docker inspect --format '{{.State.Status}}' "$container" 2>/dev/null || true)"
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null || true)"
    if [[ "$state" == 'running' && ( "$health" == 'healthy' || "$health" == 'none' ) ]]; then
      return 0
    fi
    sleep 2
  done

  die "container $container não ficou saudável em ${timeout_seconds}s"
}

set_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  local temp_file

  [[ "$key" =~ ^[A-Z0-9_]+$ ]] || die "nome de variável inválido: $key"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || die "valor multilinha recusado para $key"
  temp_file="$(mktemp "${file}.XXXXXX")"
  CRM_ENV_REPLACEMENT="$value" awk -v wanted="$key" '
    BEGIN {
      found = 0
      replacement = ENVIRON["CRM_ENV_REPLACEMENT"]
    }
    $0 ~ "^" wanted "=" {
      print wanted "=" replacement
      found = 1
      next
    }
    { print }
    END {
      if (!found) print wanted "=" replacement
    }
  ' "$file" >"$temp_file"
  chmod --reference="$file" "$temp_file" 2>/dev/null || chmod 600 "$temp_file"
  mv -f -- "$temp_file" "$file"
}

send_alert() {
  local message="$1"
  local webhook="${ALERT_WEBHOOK_URL:-}"
  local remainder authority host port command_name

  [[ -n "$webhook" ]] || return 0

  # load_env_file exports assignments by design. Keep the webhook out of every
  # child environment as well as argv; the shell variable remains available to
  # later alerts in the same process.
  export -n ALERT_WEBHOOK_URL 2>/dev/null || true

  # Curl config uses double-quoted values. Reject control/space, quote,
  # backslash, userinfo and malformed authority so the URL cannot inject config.
  if [[ "$webhook" != https://* \
     || "$webhook" == *[[:space:]]* \
     || "$webhook" == *'"'* \
     || "$webhook" == *'\'* ]]; then
    warn 'ALERT_WEBHOOK_URL inválida; alerta não enviado'
    return 1
  fi
  remainder="${webhook#https://}"
  authority="${remainder%%/*}"
  authority="${authority%%\?*}"
  authority="${authority%%\#*}"
  if [[ -z "$authority" || "$authority" == *'@'* ]]; then
    warn 'ALERT_WEBHOOK_URL sem authority HTTPS válida; alerta não enviado'
    return 1
  fi
  host="$authority"
  port=''
  if [[ "$authority" == *:* ]]; then
    host="${authority%:*}"
    port="${authority##*:}"
    if [[ ! "$port" =~ ^[0-9]{1,5}$ ]] || (( 10#$port < 1 || 10#$port > 65535 )); then
      warn 'ALERT_WEBHOOK_URL contém porta inválida; alerta não enviado'
      return 1
    fi
  fi
  if [[ ! "$host" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ \
     || "$host" == *'..'* ]]; then
    warn 'ALERT_WEBHOOK_URL contém hostname inválido; alerta não enviado'
    return 1
  fi

  for command_name in curl jq mktemp stat; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
      warn 'dependência de alerta indisponível; alerta não enviado'
      return 1
    fi
  done
  if [[ "$(id -u)" -ne 0 ]]; then
    warn 'envio de alerta exige execução como root'
    return 1
  fi

  if ! (
    set -Eeuo pipefail
    set +x
    umask 077
    alert_config=''

    cleanup_alert_files() {
      set +x
      if [[ -n "$alert_config" \
         && "$alert_config" =~ ^/run/crm-alert-curl\.[A-Za-z0-9]+$ ]]; then
        rm -f -- "$alert_config" "${alert_config}.stderr"
      fi
    }
    trap cleanup_alert_files EXIT
    trap 'exit 129' HUP
    trap 'exit 130' INT
    trap 'exit 143' TERM

    alert_config="$(mktemp /run/crm-alert-curl.XXXXXX)"
    [[ "$alert_config" =~ ^/run/crm-alert-curl\.[A-Za-z0-9]+$ ]]
    : >"${alert_config}.stderr"
    chmod 0600 "$alert_config" "${alert_config}.stderr"
    [[ "$(stat -c '%u:%a' "$alert_config")" == '0:600' ]]
    [[ "$(stat -c '%u:%a' "${alert_config}.stderr")" == '0:600' ]]

    printf '%s\n' \
      'silent' \
      'show-error' \
      'fail' \
      'connect-timeout = 5' \
      'max-time = 10' \
      'proto = "=https"' \
      'proto-redir = "=https"' \
      'header = "Content-Type: application/json"' \
      'data-binary = "@-"' \
      "url = \"$webhook\"" \
      >"$alert_config"

    # Message stays on stdin: neither jq nor curl receives it in argv. Curl's
    # own diagnostics are protected too because some failures echo their URL.
    printf '%s' "$message" \
      | jq -Rs '{text: .}' \
      | curl --disable --config "$alert_config" \
          >/dev/null 2>"${alert_config}.stderr"
  ); then
    warn 'não foi possível enviar o alerta'
    return 1
  fi
}
