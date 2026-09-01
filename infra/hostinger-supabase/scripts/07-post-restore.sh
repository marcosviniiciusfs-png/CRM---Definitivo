#!/usr/bin/env bash

# Apply target-only SQL or enable exactly one allowlisted CRM cron job.
# shellcheck shell=bash

set -Eeuo pipefail
IFS=$'\n\t'
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

require_root
load_versions
require_command docker flock
expected_install_dir="$INSTALL_DIR"
expected_kit_dir="$KIT_DIR"
target_env_file="$INSTALL_DIR/.env"
target_functions_env_file="$INSTALL_DIR/functions.env"

CRON_JOB_TO_ENABLE=''
if [[ "${1:-}" == '--enable-cron' ]]; then
  [[ $# -ge 2 ]] \
    || die 'uso: 07-post-restore.sh --enable-cron <send-scheduled-reminders|auto-redistribute-leads|sync-google-sheets>'
  CRON_JOB_TO_ENABLE="$2"
  shift 2
fi
[[ $# -eq 0 ]] || die 'uso: 07-post-restore.sh [--enable-cron <job-allowlisted>]'

selected_job_predicate=''
if [[ -n "$CRON_JOB_TO_ENABLE" ]]; then
  case "$CRON_JOB_TO_ENABLE" in
    send-scheduled-reminders)
      selected_job_predicate="jobname = 'send-scheduled-reminders'"
      ;;
    auto-redistribute-leads)
      selected_job_predicate="jobname = 'auto-redistribute-leads'"
      ;;
    sync-google-sheets)
      selected_job_predicate="jobname = 'sync-google-sheets'"
      ;;
    *)
      die 'job recusado; use send-scheduled-reminders, auto-redistribute-leads ou sync-google-sheets'
      ;;
  esac
  [[ "${CONFIRM_ENABLE_CRON:-}" == 'YES' ]] \
    || die 'combine --enable-cron <job> com CONFIRM_ENABLE_CRON=YES'
fi

expected_job_names_sql="'send-scheduled-reminders','auto-redistribute-leads','sync-google-sheets'"
expected_job_structure_sql="(
  (jobname = 'send-scheduled-reminders' AND schedule = '* * * * *' AND position('/functions/v1/send-scheduled-reminders' IN command) > 0)
  OR (jobname = 'auto-redistribute-leads' AND schedule = '*/5 * * * *' AND position('/functions/v1/auto-redistribute-leads' IN command) > 0)
  OR (jobname = 'sync-google-sheets' AND schedule = '*/2 * * * *' AND position('/functions/v1/sync-google-sheets' IN command) > 0)
) AND position('http://api-gw:8000/functions/v1/' IN command) > 0
  AND position('x-cron-secret' IN command) > 0
  AND position('Bearer eyJ' IN command) = 0"

require_file "$INSTALL_DIR/.crm-supabase-commit"
[[ "$(tr -d '[:space:]' <"$INSTALL_DIR/.crm-supabase-commit")" == "$SUPABASE_COMMIT" ]] \
  || die 'a stack de destino nao esta no commit fixado'

restore_marker="$INSTALL_DIR/.crm-last-restore"
restore_in_progress_marker="$INSTALL_DIR/.crm-restore-in-progress"
require_secret_file "$restore_marker"
[[ ! -e "$restore_in_progress_marker" ]] \
  || die 'o marcador de restore em andamento ainda existe; operacao recusada'
[[ "$(env_file_value "$restore_marker" status)" == 'restored' ]] \
  || die 'o marcador nao confirma um restore transacional concluido'
restore_manifest_sha256="$(env_file_value "$restore_marker" manifest_sha256)"
[[ "$restore_manifest_sha256" =~ ^[0-9a-f]{64}$ ]] \
  || die 'o marcador de restore nao contem um SHA-256 de manifesto valido'
[[ -n "$(env_file_value "$restore_marker" restored_at_utc)" ]] \
  || die 'o marcador de restore nao contem restored_at_utc'
discard_marker="$INSTALL_DIR/.crm-chat-media-discarded"
require_secret_file "$discard_marker"
[[ "$(env_file_value "$discard_marker" status)" == 'discarded' ]] \
  || die 'o marcador nao confirma o descarte target-only de chat-media'
