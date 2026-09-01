#!/usr/bin/env bash

# Restore the managed Supabase source after an aborted cutover.
# shellcheck shell=bash

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
  12-unfreeze-source.sh --preflight /caminho/absoluto/do-estado
  12-unfreeze-source.sh --confirm-unfreeze-source /caminho/absoluto/do-estado

O diretório informado deve ser exatamente o emitido por 11-freeze-source.sh.
Mantenha a Vercel em manutenção e webhooks pausados até a validação final.
USAGE
  exit 2
}

[[ $# -eq 2 ]] || usage
case "$1" in
  --preflight) operation_mode='preflight' ;;
  --confirm-unfreeze-source) operation_mode='unfreeze' ;;
  *) usage ;;
esac
requested_state_dir="$2"

require_root
load_versions
require_command awk flock mktemp psql python3 realpath sha256sum stat

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

requested_cutover_state_root="${CUTOVER_STATE_DIR:-}"
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
artifact_root="${requested_cutover_state_root:-${CUTOVER_STATE_DIR:-$BACKUP_DIR/cutover-state}}"

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
[[ "$uri_port" == '5432' ]] || die 'unfreeze exige conexão direta/session-pooler na porta 5432; transaction pooler recusado'
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

runtime_dir="$(mktemp -d /run/crm-source-unfreeze.XXXXXX)"
[[ "$runtime_dir" =~ ^/run/crm-source-unfreeze\.[A-Za-z0-9]+$ ]] \
  || die 'mktemp retornou um diretório de runtime inesperado'
pgpass_file="$runtime_dir/pgpass"

