#!/usr/bin/env bash

# Synthetic, credential-free regression tests for source freeze/unfreeze safety.
# shellcheck shell=bash
# shellcheck disable=SC2016,SC2034,SC2154,SC2317

set -Eeuo pipefail
IFS=$'\n\t'
umask 077

TEST_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SCRIPT_DIR="$(cd -- "$TEST_DIR/../scripts" && pwd -P)"
FREEZE_SCRIPT="$SCRIPT_DIR/11-freeze-source.sh"
UNFREEZE_SCRIPT="$SCRIPT_DIR/12-unfreeze-source.sh"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

assert_contains() {
  local file="$1"
  local literal="$2"
  grep -Fq -- "$literal" "$file" || fail "texto obrigatorio ausente em $(basename -- "$file")"
}

assert_not_contains() {
  local file="$1"
  local literal="$2"
  if grep -Fq -- "$literal" "$file"; then
    fail "mutacao insegura presente em $(basename -- "$file")"
  fi
}

extract_function() {
  local function_name="$1"
  local file="$2"
  awk -v signature="$function_name() {" '
    $0 == signature { copying = 1 }
    copying { print }
    copying && $0 == "}" { exit }
  ' "$file"
}

bash -n "$FREEZE_SCRIPT"
bash -n "$UNFREEZE_SCRIPT"

assert_contains "$FREEZE_SCRIPT" 'requested_cutover_state_dir="${CUTOVER_STATE_DIR:-}"'
assert_contains "$FREEZE_SCRIPT" 'artifact_root="${requested_cutover_state_dir:-${CUTOVER_STATE_DIR:-$BACKUP_DIR/cutover-state}}"'
assert_contains "$UNFREEZE_SCRIPT" 'requested_cutover_state_root="${CUTOVER_STATE_DIR:-}"'
assert_contains "$UNFREEZE_SCRIPT" 'artifact_root="${requested_cutover_state_root:-${CUTOVER_STATE_DIR:-$BACKUP_DIR/cutover-state}}"'

for script in "$FREEZE_SCRIPT" "$UNFREEZE_SCRIPT"; do
  xtrace_line="$(grep -n -m1 '^set +x$' "$script" | cut -d: -f1)"
  core_line="$(grep -n -m1 '^ulimit -c 0 ' "$script" | cut -d: -f1)"
  source_line="$(grep -n -m1 '^source "\$SCRIPT_DIR/lib.sh"' "$script" | cut -d: -f1)"
  [[ "$xtrace_line" =~ ^[0-9]+$ && "$core_line" =~ ^[0-9]+$ && "$source_line" =~ ^[0-9]+$ ]] \
    || fail 'guardas iniciais nao encontrados'
  (( xtrace_line < source_line && core_line < source_line )) \
    || fail 'xtrace/core dump nao foram desabilitados antes do primeiro load'
  if grep -Eq '^[[:space:]]*load_env_file[[:space:]]' "$script"; then
    fail 'script ainda executa migration.env como shell'
  fi
  assert_contains "$script" "config.value <> 'default_transaction_read_only=on'"
  assert_contains "$script" "config.value <> 'supabase_read_only_user=on'"
  assert_contains "$script" 'WHERE role_row.rolname = activity.usename'
  assert_contains "$script" 'AND role_row.rolsuper'
done

# The production parser is evaluated in isolation with synthetic values. A
# command-substitution-looking value must remain inert because the file is data.
# shellcheck disable=SC1090,SC2091
eval "$(extract_function load_migration_env_file "$FREEZE_SCRIPT")"
require_secret_file() { [[ -f "$1" ]]; }
die() { printf 'parser rejection: %s\n' "$*" >&2; exit 1; }