[[ "$(env_file_value "$discard_marker" restore_manifest_sha256)" == "$restore_manifest_sha256" ]] \
  || die 'o descarte de chat-media pertence a outro restore'
discarded_chat_media_objects="$(env_file_value "$discard_marker" discarded_objects)"
discarded_chat_media_bytes="$(env_file_value "$discard_marker" discarded_bytes)"
[[ "$discarded_chat_media_objects" =~ ^[0-9]+$ \
   && "$discarded_chat_media_bytes" =~ ^[0-9]+$ \
   && "$(env_file_value "$discard_marker" objects_without_numeric_size)" == '0' ]] \
  || die 'o marcador de descarte nao contem inventario restaurado valido'

exec 9>"$INSTALL_DIR/.post-restore.lock"
flock -n 9 || die 'outro processo de pos-restore/cron ja esta em execucao'

MIGRATION_ENV_FILE="${MIGRATION_ENV_FILE:-/etc/crm-supabase/migration.env}"
load_env_file "$MIGRATION_ENV_FILE"
[[ "$INSTALL_DIR" == "$expected_install_dir" && "$KIT_DIR" == "$expected_kit_dir" ]] \
  || die 'migration.env tentou alterar caminhos fixados do kit/destino'
load_env_file "$target_env_file"
load_env_file "$target_functions_env_file"
[[ "$INSTALL_DIR" == "$expected_install_dir" && "$KIT_DIR" == "$expected_kit_dir" ]] \
  || die 'arquivos de ambiente tentaram alterar caminhos fixados do kit/destino'

require_non_placeholder OLD_SUPABASE_PUBLIC_URL
require_non_placeholder NEW_SUPABASE_PUBLIC_URL
require_non_placeholder CRON_SECRET
require_https_url OLD_SUPABASE_PUBLIC_URL
require_https_url NEW_SUPABASE_PUBLIC_URL
safe_url_regex='^https://[A-Za-z0-9._~:/?#@!$&()*+,;=%-]+$'
[[ "$OLD_SUPABASE_PUBLIC_URL" =~ $safe_url_regex ]] \
  || die 'OLD_SUPABASE_PUBLIC_URL contem caracteres inesperados'
[[ "$NEW_SUPABASE_PUBLIC_URL" =~ $safe_url_regex ]] \
  || die 'NEW_SUPABASE_PUBLIC_URL contem caracteres inesperados'
[[ "$CRON_SECRET" =~ ^[A-Za-z0-9._~-]{32,}$ ]] \
  || die 'CRON_SECRET precisa ter ao menos 32 caracteres seguros'
[[ "$(env_file_value "$target_functions_env_file" REQUIRE_CRON_SECRET)" == 'true' ]] \
  || die 'REQUIRE_CRON_SECRET=true e obrigatorio antes de recriar/liberar jobs'

if [[ "$CRON_JOB_TO_ENABLE" == 'sync-google-sheets' ]]; then
  require_file "$INSTALL_DIR/volumes/functions/sync-google-sheets/index.ts"
  [[ "${CONFIRM_SYNC_GOOGLE_SHEETS_VALIDATED:-}" == 'YES' ]] \
    || die 'sync-google-sheets exige integracao recuperada/auditada e CONFIRM_SYNC_GOOGLE_SHEETS_VALIDATED=YES'
fi

POST_RESTORE_SQL="${POST_RESTORE_SQL:-$KIT_DIR/sql/post-restore.sql}"
require_file "$POST_RESTORE_SQL"
compose config --quiet
compose up -d db
wait_for_container_health supabase-db 240

db_preflight="$(docker exec supabase-db psql -XAt -F '|' -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT current_database(), current_setting('transaction_read_only'), (to_regnamespace('public') IS NOT NULL AND to_regnamespace('auth') IS NOT NULL AND to_regnamespace('storage') IS NOT NULL AND to_regnamespace('cron') IS NOT NULL AND to_regnamespace('net') IS NOT NULL), (to_regclass('public.profiles') IS NOT NULL AND to_regclass('auth.users') IS NOT NULL AND to_regclass('storage.buckets') IS NOT NULL AND to_regclass('storage.objects') IS NOT NULL AND to_regclass('cron.job') IS NOT NULL AND to_regclass('cron.job_run_details') IS NOT NULL AND to_regclass('net.http_request_queue') IS NOT NULL);")" \
  || die 'falha no preflight do banco restaurado'
