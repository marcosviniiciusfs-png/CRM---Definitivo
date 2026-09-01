#!/usr/bin/env bash

# Archive the rehearsal-only target data and initialize a clean green database.
# Nothing in the managed Supabase source is accessed by this script.
# shellcheck shell=bash

set -Eeuo pipefail
IFS=$'\n\t'
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

require_root
load_versions
require_command docker flock mktemp realpath stat
[[ $# -eq 0 ]] || die 'uso: 14-reset-rehearsal-target.sh'

expected_confirmation='YES_ARCHIVE_REHEARSAL_AND_INITIALIZE_CLEAN_TARGET'
[[ "${CONFIRM_RESET_REHEARSAL_TARGET:-}" == "$expected_confirmation" ]] \
  || die "confirme com CONFIRM_RESET_REHEARSAL_TARGET=$expected_confirmation"

require_file "$INSTALL_DIR/.crm-supabase-commit"
[[ "$(tr -d '[:space:]' <"$INSTALL_DIR/.crm-supabase-commit")" == "$SUPABASE_COMMIT" ]] \
  || die 'a stack de destino nao esta no commit fixado'
[[ ! -e "$INSTALL_DIR/.crm-production-cutover-complete" \
   && ! -L "$INSTALL_DIR/.crm-production-cutover-complete" ]] \
  || die 'este destino ja foi marcado como producao; reset recusado'
[[ ! -e "$INSTALL_DIR/.crm-chat-media-retention-enabled" \
   && ! -L "$INSTALL_DIR/.crm-chat-media-retention-enabled" ]] \
  || die 'retencao de producao ja foi habilitada; reset recusado'

restore_marker="$INSTALL_DIR/.crm-last-restore"
discard_marker="$INSTALL_DIR/.crm-chat-media-discarded"
for marker in "$restore_marker" "$discard_marker"; do
  [[ ! -L "$marker" ]] || die "marcador symlink recusado: $marker"
  require_secret_file "$marker"
done
[[ "$(env_file_value "$restore_marker" status)" == 'restored' ]] \
  || die 'o destino atual nao possui marcador de restore de ensaio valido'
[[ "$(env_file_value "$discard_marker" status)" == 'discarded' ]] \
  || die 'o destino atual nao possui marcador de descarte de ensaio valido'
[[ "$(env_file_value "$discard_marker" restore_manifest_sha256)" \
    == "$(env_file_value "$restore_marker" manifest_sha256)" ]] \
  || die 'os marcadores de restore e descarte do ensaio divergem'

db_data_dir="$INSTALL_DIR/volumes/db/data"
storage_dir="$INSTALL_DIR/volumes/storage"
require_dir "$db_data_dir"
require_dir "$storage_dir"
db_data_dir="$(realpath -e -- "$db_data_dir")"
storage_dir="$(realpath -e -- "$storage_dir")"
[[ "$db_data_dir" == "$INSTALL_DIR/volumes/db/data" \
   && "$storage_dir" == "$INSTALL_DIR/volumes/storage" ]] \
  || die 'os diretórios mutáveis do destino não resolveram para os caminhos fixados'

exec 9>"$INSTALL_DIR/.target-reset.lock"
flock -n 9 || die 'outro reset do destino esta em execucao'

archive_root="$BACKUP_DIR/rehearsal-targets"
timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
archive_dir="$archive_root/${timestamp}-rehearsal-target"
assert_safe_absolute_dir "$archive_dir" "$BACKUP_DIR"
[[ ! -e "$archive_dir" ]] || die "arquivo de ensaio ja existe: $archive_dir"
install -d -m 0700 "$archive_root" "$archive_dir" "$archive_dir/markers"

log 'Parando a stack de ensaio antes de arquivar o green atual'
compose down --remove-orphans
for container in $(docker ps -aq --filter 'name=^/supabase-'); do
  [[ "$(docker inspect --format '{{.State.Running}}' "$container")" == 'false' ]] \
    || die "container Supabase permaneceu em execucao: $container"
done

mv -- "$db_data_dir" "$archive_dir/db-data"
mv -- "$storage_dir" "$archive_dir/storage"

for marker_name in \
  .crm-last-restore \
  .crm-restore-in-progress \
  .crm-chat-media-discarded \
  .crm-compatibility-report \
  .crm-chat-media-retention-enabled; do
  marker_path="$INSTALL_DIR/$marker_name"
  if [[ -e "$marker_path" || -L "$marker_path" ]]; then
    [[ ! -L "$marker_path" && -f "$marker_path" ]] \
      || die "marcador inesperado durante o reset: $marker_path"
    mv -- "$marker_path" "$archive_dir/markers/$marker_name"
  fi
done

install -d -o 100 -g 0 -m 0750 "$INSTALL_DIR/volumes/db/data"
install -d -o 0 -g 0 -m 0755 "$INSTALL_DIR/volumes/storage"
install -d -o 0 -g 0 -m 0755 "$INSTALL_DIR/volumes/storage/stub"

log 'Inicializando um banco green limpo'
compose up -d db
wait_for_container_health supabase-db 300

fresh_state="$(docker exec supabase-db psql -XAt -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT current_database(), current_setting('transaction_read_only'), to_regclass('public.profiles') IS NULL;")" \
  || die 'nao foi possivel validar o banco green reinicializado'
IFS='|' read -r database_name transaction_read_only profiles_absent <<<"$fresh_state"
[[ "$database_name" == 'postgres' && "$transaction_read_only" == 'off' \
   && "$profiles_absent" == 't' ]] \
  || die 'o banco reinicializado nao esta vazio e gravavel como esperado'

archive_manifest="$archive_dir/METADATA"
printf '%s\n' \
  'status=archived-rehearsal' \
  "archived_at_utc=$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  "supabase_commit=$SUPABASE_COMMIT" \
  "previous_restore_manifest_sha256=$(env_file_value "$archive_dir/markers/.crm-last-restore" manifest_sha256)" \
  >"$archive_manifest"
chmod 0600 "$archive_manifest"
(
  cd "$archive_dir"
  find . -maxdepth 2 -type f ! -name SHA256SUMS -print0 \
    | LC_ALL=C sort -z \
    | xargs -0 sha256sum --
) >"$archive_dir/SHA256SUMS"
chmod 0600 "$archive_dir/SHA256SUMS"

reset_marker="$INSTALL_DIR/.crm-clean-target-ready"
temp_marker="$(mktemp "${reset_marker}.XXXXXX")"
trap 'rm -f -- "${temp_marker:-}"' EXIT
printf '%s\n' \
  'status=clean-target-ready' \
  "prepared_at_utc=$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  "supabase_commit=$SUPABASE_COMMIT" \
  "rehearsal_archive=$archive_dir" \
  >"$temp_marker"
chmod 0600 "$temp_marker"
mv -f -- "$temp_marker" "$reset_marker"
temp_marker=''
trap - EXIT

log "Green limpo e pronto para o restore final; ensaio arquivado em $archive_dir"
