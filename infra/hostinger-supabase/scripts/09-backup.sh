#!/usr/bin/env bash

# Transactionally consistent PostgreSQL dump plus encrypted off-site Restic.
# Storage/config are file-level and need producer quiescence for a coordinated point.
# shellcheck shell=bash

set -Eeuo pipefail
IFS=$'\n\t'
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

require_root
load_versions
expected_install_dir="$INSTALL_DIR"
expected_backup_dir="$BACKUP_DIR"
BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-/etc/crm-supabase/backup.env}"
load_env_file "$BACKUP_ENV_FILE"
export -n ALERT_WEBHOOK_URL 2>/dev/null || true
require_command curl docker flock jq mktemp restic sha256sum stat

INITIALIZE_REPOSITORY=false
RUN_MAINTENANCE=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --init-repository) INITIALIZE_REPOSITORY=true ;;
    --maintenance) RUN_MAINTENANCE=true ;;
    *) die 'uso: 09-backup.sh [--init-repository] [--maintenance]' ;;
  esac
  shift
done

[[ "$INSTALL_DIR" == "$expected_install_dir" ]] || die 'INSTALL_DIR em backup.env diverge de versions.conf'
[[ "$BACKUP_DIR" == "$expected_backup_dir" ]] || die 'BACKUP_DIR em backup.env diverge de versions.conf'
require_file "$INSTALL_DIR/.crm-supabase-commit"
require_non_placeholder RESTIC_REPOSITORY
require_non_placeholder RESTIC_PASSWORD_FILE
require_secret_file "$RESTIC_PASSWORD_FILE"
if [[ "$RESTIC_REPOSITORY" == s3:* ]]; then
  require_non_placeholder AWS_ACCESS_KEY_ID
  require_non_placeholder AWS_SECRET_ACCESS_KEY
fi
LOCAL_RETENTION_DAYS="${LOCAL_RETENTION_DAYS:-2}"
[[ "$LOCAL_RETENTION_DAYS" =~ ^[0-9]+$ ]] || die 'LOCAL_RETENTION_DAYS precisa ser inteiro não negativo'
RESTIC_CACHE_DIR="${RESTIC_CACHE_DIR:-$BACKUP_DIR/restic-cache}"
export RESTIC_CACHE_DIR
assert_safe_absolute_dir "$RESTIC_CACHE_DIR" "$BACKUP_DIR"

install -d -m 0700 "$BACKUP_DIR" "$BACKUP_DIR/logical" "$RESTIC_CACHE_DIR"
exec 9>"$BACKUP_DIR/.backup.lock"
flock -n 9 || die 'outro backup já está em execução'

backup_id="$(date -u +'%Y%m%dT%H%M%SZ')"
stage="$BACKUP_DIR/logical/$backup_id"
assert_safe_absolute_dir "$stage" "$BACKUP_DIR"
install -d -m 0700 "$stage"

container_dump="/tmp/crm-backup-$backup_id.dump"
[[ "$container_dump" =~ ^/tmp/crm-backup-[0-9TZ]+\.dump$ ]] || die 'caminho temporário do dump inesperado'

backup_failed() {
  local status=$?
  docker exec supabase-db rm -f -- "$container_dump" >/dev/null 2>&1 || true
  if (( status != 0 )); then
    warn "backup falhou; artefatos parciais preservados em $stage"
    send_alert "CRM Supabase: backup falhou no host $(hostname -s)"
  fi
  exit "$status"
}
trap backup_failed EXIT

wait_for_container_health supabase-db 60
log 'Gerando dump lógico PostgreSQL custom format'
docker exec supabase-db pg_dump -U postgres -d postgres \
  --format=custom --compress=9 --file="$container_dump"
docker cp "supabase-db:$container_dump" "$stage/postgres.dump"
docker exec supabase-db rm -f -- "$container_dump"

docker exec supabase-db pg_dumpall -U postgres --roles-only >"$stage/roles.sql"
docker exec supabase-db test -r /etc/postgresql-custom/pgsodium_root.key \
  || die 'pgsodium_root.key não encontrado; backup completo recusado'
docker exec supabase-db cat /etc/postgresql-custom/pgsodium_root.key >"$stage/pgsodium_root.key"
chmod 0600 "$stage/postgres.dump" "$stage/roles.sql" "$stage/pgsodium_root.key"
(
  cd "$stage"
  sha256sum postgres.dump roles.sql pgsodium_root.key >SHA256SUMS
)
chmod 0600 "$stage/SHA256SUMS"

