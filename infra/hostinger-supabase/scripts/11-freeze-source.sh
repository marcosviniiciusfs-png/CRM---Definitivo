#!/usr/bin/env bash

# Freeze the managed Supabase source for the final cutover.
# This script is intentionally not called by any other automation.
# shellcheck shell=bash

# Secrets must never be exposed if the caller inherited xtrace. Core dumps are
# disabled before any configuration or credential is loaded.
set +x
ulimit -c 0 2>/dev/null || true
set -Eeuo pipefail
IFS=$'\n\t'
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

usage() {
  cat >&2 <<'USAGE'
Uso:
  11-freeze-source.sh --preflight
  11-freeze-source.sh --confirm-freeze-source

Execute somente depois de ativar a manutenção na Vercel e pausar webhooks,
broadcasts, importações e demais produtores externos de escrita.
USAGE
  exit 2
}

[[ $# -eq 1 ]] || usage
case "$1" in
  --preflight) operation_mode='preflight' ;;
  --confirm-freeze-source) operation_mode='freeze' ;;
  *) usage ;;
esac

require_root
load_versions
require_command awk flock install mktemp mv psql python3 realpath sha256sum stat sync

# Parse the migration file as data, not as shell code. Only the values used by
# this script are assigned, and none is exported to child processes.
load_migration_env_file() {
  local file="$1"
  local line key value quote
  local -A seen_keys=()

  require_secret_file "$file"
  unset SOURCE_DB_URL SOURCE_PROJECT_REF SOURCE_EXPECTED_DATABASE \
    SOURCE_EXPECTED_DB_HOST SOURCE_DB_SSL_ROOT_CERT CUTOVER_STATE_DIR

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" != *$'\r'* ]] || die "caractere CR inesperado em $file"
    [[ -z "$line" || "$line" == \#* ]] && continue
    [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] \
      || die "linha invalida em $file; use somente CHAVE=valor"

    key="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    [[ -z "${seen_keys[$key]+present}" ]] || die "chave duplicada em $file: $key"
    seen_keys["$key"]=1
    export -n "${key?}" 2>/dev/null || true

    quote=''
    if [[ "$value" == \"* || "$value" == \'* ]]; then
      quote="${value:0:1}"
      [[ ${#value} -ge 2 && "${value: -1}" == "$quote" ]] \
        || die "aspas nao balanceadas para $key em $file"
      value="${value:1:${#value}-2}"
      [[ "$value" != *"$quote"* ]] \
        || die "aspas internas nao sao aceitas para $key em $file"
    elif [[ "$value" == *\" || "$value" == *\' ]]; then
      die "aspas nao balanceadas para $key em $file"
    fi
    [[ "$value" != *[[:space:]]* ]] \
      || die "espacos devem ser percent-encoded em $key"

    case "$key" in
      SOURCE_DB_URL|SOURCE_PROJECT_REF|SOURCE_EXPECTED_DATABASE|SOURCE_EXPECTED_DB_HOST|SOURCE_DB_SSL_ROOT_CERT|CUTOVER_STATE_DIR)
        printf -v "$key" '%s' "$value"
        ;;
    esac
  done <"$file"
}

requested_cutover_state_dir="${CUTOVER_STATE_DIR:-}"
MIGRATION_ENV_FILE="${MIGRATION_ENV_FILE:-/etc/crm-supabase/migration.env}"
load_migration_env_file "$MIGRATION_ENV_FILE"
declare SOURCE_DB_URL SOURCE_PROJECT_REF SOURCE_EXPECTED_DATABASE \
  SOURCE_EXPECTED_DB_HOST SOURCE_DB_SSL_ROOT_CERT CUTOVER_STATE_DIR
require_non_placeholder SOURCE_DB_URL
require_non_placeholder SOURCE_PROJECT_REF
require_non_placeholder SOURCE_EXPECTED_DATABASE
require_non_placeholder SOURCE_EXPECTED_DB_HOST
require_non_placeholder SOURCE_DB_SSL_ROOT_CERT

unset source_db_url source_project_ref source_expected_database \
  source_expected_db_host source_ssl_root_cert artifact_root encoded_password \
  uri_user uri_host uri_port uri_database runtime_dir pgpass_file
source_db_url="$SOURCE_DB_URL"
source_project_ref="$SOURCE_PROJECT_REF"
source_expected_database="$SOURCE_EXPECTED_DATABASE"
source_expected_db_host="$SOURCE_EXPECTED_DB_HOST"
source_ssl_root_cert="$SOURCE_DB_SSL_ROOT_CERT"
artifact_root="${requested_cutover_state_dir:-${CUTOVER_STATE_DIR:-$BACKUP_DIR/cutover-state}}"

# Drop every parsed value after copying the required fields. The password
# survives only in source_db_url until the protected pgpass file is built.
unset SOURCE_DB_URL SOURCE_PROJECT_REF SOURCE_EXPECTED_DATABASE \
  SOURCE_EXPECTED_DB_HOST SOURCE_DB_SSL_ROOT_CERT CUTOVER_STATE_DIR
unset PGDATABASE PGHOST PGHOSTADDR PGPORT PGUSER PGPASSWORD PGPASSFILE \
  PGSERVICE PGSERVICEFILE PGOPTIONS

[[ "$source_db_url" =~ ^postgres(ql)?:// ]] || die 'SOURCE_DB_URL deve ser uma URI PostgreSQL'
[[ "$source_db_url" != *$'\n'* && "$source_db_url" != *$'\r'* ]] || die 'SOURCE_DB_URL inválida'
[[ "$source_project_ref" =~ ^[a-z0-9]{20}$ ]] || die 'SOURCE_PROJECT_REF inválido'
[[ "$source_expected_database" =~ ^[A-Za-z0-9_]+$ ]] || die 'SOURCE_EXPECTED_DATABASE inválido'
[[ "$source_expected_db_host" =~ ^[a-z0-9.-]+$ ]] || die 'SOURCE_EXPECTED_DB_HOST inválido'
[[ "$source_expected_db_host" == "db.$source_project_ref.supabase.co" \
   || "$source_expected_db_host" =~ ^[a-z0-9-]+\.pooler\.supabase\.com$ ]] \
  || die 'SOURCE_EXPECTED_DB_HOST não é um endpoint oficial Supabase reconhecido'

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
[[ "${uri_host,,}" == "$source_expected_db_host" ]] || die 'host da SOURCE_DB_URL não é o host esperado'
[[ "$uri_port" == '5432' ]] || die 'freeze exige conexão direta/session-pooler na porta 5432; transaction pooler recusado'
[[ "$uri_database" == "$source_expected_database" ]] || die 'database da SOURCE_DB_URL não é o database esperado'
if [[ "$source_expected_db_host" == "db.$source_project_ref.supabase.co" ]]; then
  [[ "$uri_user" == 'postgres' ]] || die 'usuário da URI direta deveria ser postgres'
else
  [[ "$uri_user" == "postgres.$source_project_ref" ]] || die 'usuário do session pooler não contém o project ref esperado'
fi

[[ "$source_ssl_root_cert" == /* ]] || die 'SOURCE_DB_SSL_ROOT_CERT precisa ser absoluto'
require_file "$source_ssl_root_cert"
source_ssl_root_cert="$(realpath -e -- "$source_ssl_root_cert")"
cert_mode="$(stat -c '%a' "$source_ssl_root_cert")"
cert_numeric_mode=$((8#$cert_mode))
[[ "$(stat -c '%u' "$source_ssl_root_cert")" == '0' ]] || die 'certificado CA da origem precisa pertencer a root'
(( (cert_numeric_mode & 8#022) == 0 )) || die 'certificado CA da origem não pode ser gravável por grupo/outros'

# libpq does not expand a URI supplied through PGDATABASE. Decode only the
# password component into a root-only pgpass file and pass every connection
# field separately, keeping credentials out of argv, command history and logs.
runtime_dir="$(mktemp -d /run/crm-source-freeze.XXXXXX)"
[[ "$runtime_dir" =~ ^/run/crm-source-freeze\.[A-Za-z0-9]+$ ]] \
  || die 'mktemp retornou um diretório de runtime inesperado'
pgpass_file="$runtime_dir/pgpass"

cleanup_connection() {
  set +x
  unset encoded_password source_db_url PGPASSWORD PGPASSFILE
  if [[ -n "${runtime_dir:-}" \
     && "$runtime_dir" =~ ^/run/crm-source-freeze\.[A-Za-z0-9]+$ \
     && -d "$runtime_dir" ]]; then
    rm -rf -- "$runtime_dir"
  fi
}
trap cleanup_connection EXIT

if ! printf '%s' "$encoded_password" | python3 -c '
import re
import sys
import urllib.parse

host, port, database, user = sys.argv[1:]
raw = sys.stdin.read()
if not raw or re.search(r"%(?![0-9A-Fa-f]{2})", raw):
    raise SystemExit(1)
password = urllib.parse.unquote(raw, encoding="utf-8", errors="strict")
if not password or any(ch in password for ch in ("\x00", "\r", "\n")):
    raise SystemExit(1)

def escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace(":", "\\:")

sys.stdout.write(":".join(escape(value) for value in (host, port, database, user, password)) + "\n")
' "$uri_host" "$uri_port" "$uri_database" "$uri_user" >"$pgpass_file" 2>/dev/null
then
  die 'senha da SOURCE_DB_URL contém percent-encoding ou caractere de controle inválido'
fi
chmod 0600 "$pgpass_file"
require_secret_file "$pgpass_file"
[[ -s "$pgpass_file" ]] || die 'pgpass da origem está vazio'
unset encoded_password source_db_url
[[ "$artifact_root" == /* ]] || die 'CUTOVER_STATE_DIR precisa ser absoluto'
[[ "$artifact_root" != '/' && "$artifact_root" != '/var' && "$artifact_root" != '/opt' ]] \
  || die 'CUTOVER_STATE_DIR amplo demais'

exec 9>/run/lock/crm-source-cutover.lock
flock -n 9 || die 'outra operação de freeze/unfreeze está em execução'

source_psql() {
  PGHOST="$uri_host" \
  PGPORT="$uri_port" \
  PGUSER="$uri_user" \
  PGDATABASE="$uri_database" \
  PGPASSFILE="$pgpass_file" \
  PGAPPNAME='crm-cutover-freeze' \
  PGCONNECT_TIMEOUT=15 \
  PGSSLMODE=verify-full \
  PGSSLROOTCERT="$source_ssl_root_cert" \
  PGOPTIONS='-c statement_timeout=60s -c lock_timeout=10s' \
    psql -X -w --no-psqlrc --set ON_ERROR_STOP=1 "$@"
}

source_psql_rw() {
  PGHOST="$uri_host" \
  PGPORT="$uri_port" \
  PGUSER="$uri_user" \
  PGDATABASE="$uri_database" \
  PGPASSFILE="$pgpass_file" \
  PGAPPNAME='crm-cutover-freeze-admin' \
  PGCONNECT_TIMEOUT=15 \
  PGSSLMODE=verify-full \
  PGSSLROOTCERT="$source_ssl_root_cert" \
  PGOPTIONS='-c default_transaction_read_only=off -c statement_timeout=60s -c lock_timeout=10s' \
    psql -X -w --no-psqlrc --set ON_ERROR_STOP=1 "$@"
}

validate_cron_state() {
  local file="$1"
  awk -F '\t' '
    NF != 2 || $1 !~ /^[0-9]+$/ || $2 !~ /^(t|f)$/ { exit 1 }
  ' "$file" || die "estado de cron inválido: $file"
}

require_private_root_dir() {
  local directory="$1"
  local owner mode

  [[ -d "$directory" && ! -L "$directory" ]] || die "diretorio protegido invalido: $directory"
  owner="$(stat -c '%u' "$directory")"
  mode="$(stat -c '%a' "$directory")"
  [[ "$owner" == '0' ]] || die "$directory precisa pertencer a root"
  [[ "$mode" == '700' ]] || die "permissao insegura em $directory ($mode); use chmod 700"
}

write_state_manifest() {
  local include_frozen="$1"
  local pending="$state_dir/.SHA256SUMS.pending"

  rm -f -- "$pending"
  if [[ "$include_frozen" == true ]]; then
    (
      cd "$state_dir"
      sha256sum database-default.state cron-state.tsv METADATA FROZEN
    ) >"$pending"
  else
    (
      cd "$state_dir"
      sha256sum database-default.state cron-state.tsv METADATA
    ) >"$pending"
  fi
  chmod 0600 "$pending"
  sync -f "$pending"
  mv -f -- "$pending" "$state_dir/SHA256SUMS"
  sync -f "$state_dir"
}

write_atomic_marker() {
  local marker="$1"
  shift
  local pending="$state_dir/.${marker}.pending"

  [[ "$marker" =~ ^(FROZEN|ROLLED_BACK|RECOVERY_REQUIRED)$ ]] || return 1
  rm -f -- "$pending"
  printf '%s\n' "$@" >"$pending"
  chmod 0600 "$pending"
  sync -f "$pending"
  mv -f -- "$pending" "$state_dir/$marker"
  sync -f "$state_dir"
}

cleanup_pending_state_files() {
  rm -f -- \
    "$state_dir/.FROZEN.pending" \
    "$state_dir/.ROLLED_BACK.pending" \
    "$state_dir/.RECOVERY_REQUIRED.pending" \
    "$state_dir/.SHA256SUMS.pending"
}

async_work_counts() {
  local running_jobs pending_requests queue_exists

  running_jobs="$(source_psql -Atq -c "SELECT count(*) FROM cron.job_run_details WHERE status = 'running';")"
  queue_exists="$(source_psql -Atq -c "SELECT to_regclass('net.http_request_queue') IS NOT NULL;")"
  if [[ "$queue_exists" == 't' ]]; then
    pending_requests="$(source_psql -Atq -c 'SELECT count(*) FROM net.http_request_queue;')"
  else
    pending_requests=0
  fi
  [[ "$running_jobs" =~ ^[0-9]+$ && "$pending_requests" =~ ^[0-9]+$ ]] \
    || return 1
  printf '%s\t%s\n' "$running_jobs" "$pending_requests"
}

wait_for_async_quiescence() {
  local timeout_seconds="${1:-30}"
  local deadline=$((SECONDS + timeout_seconds))
  local counts running_jobs pending_requests

  while :; do
    counts="$(async_work_counts)"
    IFS=$'\t' read -r running_jobs pending_requests <<<"$counts"
    if [[ "$running_jobs" == '0' && "$pending_requests" == '0' ]]; then
      return 0
    fi
    (( SECONDS < deadline )) || break
    sleep 1
  done

  warn "origem não drenou: cron_running=$running_jobs, pg_net_pending=$pending_requests"
  return 1
}

restore_database_default() {
  local state
  state="$(<"$state_dir/database-default.state")"
  case "$state" in
    RESET)
      source_psql_rw -q <<'SQL'
SELECT format(
  'ALTER DATABASE %I RESET default_transaction_read_only;',
  current_database()
)
\gexec
SQL
      ;;
    off)
      source_psql_rw -q <<'SQL'
SELECT format(
  'ALTER DATABASE %I SET default_transaction_read_only = off;',
  current_database()
)
\gexec
SQL
      ;;
    *)
      return 1
      ;;
  esac
}

restore_cron_state() {
  {
    cat <<'SQL'
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
CREATE TEMP TABLE crm_expected_cron_state (
  jobid bigint PRIMARY KEY,
  active boolean NOT NULL
) ON COMMIT DROP;
COPY crm_expected_cron_state (jobid, active) FROM STDIN;
SQL
    cat -- "$state_dir/cron-state.tsv"
    printf '\\.\n'
    cat <<'SQL'
DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job AS current_job
    FULL JOIN crm_expected_cron_state AS expected USING (jobid)
    WHERE current_job.jobid IS NULL
       OR expected.jobid IS NULL
       OR current_job.active IS DISTINCT FROM false
  ) THEN
    RAISE EXCEPTION 'cron.job divergiu durante o freeze; restauração automática recusada';
  END IF;
END;
$block$;
SELECT cron.alter_job(expected.jobid, active := expected.active)
FROM crm_expected_cron_state AS expected
ORDER BY expected.jobid;
DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job AS current_job
    FULL JOIN crm_expected_cron_state AS expected USING (jobid)
    WHERE current_job.jobid IS NULL
       OR expected.jobid IS NULL
       OR current_job.active IS DISTINCT FROM expected.active
  ) THEN
    RAISE EXCEPTION 'cron.job não retornou ao estado capturado; restauração recusada';
  END IF;
END;
$block$;
COMMIT;
SQL
  } | source_psql_rw -q >/dev/null
}

classify_cron_state() {
  {
    cat <<'SQL'
BEGIN;
CREATE TEMP TABLE crm_expected_cron_state (
  jobid bigint PRIMARY KEY,
  active boolean NOT NULL
) ON COMMIT DROP;
COPY crm_expected_cron_state (jobid, active) FROM STDIN;
SQL
    cat -- "$state_dir/cron-state.tsv"
    printf '\\.\n'
    cat <<'SQL'
SELECT CASE
  WHEN NOT EXISTS (
    SELECT 1
    FROM cron.job AS current_job
    FULL JOIN crm_expected_cron_state AS expected USING (jobid)
    WHERE current_job.jobid IS NULL
       OR expected.jobid IS NULL
       OR current_job.active IS DISTINCT FROM expected.active
  ) THEN 'original'
  WHEN NOT EXISTS (
    SELECT 1
    FROM cron.job AS current_job
    FULL JOIN crm_expected_cron_state AS expected USING (jobid)
    WHERE current_job.jobid IS NULL
       OR expected.jobid IS NULL
       OR current_job.active IS DISTINCT FROM false
  ) THEN 'all_false'
  ELSE 'divergent'
END;
ROLLBACK;
SQL
  } | source_psql_rw -Atq
}

current_database_default() {
  source_psql_rw -Atq <<'SQL'
SELECT coalesce((
  SELECT split_part(config.value, '=', 2)
  FROM pg_db_role_setting AS setting
  CROSS JOIN LATERAL unnest(setting.setconfig) AS config(value)
  WHERE setting.setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database())
    AND setting.setrole = 0
    AND config.value LIKE 'default_transaction_read_only=%'
), 'RESET');
SQL
}

database_matches_original() {
  local expected catalog_state effective_state

  expected="$(<"$state_dir/database-default.state")"
  catalog_state="$(current_database_default)" || return 1
  effective_state="$(source_psql -Atq -c "SELECT current_setting('transaction_read_only');")" || return 1
  [[ "$catalog_state" == "$expected" && "$effective_state" == 'off' ]]
}

is_valid_cutoff() {
  [[ "$1" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}[T[:space:]][0-9]{2}:[0-9]{2}:[0-9]{2} ]]
}

terminate_clients_started_before() {
  local cutoff="$1"
  local _attempt remaining

  export CRM_CUTOVER_SESSION_CUTOFF="$cutoff"
  {
    printf '%s\n' '\getenv session_cutoff CRM_CUTOVER_SESSION_CUTOFF'
    cat <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity AS activity
WHERE activity.datname = current_database()
  AND activity.pid <> pg_backend_pid()
  AND (activity.backend_type = 'client backend' OR activity.backend_type = 'pg_cron worker')
  AND activity.backend_start <= :'session_cutoff'::timestamptz
  AND NOT EXISTS (
    SELECT 1
    FROM pg_roles AS role_row
    WHERE role_row.rolname = activity.usename
      AND role_row.rolsuper
  );
SQL
  } | source_psql_rw -q >/dev/null

  for _attempt in {1..10}; do
    remaining="$({
      printf '%s\n' '\getenv session_cutoff CRM_CUTOVER_SESSION_CUTOFF'
      cat <<'SQL'
SELECT count(*)
FROM pg_stat_activity AS activity
WHERE activity.datname = current_database()
  AND activity.pid <> pg_backend_pid()
  AND (activity.backend_type = 'client backend' OR activity.backend_type = 'pg_cron worker')
  AND activity.backend_start <= :'session_cutoff'::timestamptz
  AND NOT EXISTS (
    SELECT 1
    FROM pg_roles AS role_row
    WHERE role_row.rolname = activity.usename
      AND role_row.rolsuper
  );
SQL
    } | source_psql_rw -Atq)"
    if [[ "$remaining" == '0' ]]; then
      unset CRM_CUTOVER_SESSION_CUTOFF
      return 0
    fi
    sleep 1
  done

  unset CRM_CUTOVER_SESSION_CUTOFF
  warn "$remaining sessão(ões) anterior(es) ao freeze não encerraram em 10 segundos"
  return 1
}

preflight="$({
  cat <<'SQL'
SELECT concat_ws(E'\t',
  current_database(),
  coalesce(inet_server_addr()::text, 'local'),
  coalesce((SELECT ssl::text FROM pg_stat_ssl WHERE pid = pg_backend_pid()), 'false'),
  (SELECT (role_row.rolsuper OR pg_has_role(current_user, database_row.datdba, 'MEMBER'))::text
   FROM pg_database AS database_row
   CROSS JOIN pg_roles AS role_row
   WHERE database_row.datname = current_database()
     AND role_row.rolname = current_user),
  has_function_privilege(current_user, 'pg_catalog.pg_terminate_backend(integer,bigint)', 'EXECUTE')::text,
  (SELECT (role_row.rolsuper OR pg_has_role(current_user, 'pg_read_all_stats', 'MEMBER'))::text
   FROM pg_roles AS role_row
   WHERE role_row.rolname = current_user),
  current_setting('transaction_read_only'),
  (SELECT count(*)::text
   FROM pg_db_role_setting AS role_setting
   CROSS JOIN LATERAL unnest(role_setting.setconfig) AS config(value)
   WHERE role_setting.setrole <> 0
     AND (role_setting.setdatabase = 0 OR role_setting.setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database()))
     AND (
       (config.value LIKE 'default_transaction_read_only=%'
        AND config.value <> 'default_transaction_read_only=on')
       OR
       (config.value LIKE 'supabase_read_only_user=%'
        AND config.value <> 'supabase_read_only_user=on')
     )),
  (to_regclass('cron.job') IS NOT NULL)::text,
  (to_regclass('cron.job_run_details') IS NOT NULL)::text,
  (SELECT (count(*) = 1)::text
   FROM pg_proc AS procedure
   JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
   WHERE namespace.nspname = 'cron'
     AND procedure.proname = 'alter_job'),
  (SELECT coalesce(bool_and(has_function_privilege(current_user, procedure.oid, 'EXECUTE')), false)::text
   FROM pg_proc AS procedure
   JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
   WHERE namespace.nspname = 'cron'
     AND procedure.proname = 'alter_job'),
  (NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE username IS DISTINCT FROM current_user
  ))::text
);
SQL
} | source_psql -Atq)"

IFS=$'\t' read -r actual_database server_address ssl_active owns_database can_terminate can_inspect read_only unsafe_role_overrides cron_exists cron_details_exists alter_job_exists can_alter_jobs owns_all_cron_jobs <<<"$preflight"
[[ "$actual_database" == "$source_expected_database" ]] \
  || die "banco conectado não é o esperado (esperado=$source_expected_database; recebido=$actual_database)"
[[ "$ssl_active" == 'true' ]] || die 'a conexão à origem não está usando TLS'
[[ "$owns_database" == 'true' ]] || die 'a role da conexão não pode alterar a configuração do banco'
[[ "$can_terminate" == 'true' ]] || die 'a role da conexão não pode executar pg_terminate_backend'
[[ "$can_inspect" == 'true' ]] || die 'a role da conexão não possui visibilidade completa de pg_stat_activity'
[[ "$read_only" == 'off' ]] || die 'a conexão de origem já está somente leitura; estado inicial ambíguo'
[[ "$unsafe_role_overrides" == '0' ]] \
  || die 'há ALTER ROLE permitindo escrita apesar do freeze; operação automática recusada'
[[ "$cron_exists" == 'true' ]] || die 'cron.job não existe na origem; inventário esperado não confere'
[[ "$cron_details_exists" == 'true' ]] || die 'cron.job_run_details não existe na origem; não é possível provar quiescência'
[[ "$alter_job_exists" == 'true' ]] || die 'cron.alter_job não existe na origem; freeze seguro indisponível'
[[ "$can_alter_jobs" == 'true' ]] || die 'a role da conexão não pode executar cron.alter_job'
[[ "$owns_all_cron_jobs" == 'true' ]] || die 'existem jobs pg_cron pertencentes a outra role; freeze automático recusado'
async_work_counts >/dev/null || die 'não foi possível inspecionar cron em execução e fila pg_net'
source_psql_rw -q >/dev/null <<'SQL'
BEGIN;
SELECT cron.alter_job(jobid, active := active)
FROM cron.job
ORDER BY jobid;
ROLLBACK;
SQL

if [[ "$operation_mode" == 'preflight' ]]; then
  trap - EXIT
  cleanup_connection
  log 'Preflight do freeze PASS: conexão TLS, privilégios, cron e filas validados; nada foi alterado.'
  exit 0
fi

install -d -m 0700 "$artifact_root"
artifact_root="$(realpath -e -- "$artifact_root")"
require_private_root_dir "$artifact_root"
timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
state_dir="$artifact_root/${timestamp}-source-freeze"
[[ ! -e "$state_dir" ]] || die "diretório de estado já existe: $state_dir"
install -d -m 0700 "$state_dir"
state_dir="$(realpath -e -- "$state_dir")"
require_private_root_dir "$state_dir"

database_default="$({
  cat <<'SQL'
WITH configured AS (
  SELECT split_part(config.value, '=', 2) AS value
  FROM pg_db_role_setting AS setting
  CROSS JOIN LATERAL unnest(setting.setconfig) AS config(value)
  WHERE setting.setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database())
    AND setting.setrole = 0
    AND config.value LIKE 'default_transaction_read_only=%'
)
SELECT coalesce((SELECT value FROM configured), 'RESET');
SQL
} | source_psql -Atq)"
[[ "$database_default" == 'RESET' || "$database_default" == 'off' ]] \
  || die 'default_transaction_read_only inicial não pode ser restaurado automaticamente'
printf '%s\n' "$database_default" >"$state_dir/database-default.state"

source_psql -F $'\t' -Atq >"$state_dir/cron-state.tsv" <<'SQL'
SELECT jobid, active
FROM cron.job
ORDER BY jobid;
SQL
validate_cron_state "$state_dir/cron-state.tsv"
cron_job_count="$(awk 'END { print NR + 0 }' "$state_dir/cron-state.tsv")"

printf '%s\n' \
  "created_at_utc=$timestamp" \
  "database=$actual_database" \
  "server_address=$server_address" \
  "source_project_ref=$source_project_ref" \
  "cron_job_count=$cron_job_count" \
  >"$state_dir/METADATA"
chmod 0600 "$state_dir/database-default.state" "$state_dir/cron-state.tsv" "$state_dir/METADATA"
write_state_manifest false

cron_change_attempted=false
database_change_attempted=false

freeze_failed() {
  local status="$1"
  local rollback_ok=true
  local reconnect_cutoff=''
  local cron_state='unknown'

  trap - ERR INT TERM EXIT
  set +e
  cleanup_pending_state_files
  warn 'freeze falhou; iniciando restauração automática da origem'

  if [[ "$database_change_attempted" == true ]]; then
    restore_database_default || warn 'a confirmação da restauração do default do banco falhou; reconciliando o estado real'
    reconnect_cutoff="$(source_psql_rw -Atq -c "SELECT clock_timestamp();")" || reconnect_cutoff=''
    if is_valid_cutoff "$reconnect_cutoff"; then
      terminate_clients_started_before "$reconnect_cutoff" || rollback_ok=false
    else
      rollback_ok=false
    fi
  fi

  database_matches_original || rollback_ok=false

  if [[ "$rollback_ok" == true ]]; then
    cron_state="$(classify_cron_state)" || cron_state='unknown'
    case "$cron_state" in
      original)
        ;;
      all_false)
        if [[ "$cron_change_attempted" == true ]]; then
          restore_cron_state \
            || warn 'a confirmação da restauração do cron falhou; reconciliando o estado real'
          cron_state="$(classify_cron_state)" || cron_state='unknown'
          [[ "$cron_state" == 'original' ]] || rollback_ok=false
        else
          rollback_ok=false
        fi
        ;;
      divergent|unknown|*)
        rollback_ok=false
        ;;
    esac
  fi

  # Never publish ROLLED_BACK based only on client acknowledgements. Re-read
  # both catalog/default state and the complete cron snapshot immediately first.
  if [[ "$rollback_ok" == true ]]; then
    database_matches_original || rollback_ok=false
    cron_state="$(classify_cron_state)" || cron_state='unknown'
    [[ "$cron_state" == 'original' ]] || rollback_ok=false
  fi

  if [[ "$rollback_ok" == true ]]; then
    rm -f -- "$state_dir/FROZEN" || rollback_ok=false
  fi
  if [[ "$rollback_ok" == true ]]; then
    sync -f "$state_dir" || rollback_ok=false
  fi
  if [[ "$rollback_ok" == true ]]; then
    write_state_manifest false || rollback_ok=false
  fi

  if [[ "$rollback_ok" == true ]]; then
    write_atomic_marker ROLLED_BACK \
      "rolled_back_at_utc=$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
      || warn 'estado restaurado, mas o marcador ROLLED_BACK não pôde ser sincronizado'
    warn 'estado anterior do banco e do cron foi restaurado automaticamente'
  else
    write_atomic_marker RECOVERY_REQUIRED \
      "recovery_required_at_utc=$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
      || warn 'não foi possível sincronizar o marcador RECOVERY_REQUIRED'
    warn "RECUPERAÇÃO MANUAL NECESSÁRIA; preserve $state_dir e mantenha manutenção/webhooks pausados"
  fi

  cleanup_connection
  (( status != 0 )) || status=1
  exit "$status"
}

trap 'freeze_failed $?' ERR
trap 'freeze_failed 130' INT
trap 'freeze_failed 143' TERM
trap 'freeze_failed $?' EXIT

log "Captura validada: $cron_job_count job(s) pg_cron; desativando-os atomicamente"
cron_change_attempted=true
{
  cat <<'SQL'
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
CREATE TEMP TABLE crm_expected_cron_state (
  jobid bigint PRIMARY KEY,
  active boolean NOT NULL
) ON COMMIT DROP;
COPY crm_expected_cron_state (jobid, active) FROM STDIN;
SQL
  cat -- "$state_dir/cron-state.tsv"
  printf '\\.\n'
  cat <<'SQL'
DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job AS current_job
    FULL JOIN crm_expected_cron_state AS expected USING (jobid)
    WHERE current_job.jobid IS NULL
       OR expected.jobid IS NULL
       OR current_job.active IS DISTINCT FROM expected.active
  ) THEN
    RAISE EXCEPTION 'cron.job mudou depois da captura; freeze recusado';
  END IF;
END;
$block$;
SELECT cron.alter_job(jobid, active := false)
FROM crm_expected_cron_state
WHERE active
ORDER BY jobid;
DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job AS current_job
    FULL JOIN crm_expected_cron_state AS expected USING (jobid)
    WHERE current_job.jobid IS NULL
       OR expected.jobid IS NULL
       OR current_job.active IS DISTINCT FROM false
  ) THEN
    RAISE EXCEPTION 'cron.job não ficou integralmente desativado; freeze recusado';
  END IF;
END;
$block$;
COMMIT;
SQL
} | source_psql_rw -q >/dev/null

log 'Aguardando jobs em execução e fila pg_net drenarem'
wait_for_async_quiescence 30

database_change_attempted=true
freeze_cutoff="$({
  cat <<'SQL'
SELECT format(
  'ALTER DATABASE %I SET default_transaction_read_only = on;',
  current_database()
)
\gexec
SELECT clock_timestamp();
SQL
} | source_psql_rw -Atq)"
[[ "$freeze_cutoff" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2} ]] || die 'não foi possível registrar o instante do freeze'

log 'Encerrando de forma controlada as sessões cliente abertas antes do freeze'
terminate_clients_started_before "$freeze_cutoff"

effective_state="$(source_psql -Atq -c "SELECT current_setting('transaction_read_only');")"
database_state="$({
  cat <<'SQL'
SELECT coalesce((
  SELECT split_part(config.value, '=', 2)
  FROM pg_db_role_setting AS setting
  CROSS JOIN LATERAL unnest(setting.setconfig) AS config(value)
  WHERE setting.setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database())
    AND setting.setrole = 0
    AND config.value LIKE 'default_transaction_read_only=%'
), 'RESET');
SQL
} | source_psql -Atq)"
active_cron_count="$(source_psql -Atq -c 'SELECT count(*) FROM cron.job WHERE active;')"
async_counts="$(async_work_counts)"
IFS=$'\t' read -r running_cron_count pending_net_count <<<"$async_counts"
[[ "$effective_state" == 'on' && "$database_state" == 'on' ]] \
  || die 'uma nova sessão não herdou o modo somente leitura'
[[ "$active_cron_count" == '0' ]] || die 'ainda existem jobs pg_cron ativos'
[[ "$running_cron_count" == '0' && "$pending_net_count" == '0' ]] \
  || die 'há job pg_cron em execução ou request pg_net pendente'

write_atomic_marker FROZEN \
  "frozen_at_utc=$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  "session_cutoff=$freeze_cutoff"
write_state_manifest true

trap - ERR INT TERM EXIT
cleanup_connection
log "Origem congelada e validada. Estado reversível preservado em: $state_dir"
log 'Mantenha manutenção e produtores externos pausados até o go-live ou unfreeze explícito.'
