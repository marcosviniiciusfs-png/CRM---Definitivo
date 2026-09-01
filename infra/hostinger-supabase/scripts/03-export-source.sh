#!/usr/bin/env bash

# Export roles, schema and data from the managed Supabase source.
# The real source URI is never passed to the Supabase CLI, Docker argv or logs.
# shellcheck shell=bash

set -Eeuo pipefail
set +x
IFS=$'\n\t'
umask 077
ulimit -c 0 || exit 1

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

label="${1:-rehearsal}"
[[ "$label" =~ ^[a-zA-Z0-9._-]+$ ]] || die 'label inválido; use somente letras, números, ponto, hífen ou sublinhado'
[[ $# -le 1 ]] || die 'uso: 03-export-source.sh [label]'

require_root
load_versions
require_command awk docker grep mktemp openssl python3 realpath sha256sum stat supabase
docker info >/dev/null 2>&1 || die 'Docker daemon indisponível; o export usa a imagem de pg_dump fixada pela Supabase CLI'
[[ "$(supabase --version)" == "$SUPABASE_CLI_VERSION" ]] \
  || die "Supabase CLI precisa estar na versão $SUPABASE_CLI_VERSION"

MIGRATION_ENV_FILE="${MIGRATION_ENV_FILE:-/etc/crm-supabase/migration.env}"
load_env_file "$MIGRATION_ENV_FILE"
require_non_placeholder SOURCE_DB_URL
require_non_placeholder SOURCE_PROJECT_REF
require_non_placeholder SOURCE_EXPECTED_DATABASE
require_non_placeholder SOURCE_EXPECTED_DB_HOST
require_non_placeholder SOURCE_DB_SSL_ROOT_CERT

source_db_url="$SOURCE_DB_URL"
source_project_ref="$SOURCE_PROJECT_REF"
source_expected_database="$SOURCE_EXPECTED_DATABASE"
source_expected_db_host="${SOURCE_EXPECTED_DB_HOST,,}"
source_ssl_root_cert="$SOURCE_DB_SSL_ROOT_CERT"
artifact_root="${MIGRATION_ARTIFACT_DIR:-$BACKUP_DIR/migration}"

# load_env_file exports every assignment. Remove the entire migration file from
# the environment before starting the CLI or Docker; only validated, non-secret
# connection fields are later written to a protected temporary env file.
while IFS='=' read -r env_key _; do
  if [[ "$env_key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    unset "$env_key"
  fi
done <"$MIGRATION_ENV_FILE"
unset PGDATABASE PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGPASSFILE \
  PGSERVICE PGSERVICEFILE PGOPTIONS PGSSLMODE PGSSLROOTCERT
unset SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_PROJECT_ID \
  SUPABASE_NETWORK_ID SUPABASE_INTERNAL_IMAGE_REGISTRY

[[ "$source_db_url" =~ ^postgres(ql)?:// ]] || die 'SOURCE_DB_URL deve ser uma URI PostgreSQL'
[[ "$source_db_url" != *$'\n'* && "$source_db_url" != *$'\r'* ]] || die 'SOURCE_DB_URL inválida'
[[ "$source_project_ref" =~ ^[a-z0-9]{20}$ ]] || die 'SOURCE_PROJECT_REF inválido'
[[ "$source_expected_database" =~ ^[A-Za-z0-9_]+$ ]] || die 'SOURCE_EXPECTED_DATABASE inválido'
[[ "$source_expected_db_host" =~ ^[a-z0-9.-]+$ ]] || die 'SOURCE_EXPECTED_DB_HOST inválido'
[[ "$source_expected_db_host" == "db.$source_project_ref.supabase.co" \
   || "$source_expected_db_host" =~ ^[a-z0-9-]+\.pooler\.supabase\.com$ ]] \
  || die 'SOURCE_EXPECTED_DB_HOST não é um endpoint oficial Supabase reconhecido'

# Queries/options are intentionally forbidden. Besides preventing sslmode or
# options overrides, this keeps parsing fail-closed and makes PGHOST the exact
# name whose certificate is validated by libpq verify-full.
uri_regex='^postgres(ql)?://([^/:@]+):([^/?#@]+)@([^/:?#]+)(:[0-9]+)?/([^/?#]+)$'
[[ "$source_db_url" =~ $uri_regex ]] \
  || die 'SOURCE_DB_URL deve ser canônica, conter senha e não ter query/options'
uri_user="${BASH_REMATCH[2]}"
encoded_password="${BASH_REMATCH[3]}"
uri_host="${BASH_REMATCH[4],,}"
uri_port="${BASH_REMATCH[5]#:}"
uri_database="${BASH_REMATCH[6]}"
uri_port="${uri_port:-5432}"
[[ "$encoded_password" != *[[:space:]]* ]] || die 'senha da URI precisa ter espaços percent-encoded'

[[ "$uri_host" == "$source_expected_db_host" ]] || die 'host da SOURCE_DB_URL não é o host esperado'
[[ "$uri_port" == '5432' ]] || die 'export exige conexão direta/session-pooler na porta 5432; transaction pooler recusado'
[[ "$uri_database" == "$source_expected_database" ]] || die 'database da SOURCE_DB_URL não é o database esperado'
if [[ "$source_expected_db_host" == "db.$source_project_ref.supabase.co" ]]; then
  [[ "$uri_user" == 'postgres' ]] || die 'usuário da URI direta deveria ser postgres'
else
  [[ "$uri_user" == "postgres.$source_project_ref" ]] \
    || die 'usuário do session pooler não contém o project ref esperado'
fi

[[ "$source_ssl_root_cert" == /* ]] || die 'SOURCE_DB_SSL_ROOT_CERT precisa ser absoluto'
require_file "$source_ssl_root_cert"
source_ssl_root_cert="$(realpath -e -- "$source_ssl_root_cert")"
[[ "$source_ssl_root_cert" != *','* ]] || die 'caminho do certificado CA contém caractere não suportado'
cert_mode="$(stat -c '%a' "$source_ssl_root_cert")"
cert_numeric_mode=$((8#$cert_mode))
[[ "$(stat -c '%u' "$source_ssl_root_cert")" == '0' ]] \
  || die 'certificado CA da origem precisa pertencer a root'
(( (cert_numeric_mode & 8#022) == 0 )) \
  || die 'certificado CA da origem não pode ser gravável por grupo/outros'
openssl x509 -in "$source_ssl_root_cert" -noout >/dev/null 2>&1 \
  || die 'SOURCE_DB_SSL_ROOT_CERT não contém um certificado X.509 PEM válido'

[[ "$artifact_root" == /* ]] || die 'MIGRATION_ARTIFACT_DIR precisa ser absoluto'
[[ "$artifact_root" != '/' && "$artifact_root" != '/var' && "$artifact_root" != '/opt' ]] \
  || die 'MIGRATION_ARTIFACT_DIR amplo demais'

timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
output_dir="$artifact_root/${timestamp}-${label}"
[[ ! -e "$output_dir" ]] || die "diretório de export já existe: $output_dir"
install -d -m 0700 "$artifact_root" "$output_dir"

runtime_dir="$(mktemp -d /run/crm-source-export.XXXXXX)"
[[ "$runtime_dir" =~ ^/run/crm-source-export\.[A-Za-z0-9]+$ ]] \
  || die 'mktemp retornou um diretório de runtime inesperado'
password_file="$runtime_dir/source-db-password"
connection_env_file="$runtime_dir/connection.env"
wrapper_file="$runtime_dir/with-password.sh"
cli_workdir="$runtime_dir/cli-workdir"

cleanup_export() {
  local status=$?
  set +x
  unset source_db_url encoded_password
  if [[ -n "${runtime_dir:-}" \
     && "$runtime_dir" =~ ^/run/crm-source-export\.[A-Za-z0-9]+$ \
     && -d "$runtime_dir" ]]; then
    rm -rf -- "$runtime_dir"
  fi
  if (( status != 0 )); then
    warn "export incompleto preservado para diagnóstico em $output_dir"
  fi
  trap - EXIT
  exit "$status"
}
trap cleanup_export EXIT

# Decode only the password component through stdin. The real URI and decoded
# password never appear in a child argv or environment.
if ! printf '%s' "$encoded_password" | python3 -c '
import re
import sys
import urllib.parse

raw = sys.stdin.read()
if not raw or re.search(r"%(?![0-9A-Fa-f]{2})", raw):
    raise SystemExit(1)
try:
    decoded = urllib.parse.unquote(raw, encoding="utf-8", errors="strict")
except (UnicodeDecodeError, ValueError):
    raise SystemExit(1)
if not decoded or any(ch in decoded for ch in ("\x00", "\r", "\n")):
    raise SystemExit(1)
sys.stdout.write(decoded)
' >"$password_file" 2>/dev/null; then
  die 'senha da SOURCE_DB_URL contém percent-encoding ou caractere de controle inválido'
fi
unset encoded_password source_db_url
chmod 0600 "$password_file"
require_secret_file "$password_file"
[[ -s "$password_file" ]] || die 'senha decodificada da origem está vazia'

cat >"$connection_env_file" <<EOF
PGHOST=$uri_host
PGPORT=$uri_port
PGUSER=$uri_user
PGDATABASE=$uri_database
PGSSLMODE=verify-full
PGSSLROOTCERT=/run/secrets/source-db-ca.crt
PGCONNECT_TIMEOUT=15
PGAPPNAME=crm-migration-export
LC_ALL=C
EOF
chmod 0600 "$connection_env_file"

cat >"$wrapper_file" <<'WRAPPER'
#!/usr/bin/env bash
set -Eeuo pipefail
set +x
umask 077
ulimit -c 0
export PGPASSWORD="$(cat /run/secrets/source-db-password)"
[[ -n "$PGPASSWORD" ]]
exec "$@"
WRAPPER
chmod 0700 "$wrapper_file"

install -d -m 0700 "$cli_workdir/supabase"
cat >"$cli_workdir/supabase/config.toml" <<EOF
project_id = "crm-source-export"

[db]
major_version = $POSTGRES_MAJOR
EOF
chmod 0600 "$cli_workdir/supabase/config.toml"

render_dump_script() {
  local mode="$1"
  local destination="$2"
  shift 2
  local raw="$runtime_dir/$mode.raw.sh"
  local cli_stderr="$runtime_dir/$mode.cli.stderr"
  local dummy_url='postgresql://dump_guard@127.0.0.1:1/postgres'

  # The dummy endpoint prevents the real source URI/password from ever reaching
  # the CLI. --dry-run performs no database connection and renders the exact
  # Supabase-maintained filters for the pinned CLI version.
  if ! supabase --workdir "$cli_workdir" db dump \
      --db-url "$dummy_url" --dry-run "$@" >"$raw" 2>"$cli_stderr"; then
    die "Supabase CLI não conseguiu gerar o template oficial de $mode; export recusado"
  fi

  grep -Fxq '#!/usr/bin/env bash' "$raw" || die "template da CLI inválido para $mode"
  grep -Fxq 'set -euo pipefail' "$raw" || die "template da CLI sem fail-closed para $mode"
  if grep -Eq 'postgres(ql)?://|PGSSLMODE|PGSSLROOTCERT|PGSERVICE|PGHOSTADDR' "$raw"; then
    die "template da CLI contém transporte/conexão inesperado para $mode"
  fi

  case "$mode" in
    roles)
      grep -Eq '^pg_dumpall[[:space:]]*\\$' "$raw" || die 'template oficial de roles não usa pg_dumpall'
      grep -Fq -- '--roles-only' "$raw" || die 'template oficial de roles não contém --roles-only'
      ;;
    schema)
      grep -Eq '^pg_dump[[:space:]]*\\$' "$raw" || die 'template oficial de schema não usa pg_dump'
      grep -Fq -- '--schema-only' "$raw" || die 'template oficial de schema não contém --schema-only'
      ;;
    data)
      grep -Eq '^pg_dump[[:space:]]*\\$' "$raw" || die 'template oficial de dados não usa pg_dump'
      grep -Fq -- '--data-only' "$raw" || die 'template oficial de dados não contém --data-only'
      ;;
    *) die 'modo interno de export inválido' ;;
  esac

  # Dry-run expands the five connection variables with dummy values. Replace
  # only those five exact lines, once each, so the official body remains
  # unchanged and consumes the protected container environment at execution.
  awk '
    $0 == "export PGHOST=\"127.0.0.1\"" { print "export PGHOST"; host++; next }
    $0 == "export PGPORT=\"1\"" { print "export PGPORT"; port++; next }
    $0 == "export PGUSER=\"dump_guard\"" { print "export PGUSER"; user++; next }
    $0 == "export PGPASSWORD=\"\"" { print "export PGPASSWORD"; password++; next }
    $0 == "export PGDATABASE=\"postgres\"" { print "export PGDATABASE"; database++; next }
    { print }
    END {
      if (host != 1 || port != 1 || user != 1 || password != 1 || database != 1) exit 42
    }
  ' "$raw" >"$destination" \
    || die "template da CLI divergiu do formato auditado para $mode; export recusado"
  chmod 0700 "$destination"
}

roles_script="$runtime_dir/roles.sh"
schema_script="$runtime_dir/schema.sh"
data_script="$runtime_dir/data.sh"
render_dump_script roles "$roles_script" --role-only
render_dump_script schema "$schema_script"
render_dump_script data "$data_script" --use-copy --data-only

docker_base=(
  run --rm --pull=missing --network host --user 0:0
  --env-file "$connection_env_file"
  --mount "type=bind,src=$password_file,dst=/run/secrets/source-db-password,readonly"
  --mount "type=bind,src=$source_ssl_root_cert,dst=/run/secrets/source-db-ca.crt,readonly"
  --mount "type=bind,src=$wrapper_file,dst=/run/migration/with-password.sh,readonly"
)

# A successful libpq connection with sslmode=verify-full proves both encryption
# and CA/hostname validation. The query additionally fails closed on a wrong
# database or an incompatible PostgreSQL major without printing connection data.
preflight_stderr="$runtime_dir/preflight.stderr"
if ! preflight="$({
  docker "${docker_base[@]}" "$SUPABASE_CLI_DB_IMAGE" \
    bash /run/migration/with-password.sh \
    psql -X -w -Atq --no-psqlrc --set ON_ERROR_STOP=1 \
      -c "SELECT current_database(), current_setting('server_version_num')::integer;"
} 2>"$preflight_stderr")"; then
  die 'preflight TLS verify-full da origem falhou; nenhum dump foi aceito'
fi
IFS='|' read -r connected_database server_version_num <<<"$preflight"
[[ "$connected_database" == "$source_expected_database" ]] \
  || die 'preflight conectou ao database inesperado'
[[ "$server_version_num" =~ ^[0-9]+$ ]] || die 'preflight retornou versão PostgreSQL inválida'
(( server_version_num / 10000 == POSTGRES_MAJOR )) \
  || die "origem não está no PostgreSQL major $POSTGRES_MAJOR"

run_dump() {
  local mode="$1"
  local script="$2"
  local destination="$3"
  local stderr_file="$runtime_dir/$mode.dump.stderr"

  if ! docker "${docker_base[@]}" \
      --mount "type=bind,src=$script,dst=/run/migration/dump.sh,readonly" \
      "$SUPABASE_CLI_DB_IMAGE" \
      bash /run/migration/with-password.sh bash /run/migration/dump.sh \
      >"$destination" 2>"$stderr_file"; then
    die "dump de $mode falhou sob TLS verify-full; diagnóstico não foi enviado aos logs"
  fi
  [[ -s "$destination" ]] || die "dump de $mode ficou vazio"
  chmod 0600 "$destination"
}

log 'Exportando roles com filtros oficiais e TLS verify-full'
run_dump roles "$roles_script" "$output_dir/roles.sql"
log 'Exportando schema com filtros oficiais e TLS verify-full'
run_dump schema "$schema_script" "$output_dir/schema.sql"
log 'Exportando dados em COPY com filtros oficiais e TLS verify-full'
run_dump data "$data_script" "$output_dir/data.sql"

cat >"$output_dir/METADATA" <<EOF
created_at_utc=$timestamp
label=$label
supabase_cli=$SUPABASE_CLI_VERSION
supabase_cli_db_image=$SUPABASE_CLI_DB_IMAGE
transport=tls-verify-full
template_source=supabase-cli-dry-run-with-dummy-endpoint
EOF
chmod 0600 "$output_dir/METADATA"
(
  cd "$output_dir"
  sha256sum roles.sql schema.sql data.sql METADATA >SHA256SUMS
)
chmod 0600 "$output_dir/SHA256SUMS"

[[ "$runtime_dir" =~ ^/run/crm-source-export\.[A-Za-z0-9]+$ ]] \
  || die 'diretório de runtime mudou durante o export; remoção recusada'
rm -rf -- "$runtime_dir"
runtime_dir=''
trap - EXIT
log "Export concluído: $output_dir"