backup_paths=(
  "$stage"
  "$INSTALL_DIR/.crm-supabase-commit"
  "$INSTALL_DIR/.env"
  "$INSTALL_DIR/.crm-image-manifest"
  "$INSTALL_DIR/functions.env"
  "$INSTALL_DIR/docker-compose.yml"
  "$INSTALL_DIR/docker-compose.caddy.yml"
  "$INSTALL_DIR/docker-compose.crm.yml"
  "$INSTALL_DIR/runtime"
  "$INSTALL_DIR/volumes/api"
  "$INSTALL_DIR/volumes/functions"
  "$INSTALL_DIR/volumes/logs"
  "$INSTALL_DIR/volumes/pooler"
  "$INSTALL_DIR/volumes/proxy"
  "$INSTALL_DIR/volumes/snippets"
  "$INSTALL_DIR/volumes/storage"
)
mapfile -t db_config_files < <(find "$INSTALL_DIR/volumes/db" -maxdepth 1 -type f -print)
(( ${#db_config_files[@]} > 0 )) || die 'nenhum arquivo de configuração do banco foi encontrado'
backup_paths+=("${db_config_files[@]}")
if [[ -f "$INSTALL_DIR/.crm-last-restore" ]]; then
  backup_paths+=("$INSTALL_DIR/.crm-last-restore")
fi
if [[ -f "$INSTALL_DIR/.crm-chat-media-discarded" ]]; then
  backup_paths+=("$INSTALL_DIR/.crm-chat-media-discarded")
fi
if [[ -e "$INSTALL_DIR/.crm-chat-media-retention-enabled" \
   || -L "$INSTALL_DIR/.crm-chat-media-retention-enabled" ]]; then
  [[ ! -L "$INSTALL_DIR/.crm-chat-media-retention-enabled" ]] \
    || die 'marcador de retencao symlink recusado no backup'
  require_secret_file "$INSTALL_DIR/.crm-chat-media-retention-enabled"
  backup_paths+=("$INSTALL_DIR/.crm-chat-media-retention-enabled")
fi
if [[ -e "$BACKUP_DIR/retention/chat-media.last-success" \
   || -L "$BACKUP_DIR/retention/chat-media.last-success" ]]; then
  [[ ! -L "$BACKUP_DIR/retention/chat-media.last-success" ]] \
    || die 'marcador de sucesso da retencao symlink recusado no backup'
  require_secret_file "$BACKUP_DIR/retention/chat-media.last-success"
  backup_paths+=("$BACKUP_DIR/retention/chat-media.last-success")
fi
for path in "${backup_paths[@]}"; do
  [[ -e "$path" ]] || die "caminho obrigatório do backup ausente: $path"
done

if restic cat config >/dev/null 2>&1; then
  :
elif [[ "$INITIALIZE_REPOSITORY" == true ]]; then
  log 'Inicializando repositório restic vazio'
  restic init
else
  die 'repositório restic inacessível ou ainda não inicializado; valide acesso e execute uma vez com --init-repository'
fi

log 'Enviando backup criptografado ao repositório off-site'
restic backup --tag crm-supabase --tag "$backup_id" "${backup_paths[@]}"
forget_args=(
  --tag crm-supabase
  --keep-daily "${RESTIC_KEEP_DAILY:-7}"
  --keep-weekly "${RESTIC_KEEP_WEEKLY:-4}"
  --keep-monthly "${RESTIC_KEEP_MONTHLY:-6}"
)
if [[ "$RUN_MAINTENANCE" == true ]]; then
  restic check --read-data-subset="${RESTIC_CHECK_SUBSET:-1%}"
  restic forget "${forget_args[@]}" --prune
else
  restic forget "${forget_args[@]}"
fi

printf '%s\n' "completed_at_utc=$(date -u +'%Y-%m-%dT%H:%M:%SZ')" >"$stage/.complete"
chmod 0600 "$stage/.complete"
find "$BACKUP_DIR/logical" -mindepth 1 -maxdepth 1 -type d -mtime "+$LOCAL_RETENTION_DAYS" -exec rm -rf -- {} +

trap - EXIT
log "Backup concluído: $backup_id (maintenance=$RUN_MAINTENANCE)"