cleanup_connection() {
  set +x
  unset encoded_password source_db_url PGPASSWORD PGPASSFILE
  if [[ -n "${runtime_dir:-}" \
     && "$runtime_dir" =~ ^/run/crm-source-unfreeze\.[A-Za-z0-9]+$ \
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
[[ "$artifact_root" == /* && "$requested_state_dir" == /* ]] \
  || die 'CUTOVER_STATE_DIR e o diretório de estado precisam ser absolutos'

require_private_root_dir() {
  local directory="$1"
  local owner mode

  [[ -d "$directory" && ! -L "$directory" ]] || die "diretorio protegido invalido: $directory"
  owner="$(stat -c '%u' "$directory")"
  mode="$(stat -c '%a' "$directory")"
  [[ "$owner" == '0' ]] || die "$directory precisa pertencer a root"
  [[ "$mode" == '700' ]] || die "permissao insegura em $directory ($mode); use chmod 700"
}

exec 9>/run/lock/crm-source-cutover.lock
flock -n 9 || die 'outra operação de freeze/unfreeze está em execução'

[[ ! -L "$artifact_root" && ! -L "$requested_state_dir" ]] \
  || die 'links simbolicos para diretorios de estado sao recusados'
artifact_root="$(realpath -e -- "$artifact_root")"
state_dir="$(realpath -e -- "$requested_state_dir")"
require_private_root_dir "$artifact_root"
require_private_root_dir "$state_dir"
[[ "$state_dir" == "$artifact_root"/* ]] || die 'diretório de estado está fora de CUTOVER_STATE_DIR'
[[ "$(basename -- "$state_dir")" =~ ^[0-9]{8}T[0-9]{6}Z-source-freeze$ ]] \
  || die 'nome de diretório de estado inválido'
[[ ! -e "$state_dir/UNFROZEN" ]] || die 'este estado já foi descongelado'

for state_file in database-default.state cron-state.tsv METADATA SHA256SUMS FROZEN; do
  [[ ! -L "$state_dir/$state_file" ]] || die "link simbólico recusado: $state_dir/$state_file"
  require_secret_file "$state_dir/$state_file"
done
awk '
  $2 == "database-default.state" { database_default++ ; next }
  $2 == "cron-state.tsv" { cron_state++ ; next }
  $2 == "METADATA" { metadata++ ; next }
  $2 == "FROZEN" { frozen++ ; next }
  { invalid = 1 }
  END { exit (invalid || !(database_default == 1 && cron_state == 1 && metadata == 1 && frozen == 1)) }
' "$state_dir/SHA256SUMS" || die 'manifesto SHA256SUMS contém entradas inválidas ou incompletas'
(
  cd "$state_dir"
  sha256sum --check --strict SHA256SUMS >/dev/null
) || die 'checksum do estado de freeze não confere'
awk -F= '
  $1 == "frozen_at_utc" && $2 ~ /^[0-9]{4}-[0-9]{2}-[0-9]{2}T/ { frozen++ ; next }
  $1 == "session_cutoff" && $2 ~ /^[0-9]{4}-[0-9]{2}-[0-9]{2}/ { cutoff++ ; next }
  { invalid = 1 }
  END { exit (invalid || !(frozen == 1 && cutoff == 1)) }
' "$state_dir/FROZEN" || die 'marcador FROZEN inválido'

validate_cron_state() {
  local file="$1"
  awk -F '\t' '
    NF != 2 || $1 !~ /^[0-9]+$/ || $2 !~ /^(t|f)$/ { exit 1 }
  ' "$file" || die "estado de cron inválido: $file"
}
validate_cron_state "$state_dir/cron-state.tsv"

database_default="$(<"$state_dir/database-default.state")"
[[ "$database_default" == 'RESET' || "$database_default" == 'off' ]] \
  || die 'estado original do banco é inválido'
artifact_project_ref="$(awk -F= '$1 == "source_project_ref" { sub(/^[^=]*=/, ""); print; exit }' "$state_dir/METADATA")"
artifact_database="$(awk -F= '$1 == "database" { sub(/^[^=]*=/, ""); print; exit }' "$state_dir/METADATA")"
artifact_cron_count="$(awk -F= '$1 == "cron_job_count" { sub(/^[^=]*=/, ""); print; exit }' "$state_dir/METADATA")"
actual_cron_state_count="$(awk 'END { print NR + 0 }' "$state_dir/cron-state.tsv")"
[[ "$artifact_project_ref" == "$source_project_ref" ]] || die 'o estado pertence a outro projeto Supabase'
[[ "$artifact_database" == "$source_expected_database" ]] || die 'o estado pertence a outro banco'
[[ "$artifact_cron_count" =~ ^[0-9]+$ && "$artifact_cron_count" == "$actual_cron_state_count" ]] \
  || die 'a contagem de jobs no estado é inconsistente'

source_psql() {
  PGHOST="$uri_host" \
  PGPORT="$uri_port" \
  PGUSER="$uri_user" \
  PGDATABASE="$uri_database" \
  PGPASSFILE="$pgpass_file" \
  PGAPPNAME='crm-cutover-unfreeze' \
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
  PGAPPNAME='crm-cutover-unfreeze-admin' \
  PGCONNECT_TIMEOUT=15 \
  PGSSLMODE=verify-full \
  PGSSLROOTCERT="$source_ssl_root_cert" \
  PGOPTIONS='-c default_transaction_read_only=off -c statement_timeout=60s -c lock_timeout=10s' \
    psql -X -w --no-psqlrc --set ON_ERROR_STOP=1 "$@"
}

set_database_readonly() {
  source_psql_rw -Atq <<'SQL'
SELECT format(
  'ALTER DATABASE %I SET default_transaction_read_only = on;',
  current_database()
)
\gexec
SELECT clock_timestamp();
SQL
}

restore_database_default() {
  case "$database_default" in
    RESET)
      source_psql_rw -Atq <<'SQL'
SELECT format(
  'ALTER DATABASE %I RESET default_transaction_read_only;',
  current_database()
)
\gexec
SELECT clock_timestamp();
SQL
      ;;
    off)
      source_psql_rw -Atq <<'SQL'
SELECT format(
  'ALTER DATABASE %I SET default_transaction_read_only = off;',
  current_database()
)
\gexec
SELECT clock_timestamp();
SQL
      ;;
  esac
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
  warn "$remaining sessão(ões) anterior(es) à mudança não encerraram em 10 segundos"
  return 1
}

check_cron_frozen() {
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
SELECT NOT EXISTS (
  SELECT 1
  FROM cron.job AS current_job
  FULL JOIN crm_expected_cron_state AS expected USING (jobid)
  WHERE current_job.jobid IS NULL
     OR expected.jobid IS NULL
     OR current_job.active IS DISTINCT FROM false
);
ROLLBACK;
SQL
  } | source_psql_rw -Atq
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
    RAISE EXCEPTION 'cron.job divergiu durante o freeze; unfreeze recusado';
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
    RAISE EXCEPTION 'estado de pg_cron não foi restaurado integralmente';
  END IF;
END;
$block$;
COMMIT;
SQL
  } | source_psql_rw -q >/dev/null
}

disable_all_cron() {
  source_psql_rw -q >/dev/null <<'SQL'
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SELECT cron.alter_job(jobid, active := false)
FROM cron.job
WHERE active
ORDER BY jobid;
DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE active) THEN
    RAISE EXCEPTION 'não foi possível desativar todos os jobs pg_cron';
  END IF;
END;
$block$;
COMMIT;
SQL
}

preflight="$({
  cat <<'SQL'
SELECT concat_ws(E'\t',
  current_database(),
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
  (to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)') IS NOT NULL)::text,
  coalesce(has_function_privilege(
    current_user,
    to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)'),
    'EXECUTE'
  ), false)::text,
  (NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE username IS DISTINCT FROM current_user::text
  ))::text
);
SQL
} | source_psql -Atq)"

IFS=$'\t' read -r actual_database ssl_active owns_database can_terminate can_inspect read_only unsafe_role_overrides cron_exists cron_alter_exists can_alter_cron owns_all_cron_jobs <<<"$preflight"
[[ "$actual_database" == "$source_expected_database" ]] || die 'o estado não aponta para o banco conectado'
[[ "$ssl_active" == 'true' ]] || die 'a conexão à origem não está usando TLS'
[[ "$owns_database" == 'true' ]] || die 'a role da conexão não pode restaurar a configuração do banco'
[[ "$can_terminate" == 'true' ]] || die 'a role da conexão não pode executar pg_terminate_backend'
[[ "$can_inspect" == 'true' ]] || die 'a role da conexão não possui visibilidade completa de pg_stat_activity'
[[ "$read_only" == 'on' ]] || die 'a origem não está congelada para esta conexão'
[[ "$unsafe_role_overrides" == '0' ]] || die 'há override de role permitindo escrita durante o freeze; unfreeze automático recusado'
[[ "$cron_exists" == 'true' ]] || die 'cron.job não existe na origem'
[[ "$cron_alter_exists" == 'true' ]] || die 'cron.alter_job não existe na origem'
[[ "$can_alter_cron" == 'true' ]] || die 'a role da conexão não pode executar cron.alter_job'
[[ "$owns_all_cron_jobs" == 'true' ]] || die 'há job pg_cron pertencente a outra role; restauração automática recusada'
[[ "$(check_cron_frozen)" == 't' ]] || die 'cron.job divergiu do estado capturado ou algum job foi reativado'

if [[ "$operation_mode" == 'preflight' ]]; then
  trap - EXIT
  cleanup_connection
  log 'Preflight do unfreeze PASS: estado, TLS, privilégios, read-only e cron validados; nada foi alterado.'
  exit 0
fi

unfreeze_started=false

unfreeze_failed() {
  local status="$1"
  local recovery_ok=true
  local refreeze_cutoff=''

  trap - ERR INT TERM EXIT
  set +e
  if [[ "$unfreeze_started" == true ]]; then
    warn 'unfreeze falhou; retornando a origem ao estado congelado'
    disable_all_cron || recovery_ok=false
    refreeze_cutoff="$(set_database_readonly)" || recovery_ok=false
    if [[ -n "$refreeze_cutoff" ]]; then
      terminate_clients_started_before "$refreeze_cutoff" || recovery_ok=false
    fi
  fi

  if [[ "$recovery_ok" == true ]]; then
    warn 'a origem permanece congelada; corrija a causa e repita o unfreeze com o mesmo estado'
  else
    printf '%s\n' "recovery_required_at_utc=$(date -u +'%Y-%m-%dT%H:%M:%SZ')" >"$state_dir/RECOVERY_REQUIRED"
    chmod 0600 "$state_dir/RECOVERY_REQUIRED"
    warn "RECUPERAÇÃO MANUAL NECESSÁRIA; preserve $state_dir e mantenha manutenção/webhooks pausados"
  fi

  cleanup_connection
  (( status != 0 )) || status=1
  exit "$status"
}

trap 'unfreeze_failed $?' ERR
trap 'unfreeze_failed 130' INT
trap 'unfreeze_failed 143' TERM
trap 'unfreeze_failed $?' EXIT

unfreeze_started=true
log 'Restaurando o default gravável original da origem'
unfreeze_cutoff="$(restore_database_default)"
[[ "$unfreeze_cutoff" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2} ]] || die 'não foi possível registrar o instante do unfreeze'

log 'Encerrando sessões antigas para que os serviços reconectem com o default restaurado'
terminate_clients_started_before "$unfreeze_cutoff"

log 'Restaurando exatamente o estado de pg_cron capturado no freeze'
restore_cron_state

effective_state="$(source_psql -Atq -c "SELECT current_setting('transaction_read_only');")"
[[ "$effective_state" == 'off' ]] || die 'uma nova sessão não herdou o modo gravável'

# Compare the restored active flags without printing job commands or secrets.
restored_ok="$({
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
SELECT NOT EXISTS (
  SELECT 1
  FROM cron.job AS current_job
  FULL JOIN crm_expected_cron_state AS expected USING (jobid)
  WHERE current_job.jobid IS NULL
     OR expected.jobid IS NULL
     OR current_job.active IS DISTINCT FROM expected.active
);
ROLLBACK;
SQL
} | source_psql -Atq)"
[[ "$restored_ok" == 't' ]] || die 'estado de pg_cron não foi restaurado integralmente'

printf '%s\n' "unfrozen_at_utc=$(date -u +'%Y-%m-%dT%H:%M:%SZ')" >"$state_dir/UNFROZEN"
chmod 0600 "$state_dir/UNFROZEN"

trap - ERR INT TERM EXIT
cleanup_connection
log 'Origem novamente gravável e estado de pg_cron restaurado.'
log 'Valide a aplicação antes de remover manutenção e reabrir webhooks externos.'