IFS='|' read -r target_database transaction_read_only required_schemas_ready required_tables_ready <<<"$db_preflight"
[[ "$target_database" == 'postgres' && "$transaction_read_only" == 'off' ]] \
  || die 'o destino nao e o banco postgres gravavel esperado'
[[ "$required_schemas_ready" == 't' && "$required_tables_ready" == 't' ]] \
  || die 'schemas ou tabelas obrigatorios do CRM/Supabase nao foram restaurados'

require_cron_services_ready() {
  local required_service service_container_id service_state service_health
  for required_service in api-gw functions; do
    service_container_id="$(compose ps -a -q "$required_service")"
    [[ -n "$service_container_id" ]] \
      || die "servico obrigatorio ausente para liberar cron: $required_service"
    service_state="$(docker inspect --format '{{.State.Status}}' "$service_container_id")"
    service_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$service_container_id")"
    [[ "$service_state" == 'running' && "$service_health" == 'healthy' ]] \
      || die "servico $required_service nao esta pronto para liberar cron (state=$service_state health=$service_health)"
  done
}

set_global_cron_off() {
  docker exec supabase-db sh -ceu \
    'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -h 127.0.0.1 -X -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c "ALTER SYSTEM SET cron.launch_active_jobs = '\''off'\'';" -c "SELECT pg_reload_conf();"' \
    >/dev/null
  [[ "$(docker exec supabase-db psql -XAt -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'SHOW cron.launch_active_jobs;')" == 'off' ]] \
    || die 'nao foi possivel fechar o gate global de pg_cron'
}

wait_for_cron_drain() {
  local timeout_seconds="${CRON_DRAIN_TIMEOUT_SECONDS:-90}"
  local deadline running_jobs pending_requests drain_state
  [[ "$timeout_seconds" =~ ^[0-9]+$ && "$timeout_seconds" -ge 1 && "$timeout_seconds" -le 600 ]] \
    || die 'CRON_DRAIN_TIMEOUT_SECONDS deve ser inteiro entre 1 e 600'
  deadline=$((SECONDS + timeout_seconds))
  while (( SECONDS < deadline )); do
    drain_state="$(docker exec supabase-db psql -XAt -F '|' -U postgres -d postgres -v ON_ERROR_STOP=1 \
      -c "SELECT (SELECT count(*) FROM cron.job_run_details WHERE status = 'running'), (SELECT count(*) FROM net.http_request_queue);")"
    IFS='|' read -r running_jobs pending_requests <<<"$drain_state"
    [[ "$running_jobs" =~ ^[0-9]+$ && "$pending_requests" =~ ^[0-9]+$ ]] \
      || die 'estado invalido ao drenar cron/pg_net'
    if (( running_jobs == 0 && pending_requests == 0 )); then
      return 0
    fi
    sleep 2
  done
  die 'cron/pg_net nao drenou no prazo; gate global permanece fechado'
}

