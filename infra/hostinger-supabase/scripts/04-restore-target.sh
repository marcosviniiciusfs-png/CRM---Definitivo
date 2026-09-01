#!/usr/bin/env bash

# Restore a verified Supabase CLI export into a fresh target database.
# shellcheck shell=bash

set -Eeuo pipefail
IFS=$'\n\t'
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

require_root
load_versions
require_command cat docker ln mktemp python3 realpath sha256sum
[[ $# -eq 1 ]] || die 'uso: 04-restore-target.sh <diretório-do-export>'

export_dir="$(realpath -e -- "$1")"
require_dir "$export_dir"
for required in roles.sql schema.sql data.sql SHA256SUMS; do
  require_file "$export_dir/$required"
done
DISABLE_CRON_SQL="${DISABLE_CRON_SQL:-$KIT_DIR/sql/disable-restored-cron.sql}"
require_file "$DISABLE_CRON_SQL"
COMPATIBILITY_CHECKER="${COMPATIBILITY_CHECKER:-$SCRIPT_DIR/check-service-copy-compatibility.py}"
require_file "$COMPATIBILITY_CHECKER"
SERVICE_SCHEMA_COMPATIBILITY_SQL="${SERVICE_SCHEMA_COMPATIBILITY_SQL:-$KIT_DIR/sql/prepare-service-schema-compatibility.sql}"
require_file "$SERVICE_SCHEMA_COMPATIBILITY_SQL"
STORAGE_MIGRATIONS_DIR="${STORAGE_MIGRATIONS_DIR:-$KIT_DIR/sql/storage-migrations}"
require_dir "$STORAGE_MIGRATIONS_DIR"
STORAGE_MIGRATIONS_DIR="$(realpath -e -- "$STORAGE_MIGRATIONS_DIR")"
STORAGE_MIGRATIONS_MANIFEST="${STORAGE_MIGRATIONS_MANIFEST:-$STORAGE_MIGRATIONS_DIR/SHA256SUMS}"
require_file "$STORAGE_MIGRATIONS_MANIFEST"
STORAGE_MIGRATIONS_MANIFEST="$(realpath -e -- "$STORAGE_MIGRATIONS_MANIFEST")"
STORAGE_MIGRATION_VALIDATION_SQL="${STORAGE_MIGRATION_VALIDATION_SQL:-$KIT_DIR/sql/record-and-validate-storage-migrations.sql}"
require_file "$STORAGE_MIGRATION_VALIDATION_SQL"
storage_migration_files=(
  "$STORAGE_MIGRATIONS_DIR/0061-mark-filename-immutable.sql"
  "$STORAGE_MIGRATIONS_DIR/0062-object-versioning-core.sql"
  "$STORAGE_MIGRATIONS_DIR/0063-fix-search-name-relative-to-prefix.sql"
  "$STORAGE_MIGRATIONS_DIR/0064-fix-search-by-timestamp-sqli.sql"
)
for storage_migration_file in "${storage_migration_files[@]}"; do
  require_file "$storage_migration_file"
done
(
  cd "$export_dir"
  sha256sum --check SHA256SUMS
) || die 'checksum do export falhou; restore abortado'
(
  cd "$STORAGE_MIGRATIONS_DIR"
  sha256sum --check --strict "$STORAGE_MIGRATIONS_MANIFEST"
) || die 'checksum das migrations oficiais do Storage falhou; restore abortado'

require_file "$INSTALL_DIR/.crm-supabase-commit"
[[ "$(tr -d '[:space:]' <"$INSTALL_DIR/.crm-supabase-commit")" == "$SUPABASE_COMMIT" ]] \
  || die 'a stack de destino não está no commit fixado'
require_secret_file "$INSTALL_DIR/.env"
restore_marker="$INSTALL_DIR/.crm-last-restore"
restore_in_progress_marker="$INSTALL_DIR/.crm-restore-in-progress"
[[ ! -e "$restore_marker" ]] \
  || die 'este destino já possui marcador de restore; um novo restore exige um green realmente limpo'

[[ ! -e "$restore_in_progress_marker" ]] \
  || die 'existe um restore anterior incompleto; inspecione o banco e o marcador antes de qualquer nova tentativa'

manifest_sha256="$(sha256sum "$export_dir/SHA256SUMS" | awk '{print $1}')"

write_restore_marker_atomic() {
  local destination="$1"
  local status="$2"
  local timestamp_key="$3"
  local temp_marker

  temp_marker="$(mktemp "${destination}.XXXXXX")"
  printf '%s\n' \
    "status=$status" \
    "${timestamp_key}=$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    "export_dir=$export_dir" \
    "manifest_sha256=$manifest_sha256" \
    >"$temp_marker"
  chmod 0600 "$temp_marker"
  if [[ "$status" == 'in_progress' ]]; then
    if ! ln -- "$temp_marker" "$destination"; then
      rm -f -- "$temp_marker"
      die 'outro processo iniciou um restore neste destino'
    fi
    rm -f -- "$temp_marker"
  else
    mv -f -- "$temp_marker" "$destination"
  fi
}

RESTORE_FREE_MARGIN_GB="${RESTORE_FREE_MARGIN_GB:-20}"
[[ "$RESTORE_FREE_MARGIN_GB" =~ ^[0-9]+$ ]] || die 'RESTORE_FREE_MARGIN_GB precisa ser inteiro não negativo'
export_bytes=$((
  $(stat -c '%s' "$export_dir/roles.sql") +
  $(stat -c '%s' "$export_dir/schema.sql") +
  $(stat -c '%s' "$export_dir/data.sql")
))
available_bytes=$(( $(df -Pk "$INSTALL_DIR" | awk 'NR == 2 {print $4}') * 1024 ))
required_bytes=$(( export_bytes * 2 + RESTORE_FREE_MARGIN_GB * 1024 * 1024 * 1024 ))
(( available_bytes >= required_bytes )) \
  || die "espaço livre insuficiente para restore seguro (exigido: 2x export + ${RESTORE_FREE_MARGIN_GB} GiB)"

compose config --quiet

compose up -d db
wait_for_container_health supabase-db 240

internal_roles_ready="$(docker exec supabase-db psql -XAt -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT count(*) = 3 AND bool_and(rolpassword IS NOT NULL)
      FROM pg_authid
      WHERE rolname IN ('authenticator', 'supabase_auth_admin', 'supabase_storage_admin');")"
[[ "$internal_roles_ready" == 't' ]] \
  || die 'roles internas de Auth/REST/Storage nao foram inicializadas com senha; destino verde precisa ser recriado'

platform_tables_ready="$(docker exec supabase-db psql -XAt -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT to_regclass('auth.users') IS NOT NULL AND to_regclass('storage.objects') IS NOT NULL;")"
if [[ "$platform_tables_ready" != 't' ]]; then
  log 'Inicializando schemas de Auth e Storage sem iniciar Edge Functions'
fi

# Always start both services on the empty green before catalog comparison.
# Their own migrations may add objects beyond the database image bootstrap.
compose up -d auth storage
wait_for_container_health supabase-auth 240
wait_for_container_health supabase-storage 240

empty_target_counts="$(docker exec supabase-db psql -XAt -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')), (SELECT count(*) FROM auth.users), (SELECT count(*) FROM storage.objects);")"
IFS='|' read -r public_objects auth_users storage_objects <<<"$empty_target_counts"
[[ "$public_objects" =~ ^[0-9]+$ && "$auth_users" =~ ^[0-9]+$ && "$storage_objects" =~ ^[0-9]+$ ]] \
  || die 'não foi possível validar se o destino está vazio'