test_root="$(mktemp -d)"
[[ "$test_root" == /tmp/* || "$test_root" == "${TMPDIR:-/tmp}"/* ]] \
  || fail 'mktemp retornou caminho inesperado'
cleanup() {
  [[ -n "${test_root:-}" && -d "$test_root" ]] && rm -rf -- "$test_root"
}
trap cleanup EXIT

env_file="$test_root/migration.env"
pwn_file="$test_root/command-substitution-ran"
canonical_uri='postgresql://postgres:A%40b%2Fc:d%5Ce%25f%E6%BC%A2%E5%AD%97@db.uxttihjsxfowursjyult.supabase.co:5432/postgres'
{
  printf '%s\n' '# synthetic only'
  printf 'EVIL=$(touch${IFS}%s)\n' "$pwn_file"
  printf "SOURCE_DB_URL='%s'\n" "$canonical_uri"
  printf '%s\n' \
    'SOURCE_PROJECT_REF=uxttihjsxfowursjyult' \
    'SOURCE_EXPECTED_DATABASE=postgres' \
    'SOURCE_EXPECTED_DB_HOST=db.uxttihjsxfowursjyult.supabase.co' \
    'SOURCE_DB_SSL_ROOT_CERT=/tmp/synthetic-ca.crt' \
    'CUTOVER_STATE_DIR=/tmp/synthetic-cutover' \
    'SOURCE_SERVICE_ROLE_KEY=synthetic-file-value'
} >"$env_file"
chmod 0600 "$env_file"

export SOURCE_SERVICE_ROLE_KEY='synthetic-inherited-value'
load_migration_env_file "$env_file"
[[ ! -e "$pwn_file" ]] || fail 'migration.env executou command substitution'
[[ "$SOURCE_DB_URL" == "$canonical_uri" ]] || fail 'parser alterou a URI canonica'
[[ "$SOURCE_PROJECT_REF" == 'uxttihjsxfowursjyult' ]] || fail 'parser perdeu project ref'
if env | grep -Eq '^(SOURCE_DB_URL|SOURCE_SERVICE_ROLE_KEY)='; then
  fail 'segredo sintetico permaneceu exportado'
fi

duplicate_env="$test_root/duplicate.env"
printf '%s\n' 'SOURCE_DB_URL=one' 'SOURCE_DB_URL=two' >"$duplicate_env"
if (load_migration_env_file "$duplicate_env" >/dev/null 2>&1); then
  fail 'parser aceitou chave duplicada'
fi
bad_grammar_env="$test_root/bad-grammar.env"
printf '%s\n' 'export SOURCE_DB_URL=postgresql://invalid' >"$bad_grammar_env"
if (load_migration_env_file "$bad_grammar_env" >/dev/null 2>&1); then
  fail 'parser aceitou gramatica shell/export'
fi

# URI/password cases: @ and / are percent-encoded, while colon, backslash,
# percent and Unicode survive strict decoding and pgpass escaping.
# shellcheck disable=SC1090
eval "$(grep -m1 '^uri_regex=' "$FREEZE_SCRIPT")"
[[ "$canonical_uri" =~ $uri_regex ]] || fail 'URI sintetica canonica foi recusada'
encoded_password="${BASH_REMATCH[3]}"
decoded_password="$(printf '%s' "$encoded_password" | node -e '
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", () => {
  try { process.stdout.write(decodeURIComponent(input)); }
  catch (_) { process.exit(1); }
});
')"
expected_password=$'A@b/c:d\\e%f漢字'
[[ "$decoded_password" == "$expected_password" ]] || fail 'decode de senha sintetica divergiu'
escaped_password="${decoded_password//\\/\\\\}"
escaped_password="${escaped_password//:/\\:}"
[[ "$escaped_password" == $'A@b/c\\:d\\\\e%f漢字' ]] || fail 'escape pgpass divergiu'

raw_at_uri='postgresql://postgres:A@b@db.uxttihjsxfowursjyult.supabase.co:5432/postgres'
raw_slash_uri='postgresql://postgres:A/b@db.uxttihjsxfowursjyult.supabase.co:5432/postgres'
if [[ "$raw_at_uri" =~ $uri_regex \
   && "${BASH_REMATCH[4],,}" == 'db.uxttihjsxfowursjyult.supabase.co' ]]; then
  fail 'URI com @ cru passou pelo regex e pelo guard de host'
fi
[[ ! "$raw_slash_uri" =~ $uri_regex ]] || fail 'URI com / cru foi aceita'
if printf '%s' 'bad%ZZ' | node -e '
let input = "";
process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", () => {
  try { decodeURIComponent(input); process.exit(0); }
  catch (_) { process.exit(1); }
});
' >/dev/null 2>&1; then
  fail 'percent-encoding invalido foi aceito'
fi

if grep -Eq 'PGPASSWORD=|psql[^\n]*\$source_db_url|python3[^\n]*\$encoded_password' "$FREEZE_SCRIPT" "$UNFREEZE_SCRIPT"; then
  fail 'senha pode chegar a argv ou ambiente de processo filho'
fi

# Exercise the actual failure handler with mocked database/cron observations.
# shellcheck disable=SC1090,SC2091
eval "$(extract_function freeze_failed "$FREEZE_SCRIPT")"
run_handler_case() {
  local initial_cron_state="$1"
  local attempted="$2"
  local database_ok="$3"
  local expected_marker="$4"
  local expect_restore="$5"
  local case_dir="$test_root/handler-${initial_cron_state}-${attempted}-${database_ok}-${expected_marker}"
  local status

  mkdir -m 0700 "$case_dir"
  (
    state_dir="$case_dir"
    cron_change_attempted="$attempted"
    database_change_attempted=false
    mock_cron_state="$initial_cron_state"
    : >"$state_dir/FROZEN"
    cleanup_pending_state_files() { :; }
    database_matches_original() { [[ "$database_ok" == true ]]; }
    classify_cron_state() { printf '%s\n' "$mock_cron_state"; }
    restore_cron_state() {
      : >"$state_dir/restore-called"
      mock_cron_state='original'
      return 1
    }
    write_state_manifest() { return 0; }
    write_atomic_marker() { : >"$state_dir/$1"; }
    sync() { return 0; }
    warn() { :; }
    cleanup_connection() { :; }
    freeze_failed 97
  )
  status=$?
  [[ "$status" == '97' ]] || fail 'handler nao preservou o status de falha'
  [[ -f "$case_dir/$expected_marker" ]] || fail "handler nao publicou $expected_marker"
  if [[ "$expected_marker" == 'ROLLED_BACK' ]]; then
    [[ ! -e "$case_dir/RECOVERY_REQUIRED" ]] || fail 'handler publicou marcadores conflitantes'
  else
    [[ ! -e "$case_dir/ROLLED_BACK" ]] || fail 'handler publicou ROLLED_BACK falso'
  fi
  if [[ "$expect_restore" == true ]]; then
    [[ -e "$case_dir/restore-called" ]] || fail 'estado all_false nao acionou restauracao'
  else
    [[ ! -e "$case_dir/restore-called" ]] || fail 'restauracao de cron ocorreu fora de all_false proprio'
  fi
}

set +e
run_handler_case all_false true true ROLLED_BACK true
handler_test_status=$?
set -e
[[ "$handler_test_status" == '0' ]] || exit "$handler_test_status"
set +e
run_handler_case original true true ROLLED_BACK false
handler_test_status=$?
set -e
[[ "$handler_test_status" == '0' ]] || exit "$handler_test_status"
set +e
run_handler_case divergent true true RECOVERY_REQUIRED false
handler_test_status=$?
set -e
[[ "$handler_test_status" == '0' ]] || exit "$handler_test_status"
set +e
run_handler_case all_false false true RECOVERY_REQUIRED false
handler_test_status=$?
set -e
[[ "$handler_test_status" == '0' ]] || exit "$handler_test_status"
set +e
run_handler_case original true false RECOVERY_REQUIRED false
handler_test_status=$?
set -e
[[ "$handler_test_status" == '0' ]] || exit "$handler_test_status"

flag_line="$(grep -n -m1 '^cron_change_attempted=true$' "$FREEZE_SCRIPT" | cut -d: -f1)"
mutation_line="$(grep -n -m1 '^SELECT cron.alter_job(jobid, active := false)$' "$FREEZE_SCRIPT" | cut -d: -f1)"
[[ "$flag_line" =~ ^[0-9]+$ && "$mutation_line" =~ ^[0-9]+$ && "$flag_line" -lt "$mutation_line" ]] \
  || fail 'flag de ambiguidade do commit nao antecede a mutacao do cron'
for script in "$FREEZE_SCRIPT" "$UNFREEZE_SCRIPT"; do
  assert_not_contains "$script" 'LOCK TABLE cron.job'
  assert_not_contains "$script" 'UPDATE cron.job'
  assert_contains "$script" 'cron.alter_job'
done
assert_contains "$FREEZE_SCRIPT" 'SELECT cron.alter_job(expected.jobid, active := expected.active)'
assert_contains "$FREEZE_SCRIPT" 'SELECT cron.alter_job(jobid, active := false)'
assert_contains "$UNFREEZE_SCRIPT" 'SELECT cron.alter_job(expected.jobid, active := expected.active)'
assert_contains "$UNFREEZE_SCRIPT" 'SELECT cron.alter_job(jobid, active := false)'
assert_contains "$UNFREEZE_SCRIPT" "to_regprocedure('cron.alter_job(bigint,text,text,text,text,boolean)')"
assert_contains "$FREEZE_SCRIPT" "THEN 'original'"
assert_contains "$FREEZE_SCRIPT" "THEN 'all_false'"
assert_contains "$FREEZE_SCRIPT" "ELSE 'divergent'"
assert_contains "$FREEZE_SCRIPT" 'write_atomic_marker FROZEN'
assert_contains "$FREEZE_SCRIPT" 'write_state_manifest true'
assert_contains "$FREEZE_SCRIPT" 'sync -f "$pending"'
assert_contains "$FREEZE_SCRIPT" 'mv -f -- "$pending"'

# Validate the directory gate with synthetic stat results.
# shellcheck disable=SC1090,SC2091
eval "$(extract_function require_private_root_dir "$UNFREEZE_SCRIPT")"
private_dir="$test_root/private-dir"
mkdir -m 0700 "$private_dir"
run_dir_case() {
  local mock_owner="$1"
  local mock_mode="$2"
  (
    stat() {
      case "$2" in
        '%u') printf '%s\n' "$mock_owner" ;;
        '%a') printf '%s\n' "$mock_mode" ;;
        *) return 1 ;;
      esac
    }
    die() { exit 1; }
    require_private_root_dir "$private_dir"
  )
}
run_dir_case 0 700 || fail 'diretorio root:0700 foi recusado'
if run_dir_case 0 755; then fail 'diretorio 0755 foi aceito'; fi
if run_dir_case 1000 700; then fail 'diretorio nao-root foi aceito'; fi

preflight_line="$(grep -n -m1 '^if \[\[ "\$operation_mode" == '\''preflight'\'' \]\]; then$' "$UNFREEZE_SCRIPT" | cut -d: -f1)"
mutation_line="$(grep -n -m1 '^unfreeze_started=true$' "$UNFREEZE_SCRIPT" | cut -d: -f1)"
directory_line="$(grep -n -m1 '^require_private_root_dir "\$state_dir"$' "$UNFREEZE_SCRIPT" | cut -d: -f1)"
files_line="$(grep -n -m1 '^for state_file in ' "$UNFREEZE_SCRIPT" | cut -d: -f1)"
[[ "$preflight_line" =~ ^[0-9]+$ && "$mutation_line" =~ ^[0-9]+$ && "$preflight_line" -lt "$mutation_line" ]] \
  || fail 'preflight de unfreeze ocorre depois da mutacao'
[[ "$directory_line" =~ ^[0-9]+$ && "$files_line" =~ ^[0-9]+$ && "$directory_line" -lt "$files_line" ]] \
  || fail 'diretorio nao e validado antes dos artefatos'
assert_contains "$UNFREEZE_SCRIPT" "--preflight) operation_mode='preflight'"

printf 'PASS: freeze/unfreeze safety regression suite\n'