if [[ -n "$CRON_JOB_TO_ENABLE" ]]; then
  activation_state="$(docker exec supabase-db psql -XAt -F '|' -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -c "SELECT count(*), count(DISTINCT jobname) FILTER (WHERE jobname IN ($expected_job_names_sql)), count(*) FILTER (WHERE $expected_job_structure_sql), count(*) FILTER (WHERE jobname IN ($expected_job_names_sql) AND active), count(*) FILTER (WHERE $selected_job_predicate AND active), (SELECT count(*) FROM vault.secrets WHERE name = 'crm_cron_secret'), current_setting('cron.launch_active_jobs', true) FROM cron.job;")" \
    || die 'falha ao validar estado antes da ativacao gradual'
  IFS='|' read -r total_jobs distinct_jobs structural_jobs active_jobs selected_active vault_secret_count initial_global_state <<<"$activation_state"
  [[ "$total_jobs" =~ ^[0-9]+$ && "$distinct_jobs" =~ ^[0-9]+$ && "$structural_jobs" =~ ^[0-9]+$ && "$active_jobs" =~ ^[0-9]+$ && "$selected_active" =~ ^[0-9]+$ && "$vault_secret_count" =~ ^[0-9]+$ ]] \
    || die 'estado de cron/Vault retornou valores invalidos'
  (( total_jobs == 3 && distinct_jobs == 3 && structural_jobs == 3 && vault_secret_count == 1 )) \
    || die "cron nao esta pronto para ativacao (total=$total_jobs distintos=$distinct_jobs validos=$structural_jobs vault=$vault_secret_count)"
  [[ "$initial_global_state" == 'on' || "$initial_global_state" == 'off' ]] \
    || die 'estado global de pg_cron e invalido'
  (( selected_active <= 1 && active_jobs <= 3 )) || die 'estado ativo dos jobs e ambiguo'

  if [[ "$initial_global_state" == 'on' ]] && (( selected_active == 1 )); then
    require_cron_services_ready
    log "Job cron ja estava habilitado: $CRON_JOB_TO_ENABLE"
    exit 0
  fi
  if [[ "$initial_global_state" == 'off' ]] && (( active_jobs > 0 && selected_active == 0 )); then
    die 'ha outro job ativo com o gate global fechado; retome esse job antes de ativar o proximo'
  fi

  set_global_cron_off
  wait_for_cron_drain
  require_cron_services_ready

  if (( selected_active == 0 )); then
    rows_activated="$(docker exec supabase-db sh -ceu \
      'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -h 127.0.0.1 -XAt -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c "$1"' \
      sh "WITH changed AS (UPDATE cron.job SET active = true WHERE $selected_job_predicate AND NOT active RETURNING 1) SELECT count(*) FROM changed;")"
    [[ "$rows_activated" == '1' ]] || die 'o job selecionado nao foi ativado exatamente uma vez'
  fi

  docker exec supabase-db sh -ceu \
    'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -h 127.0.0.1 -X -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c "ALTER SYSTEM RESET cron.launch_active_jobs;" -c "SELECT pg_reload_conf();"' \
    >/dev/null

  expected_active_jobs=$(( active_jobs + (selected_active == 0 ? 1 : 0) ))
  final_activation_state="$(docker exec supabase-db psql -XAt -F '|' -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -c "SELECT count(*) FILTER (WHERE jobname IN ($expected_job_names_sql) AND active), count(*) FILTER (WHERE $selected_job_predicate AND active), current_setting('cron.launch_active_jobs', true) FROM cron.job;")"
  IFS='|' read -r final_active_jobs final_selected_active final_global_state <<<"$final_activation_state"
  [[ "$final_active_jobs" =~ ^[0-9]+$ && "$final_selected_active" == '1' && "$final_global_state" == 'on' ]] \
    || die 'ativacao nao atingiu o estado final esperado; inspecione cron antes de prosseguir'
  (( final_active_jobs == expected_active_jobs )) \
    || die "mais de um job mudou de estado (antes=$active_jobs depois=$final_active_jobs)"
  log "Job cron habilitado isoladamente: $CRON_JOB_TO_ENABLE (ativos=$final_active_jobs/3)"
  exit 0
fi

initial_global_state="$(docker exec supabase-db psql -XAt -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'SHOW cron.launch_active_jobs;')"
[[ "$initial_global_state" == 'off' ]] \
  || die 'pos-restore so pode ser reaplicado com o gate global de pg_cron fechado'
set_global_cron_off

target_safety="$(docker exec supabase-db psql -XAt -F '|' -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT count(*), count(DISTINCT jobname) FILTER (WHERE jobname IN ($expected_job_names_sql)), count(*) FILTER (WHERE active), (SELECT count(*) FROM cron.job_run_details WHERE status = 'running'), (SELECT count(*) FROM net.http_request_queue) FROM cron.job;")" \
  || die 'falha ao validar cron e pg_net antes do pos-restore'
IFS='|' read -r restored_cron_jobs distinct_expected_jobs restored_active_jobs running_cron_jobs pending_http_requests <<<"$target_safety"
[[ "$restored_cron_jobs" =~ ^[0-9]+$ && "$distinct_expected_jobs" =~ ^[0-9]+$ && "$restored_active_jobs" =~ ^[0-9]+$ && "$running_cron_jobs" =~ ^[0-9]+$ && "$pending_http_requests" =~ ^[0-9]+$ ]] \
  || die 'preflight de cron/pg_net retornou valores invalidos'