(( public_objects == 0 && auth_users == 0 && storage_objects == 0 )) \
  || die "destino não está limpo (public=$public_objects, auth.users=$auth_users, storage.objects=$storage_objects); restore recusado"

log 'Destino vazio confirmado; parando serviços de aplicação para o restore'
mapfile -t non_db_services < <(compose config --services | grep -Ev '^db$' || true)
if (( ${#non_db_services[@]} > 0 )); then
  compose stop "${non_db_services[@]}" >/dev/null
fi

stream_service_schema_bundle() {
  local sql_file
  for sql_file in "$@"; do
    cat -- "$sql_file" || return 1
    printf '\n' || return 1
  done
}

service_schema_bundle=(
  "$SERVICE_SCHEMA_COMPATIBILITY_SQL"
  "${storage_migration_files[@]}"
  "$STORAGE_MIGRATION_VALIDATION_SQL"
)

log 'Aplicando ponte de Auth e migrations oficiais 61-64 do Storage no destino vazio'
# One outer transaction makes both the schema changes and their behavioral
# checks reversible. ON_ERROR_STOP plus pipefail prevents a partial bundle from
# being accepted if either the input stream or PostgreSQL fails.
if ! stream_service_schema_bundle "${service_schema_bundle[@]}" \
  | docker exec -i supabase-db sh -ceu \
      'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -h 127.0.0.1 -X -U supabase_admin -d postgres --single-transaction -v ON_ERROR_STOP=1 --file=-'; then
  die 'ponte transacional de Auth/Storage falhou e foi revertida'
fi

# Managed Auth/Storage can be newer than the latest tested self-hosted release.
# Compare every managed-service COPY target with the initialized target catalog
# before creating a restore marker or mutating application data. The report
# contains only object names and row counts, never COPY payloads.
compatibility_runtime="$(mktemp -d /run/crm-compatibility.XXXXXX)"
[[ "$compatibility_runtime" =~ ^/run/crm-compatibility\.[A-Za-z0-9]+$ ]] \
  || die 'mktemp returned an unexpected compatibility directory'
compatibility_catalog="$compatibility_runtime/target-catalog.tsv"
compatibility_report_temp="$compatibility_runtime/report"
compatibility_report="$INSTALL_DIR/.crm-compatibility-report"

cleanup_compatibility_runtime() {
  local status=$?
  if [[ -n "${compatibility_runtime:-}" \
     && "$compatibility_runtime" =~ ^/run/crm-compatibility\.[A-Za-z0-9]+$ \
     && -d "$compatibility_runtime" ]]; then
    rm -rf -- "$compatibility_runtime"
  fi
  return "$status"
}
trap cleanup_compatibility_runtime EXIT

docker exec supabase-db psql -XAt -F $'\t' -U postgres -d postgres \
  -v ON_ERROR_STOP=1 \
  -c "SELECT n.nspname, c.relname, a.attnum, a.attname
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      JOIN pg_attribute AS a ON a.attrelid = c.oid
      WHERE n.nspname IN ('auth', 'storage')
        AND c.relkind IN ('r', 'p')
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY n.nspname, c.relname, a.attnum;" \
  >"$compatibility_catalog"
chmod 0600 "$compatibility_catalog"

compatibility_passed='true'
if ! python3 "$COMPATIBILITY_CHECKER" \
    --data "$export_dir/data.sql" \
    --target-catalog "$compatibility_catalog" \
    --report "$compatibility_report_temp"; then
  compatibility_passed='false'
fi
require_file "$compatibility_report_temp"
chmod 0600 "$compatibility_report_temp"
mv -f -- "$compatibility_report_temp" "$compatibility_report"
rm -rf -- "$compatibility_runtime"
compatibility_runtime=''
trap - EXIT
[[ "$compatibility_passed" == 'true' ]] \
  || die "Auth/Storage compatibility blocked restore; review $compatibility_report on the rehearsal green"

# A falha a partir deste ponto pode deixar mutacoes duraveis no destino. O
# marcador fica presente ate que o COMMIT do restore seja confirmado.
write_restore_marker_atomic "$restore_in_progress_marker" 'in_progress' 'started_at_utc'

# A restored cron.job must never call production integrations before the
# operator explicitly opens the cutover gate.
docker exec supabase-db sh -ceu \
  'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -h 127.0.0.1 -X -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c "ALTER SYSTEM SET cron.launch_active_jobs = '\''off'\'';" -c "SELECT pg_reload_conf();"' \
  >/dev/null
[[ "$(docker exec supabase-db psql -XAt -U postgres -d postgres -c 'SHOW cron.launch_active_jobs;')" == 'off' ]] \
  || die 'não foi possível desabilitar a execução de pg_cron antes do restore'

restore_id="crm-restore-$(date -u +'%Y%m%dT%H%M%SZ')-$$"
container_restore_dir="/tmp/$restore_id"
[[ "$container_restore_dir" =~ ^/tmp/crm-restore-[A-Za-z0-9-]+$ ]] || die 'caminho temporário inesperado'

cleanup_container_files() {
  docker exec supabase-db rm -rf -- "$container_restore_dir" >/dev/null 2>&1 || true
}
trap cleanup_container_files EXIT

docker exec supabase-db install -d -m 0700 "$container_restore_dir"
docker cp "$export_dir/roles.sql" "supabase-db:$container_restore_dir/roles.sql"
docker cp "$export_dir/schema.sql" "supabase-db:$container_restore_dir/schema.sql"
docker cp "$export_dir/data.sql" "supabase-db:$container_restore_dir/data.sql"
docker cp "$DISABLE_CRON_SQL" "supabase-db:$container_restore_dir/disable-restored-cron.sql"

log 'Executando restore transacional com ON_ERROR_STOP'
docker exec -e RESTORE_DIR="$container_restore_dir" supabase-db sh -ceu \
  'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -h 127.0.0.1 -X -U supabase_admin -d postgres --single-transaction --variable ON_ERROR_STOP=1 --file "$RESTORE_DIR/roles.sql" --file "$RESTORE_DIR/schema.sql" --command "SET session_replication_role = replica" --file "$RESTORE_DIR/data.sql" --file "$RESTORE_DIR/disable-restored-cron.sql"'

# psql retorna sucesso apenas depois do COMMIT. Grave o estado duravel antes
# de qualquer tarefa auxiliar para que uma falha posterior nunca torne o
# restore concluido indistinguivel de um restore que sofreu rollback.
write_restore_marker_atomic "$restore_marker" 'restored' 'restored_at_utc'
rm -f -- "$restore_in_progress_marker"

log 'Atualizando estatísticas do PostgreSQL'
if ! docker exec supabase-db sh -ceu \
  'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -h 127.0.0.1 -X -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c "ANALYZE;"'; then
  warn 'restore foi confirmado e marcado, mas ANALYZE falhou; execute ANALYZE antes de liberar trafego'
fi

cleanup_container_files
trap - EXIT
log 'Restore concluído. Os serviços de aplicação permanecem parados até pós-restore e validação.'