if ! (( restored_cron_jobs == 0 || (restored_cron_jobs == 3 && distinct_expected_jobs == 3 && restored_active_jobs == 0) )); then
  die "configuracao de cron inesperada antes do pos-restore (cron=$restored_cron_jobs distintos=$distinct_expected_jobs ativos=$restored_active_jobs)"
fi
(( running_cron_jobs == 0 && pending_http_requests == 0 )) \
  || die "destino inseguro antes do pos-restore (running=$running_cron_jobs pg_net=$pending_http_requests)"

export CRM_MIGRATION_OLD_PUBLIC_URL="$OLD_SUPABASE_PUBLIC_URL"
export CRM_MIGRATION_NEW_PUBLIC_URL="$NEW_SUPABASE_PUBLIC_URL"
export CRM_MIGRATION_CRON_SECRET="$CRON_SECRET"
log 'Aplicando ajustes pos-restore no banco de destino'
{
  printf '%s\n' \
    '\getenv old_public_url CRM_MIGRATION_OLD_PUBLIC_URL' \
    '\getenv new_public_url CRM_MIGRATION_NEW_PUBLIC_URL' \
    '\getenv cron_secret CRM_MIGRATION_CRON_SECRET'
  cat -- "$POST_RESTORE_SQL"
} | docker exec -i \
  --env CRM_MIGRATION_OLD_PUBLIC_URL \
  --env CRM_MIGRATION_NEW_PUBLIC_URL \
  --env CRM_MIGRATION_CRON_SECRET \
  supabase-db sh -ceu \
    'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -h 127.0.0.1 -X -U supabase_admin -d postgres --variable ON_ERROR_STOP=1'
unset CRM_MIGRATION_OLD_PUBLIC_URL CRM_MIGRATION_NEW_PUBLIC_URL CRM_MIGRATION_CRON_SECRET

post_restore_state="$(docker exec supabase-db psql -XAt -F '|' -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT count(*) FILTER (WHERE jobname IN ($expected_job_names_sql)), count(DISTINCT jobname) FILTER (WHERE jobname IN ($expected_job_names_sql)), count(*) FILTER (WHERE $expected_job_structure_sql), count(*) FILTER (WHERE jobname IN ($expected_job_names_sql) AND active), (SELECT count(*) FROM vault.secrets WHERE name = 'crm_cron_secret'), (SELECT count(*) FROM cron.job_run_details WHERE status = 'running'), (SELECT count(*) FROM net.http_request_queue) FROM cron.job;")" \
  || die 'falha ao validar o resultado do pos-restore'
IFS='|' read -r expected_jobs distinct_expected_jobs structural_expected_jobs active_expected_jobs vault_secret_count running_cron_jobs pending_http_requests <<<"$post_restore_state"
[[ "$expected_jobs" =~ ^[0-9]+$ && "$distinct_expected_jobs" =~ ^[0-9]+$ && "$structural_expected_jobs" =~ ^[0-9]+$ && "$active_expected_jobs" =~ ^[0-9]+$ && "$vault_secret_count" =~ ^[0-9]+$ && "$running_cron_jobs" =~ ^[0-9]+$ && "$pending_http_requests" =~ ^[0-9]+$ ]] \
  || die 'pos-flight de cron/Vault/pg_net retornou valores invalidos'
(( expected_jobs == 3 && distinct_expected_jobs == 3 && structural_expected_jobs == 3 && active_expected_jobs == 0 && vault_secret_count == 1 && running_cron_jobs == 0 && pending_http_requests == 0 )) \
  || die "pos-restore inseguro (jobs=$expected_jobs distintos=$distinct_expected_jobs validos=$structural_expected_jobs ativos=$active_expected_jobs vault=$vault_secret_count running=$running_cron_jobs pg_net=$pending_http_requests)"
[[ "$(docker exec supabase-db psql -XAt -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'SHOW cron.launch_active_jobs;')" == 'off' ]] \
  || die 'o gate global de pg_cron foi aberto inesperadamente durante o pos-restore'
log 'Pos-restore aplicado; os tres jobs estao inativos e o gate global permanece fechado'
