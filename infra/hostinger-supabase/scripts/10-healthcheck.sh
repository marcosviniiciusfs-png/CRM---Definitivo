#!/usr/bin/env bash

# Host, containers, API, port exposure and recent-backup health check.
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
require_command curl date docker jq mktemp ss stat systemctl timeout

BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-/etc/crm-supabase/backup.env}"
if [[ -f "$BACKUP_ENV_FILE" ]]; then
  load_env_file "$BACKUP_ENV_FILE"
fi
export -n ALERT_WEBHOOK_URL 2>/dev/null || true
[[ "$INSTALL_DIR" == "$expected_install_dir" ]] || die 'INSTALL_DIR em backup.env diverge de versions.conf'
[[ "$BACKUP_DIR" == "$expected_backup_dir" ]] || die 'BACKUP_DIR em backup.env diverge de versions.conf'
load_env_file "$INSTALL_DIR/.env"
export -n ALERT_WEBHOOK_URL 2>/dev/null || true

BACKUP_MODE="${BACKUP_MODE:-restic-offsite}"
case "$BACKUP_MODE" in
  restic-offsite)
    ;;
  managed-source-cold)
    [[ "${COLD_BACKUP_PROJECT_REF:-}" == 'uxttihjsxfowursjyult' ]] \
      || die 'COLD_BACKUP_PROJECT_REF diverge do projeto Supabase mantido como backup frio'
    require_managed_source_cold_approval "$COLD_BACKUP_PROJECT_REF"
    ;;
  *)
    die 'BACKUP_MODE deve ser restic-offsite ou managed-source-cold'
    ;;
esac

failures=()

is_secure_root_file() {
  local file="$1"
  local file_mode

  [[ -f "$file" && ! -L "$file" ]] || return 1
  [[ "$(stat -c '%u' "$file" 2>/dev/null)" == '0' ]] || return 1
  file_mode="$(stat -c '%a' "$file" 2>/dev/null)" || return 1
  [[ "$file_mode" =~ ^[0-7]{3,4}$ ]] || return 1
  (( (8#$file_mode & 8#077) == 0 )) || return 1
  [[ -r "$file" ]]
}

EXPECTED_CRON_LAUNCH_STATE="${EXPECTED_CRON_LAUNCH_STATE:-on}"
EXPECTED_ACTIVE_CRON_JOBS="${EXPECTED_ACTIVE_CRON_JOBS-send-scheduled-reminders,auto-redistribute-leads}"
PG_NET_QUEUE_MAX_PENDING="${PG_NET_QUEUE_MAX_PENDING:-4}"
PG_CRON_MAX_RUNNING_JOBS="${PG_CRON_MAX_RUNNING_JOBS:-3}"
CRON_RUNNING_MAX_AGE_MINUTES="${CRON_RUNNING_MAX_AGE_MINUTES:-5}"
CRON_FAILURE_LOOKBACK_MINUTES="${CRON_FAILURE_LOOKBACK_MINUTES:-15}"
SLOW_QUERY_MEAN_WARN_MS="${SLOW_QUERY_MEAN_WARN_MS:-1000}"
SLOW_QUERY_MIN_CALLS="${SLOW_QUERY_MIN_CALLS:-5}"
RETENTION_LAST_SUCCESS_MAX_MINUTES="${RETENTION_LAST_SUCCESS_MAX_MINUTES:-150}"
RETENTION_BACKLOG_GRACE_MINUTES="${RETENTION_BACKLOG_GRACE_MINUTES:-75}"
RETENTION_ELIGIBLE_MAX_OBJECTS="${RETENTION_ELIGIBLE_MAX_OBJECTS:-4000}"
RETENTION_INITIAL_GRACE_MINUTES="${RETENTION_INITIAL_GRACE_MINUTES:-60}"
[[ "$EXPECTED_CRON_LAUNCH_STATE" == 'on' || "$EXPECTED_CRON_LAUNCH_STATE" == 'off' ]] \
  || die 'EXPECTED_CRON_LAUNCH_STATE deve ser on ou off'
expect_send_scheduled_reminders=false
expect_auto_redistribute_leads=false
expect_sync_google_sheets=false
expected_active_cron_job_count=0
if [[ -n "$EXPECTED_ACTIVE_CRON_JOBS" ]]; then
  IFS=',' read -r -a requested_active_cron_jobs <<<"$EXPECTED_ACTIVE_CRON_JOBS"
  for requested_cron_job in "${requested_active_cron_jobs[@]}"; do
    case "$requested_cron_job" in
      send-scheduled-reminders)
        [[ "$expect_send_scheduled_reminders" == false ]] || die 'EXPECTED_ACTIVE_CRON_JOBS contem duplicata'
        expect_send_scheduled_reminders=true
        ;;
      auto-redistribute-leads)
        [[ "$expect_auto_redistribute_leads" == false ]] || die 'EXPECTED_ACTIVE_CRON_JOBS contem duplicata'
        expect_auto_redistribute_leads=true
        ;;
      sync-google-sheets)
        [[ "$expect_sync_google_sheets" == false ]] || die 'EXPECTED_ACTIVE_CRON_JOBS contem duplicata'
        expect_sync_google_sheets=true
        ;;
      *)
        die 'EXPECTED_ACTIVE_CRON_JOBS contem nome fora da allowlist'
        ;;
    esac
    expected_active_cron_job_count=$((expected_active_cron_job_count + 1))
  done
fi
(( expected_active_cron_job_count <= 3 )) \
  || die 'EXPECTED_ACTIVE_CRON_JOBS aceita de zero a tres jobs allowlisted'

expected_job_names_sql="'send-scheduled-reminders','auto-redistribute-leads','sync-google-sheets'"
expected_job_structure_sql="(
  (jobname = 'send-scheduled-reminders' AND schedule = '* * * * *' AND position('/functions/v1/send-scheduled-reminders' IN command) > 0)
  OR (jobname = 'auto-redistribute-leads' AND schedule = '*/5 * * * *' AND position('/functions/v1/auto-redistribute-leads' IN command) > 0)
  OR (jobname = 'sync-google-sheets' AND schedule = '*/2 * * * *' AND position('/functions/v1/sync-google-sheets' IN command) > 0)
) AND position('http://api-gw:8000/functions/v1/' IN command) > 0
  AND position('x-cron-secret' IN command) > 0
  AND position('Bearer eyJ' IN command) = 0"
[[ "$PG_NET_QUEUE_MAX_PENDING" =~ ^[0-9]+$ ]] \
  || die 'PG_NET_QUEUE_MAX_PENDING deve ser inteiro nao negativo'
[[ "$PG_CRON_MAX_RUNNING_JOBS" =~ ^[0-9]+$ ]] \
  || die 'PG_CRON_MAX_RUNNING_JOBS deve ser inteiro nao negativo'
[[ "$CRON_RUNNING_MAX_AGE_MINUTES" =~ ^[0-9]+$ && "$CRON_RUNNING_MAX_AGE_MINUTES" -ge 1 ]] \
  || die 'CRON_RUNNING_MAX_AGE_MINUTES deve ser inteiro positivo'
[[ "$CRON_FAILURE_LOOKBACK_MINUTES" =~ ^[0-9]+$ && "$CRON_FAILURE_LOOKBACK_MINUTES" -ge 1 ]] \
  || die 'CRON_FAILURE_LOOKBACK_MINUTES deve ser inteiro positivo'
[[ "$SLOW_QUERY_MEAN_WARN_MS" =~ ^[0-9]+$ && "$SLOW_QUERY_MEAN_WARN_MS" -ge 1 ]] \
  || die 'SLOW_QUERY_MEAN_WARN_MS deve ser inteiro positivo'
[[ "$SLOW_QUERY_MIN_CALLS" =~ ^[0-9]+$ && "$SLOW_QUERY_MIN_CALLS" -ge 1 ]] \
  || die 'SLOW_QUERY_MIN_CALLS deve ser inteiro positivo'
[[ "$RETENTION_LAST_SUCCESS_MAX_MINUTES" =~ ^[0-9]+$ && "$RETENTION_LAST_SUCCESS_MAX_MINUTES" -ge 70 ]] \
  || die 'RETENTION_LAST_SUCCESS_MAX_MINUTES deve ser inteiro de ao menos 70'
[[ "$RETENTION_BACKLOG_GRACE_MINUTES" =~ ^[0-9]+$ && "$RETENTION_BACKLOG_GRACE_MINUTES" -ge 65 ]] \
  || die 'RETENTION_BACKLOG_GRACE_MINUTES deve ser inteiro de ao menos 65'
[[ "$RETENTION_ELIGIBLE_MAX_OBJECTS" =~ ^[0-9]+$ && "$RETENTION_ELIGIBLE_MAX_OBJECTS" -ge 2000 ]] \
  || die 'RETENTION_ELIGIBLE_MAX_OBJECTS deve ser inteiro de ao menos 2000'
[[ "$RETENTION_INITIAL_GRACE_MINUTES" =~ ^[0-9]+$ && "$RETENTION_INITIAL_GRACE_MINUTES" -ge 30 ]] \
  || die 'RETENTION_INITIAL_GRACE_MINUTES deve ser inteiro de ao menos 30'

mapfile -t services < <(compose config --services)
for service in "${services[@]}"; do
  container_id="$(compose ps -a -q "$service" 2>/dev/null || true)"
  if [[ -z "$container_id" ]]; then
    failures+=("container ausente: $service")
    continue
  fi
  state="$(docker inspect --format '{{.State.Status}}' "$container_id")"
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id")"
  if [[ "$state" != 'running' || ( "$health" != 'healthy' && "$health" != 'none' ) ]]; then
    failures+=("container $service: state=$state health=$health")
  fi
done

db_health_output=''
if db_health_output="$(docker exec supabase-db psql -XAt -F '|' -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT current_database(), pg_is_in_recovery(), current_setting('transaction_read_only'), (to_regclass('public.profiles') IS NOT NULL AND to_regclass('auth.users') IS NOT NULL AND to_regclass('storage.buckets') IS NOT NULL AND to_regclass('storage.objects') IS NOT NULL AND to_regclass('storage.migrations') IS NOT NULL), current_setting('cron.launch_active_jobs', true), count(*) FILTER (WHERE jobname IN ($expected_job_names_sql)), count(DISTINCT jobname) FILTER (WHERE jobname IN ($expected_job_names_sql)), count(*) FILTER (WHERE $expected_job_structure_sql), count(*) FILTER (WHERE jobname = 'send-scheduled-reminders' AND active), count(*) FILTER (WHERE jobname = 'auto-redistribute-leads' AND active), count(*) FILTER (WHERE jobname = 'sync-google-sheets' AND active), (SELECT count(*) FROM vault.secrets WHERE name = 'crm_cron_secret'), (SELECT count(*) FROM cron.job_run_details WHERE status = 'running'), (SELECT count(*) FROM cron.job_run_details WHERE status = 'running' AND start_time < clock_timestamp() - make_interval(mins => $CRON_RUNNING_MAX_AGE_MINUTES)), (SELECT count(*) FROM cron.job_run_details WHERE status = 'failed' AND start_time >= clock_timestamp() - make_interval(mins => $CRON_FAILURE_LOOKBACK_MINUTES)), (SELECT count(*) FROM net.http_request_queue) FROM cron.job;" 2>/dev/null)"; then
  IFS='|' read -r database_name database_in_recovery database_read_only required_tables_ready cron_launch_state expected_jobs distinct_expected_jobs structural_expected_jobs send_scheduled_reminders_active auto_redistribute_leads_active sync_google_sheets_active vault_secret_count running_cron_jobs stuck_cron_jobs recent_failed_cron_jobs pending_http_requests <<<"$db_health_output"

  [[ "$database_name" == 'postgres' ]] || failures+=("banco inesperado: $database_name")
  [[ "$database_in_recovery" == 'f' && "$database_read_only" == 'off' ]] \
    || failures+=("banco nao gravavel: recovery=$database_in_recovery read_only=$database_read_only")
  [[ "$required_tables_ready" == 't' ]] || failures+=('schemas/tabelas obrigatorios ausentes')
  [[ "$cron_launch_state" == "$EXPECTED_CRON_LAUNCH_STATE" ]] \
    || failures+=("cron.launch_active_jobs=$cron_launch_state, esperado=$EXPECTED_CRON_LAUNCH_STATE")

  if [[ "$expected_jobs" =~ ^[0-9]+$ && "$distinct_expected_jobs" =~ ^[0-9]+$ && "$structural_expected_jobs" =~ ^[0-9]+$ ]]; then
    (( expected_jobs == 3 && distinct_expected_jobs == 3 && structural_expected_jobs == 3 )) \
      || failures+=("jobs cron invalidos: total=$expected_jobs distintos=$distinct_expected_jobs estruturais=$structural_expected_jobs")
  else
    failures+=('nao foi possivel validar os jobs cron esperados')
  fi

  expected_send_active=0
  expected_auto_active=0
  expected_sync_google_active=0
  [[ "$expect_send_scheduled_reminders" == true ]] && expected_send_active=1
  [[ "$expect_auto_redistribute_leads" == true ]] && expected_auto_active=1
  [[ "$expect_sync_google_sheets" == true ]] && expected_sync_google_active=1
  [[ "$send_scheduled_reminders_active" == "$expected_send_active" ]] \
    || failures+=("send-scheduled-reminders active=$send_scheduled_reminders_active esperado=$expected_send_active")
  [[ "$auto_redistribute_leads_active" == "$expected_auto_active" ]] \
    || failures+=("auto-redistribute-leads active=$auto_redistribute_leads_active esperado=$expected_auto_active")
  [[ "$sync_google_sheets_active" == "$expected_sync_google_active" ]] \
    || failures+=("sync-google-sheets active=$sync_google_sheets_active esperado=$expected_sync_google_active")

  [[ "$vault_secret_count" =~ ^[0-9]+$ && "$vault_secret_count" -eq 1 ]] \
    || failures+=("registros do segredo cron no Vault: ${vault_secret_count:-invalido}")
  [[ "$running_cron_jobs" =~ ^[0-9]+$ && "$running_cron_jobs" -le "$PG_CRON_MAX_RUNNING_JOBS" ]] \
    || failures+=("jobs cron simultaneamente em execucao: ${running_cron_jobs:-invalido}")
  [[ "$stuck_cron_jobs" =~ ^[0-9]+$ && "$stuck_cron_jobs" -eq 0 ]] \
    || failures+=("jobs cron travados: ${stuck_cron_jobs:-invalido}")
  [[ "$recent_failed_cron_jobs" =~ ^[0-9]+$ && "$recent_failed_cron_jobs" -eq 0 ]] \
    || failures+=("falhas recentes de cron: ${recent_failed_cron_jobs:-invalido}")
  [[ "$pending_http_requests" =~ ^[0-9]+$ && "$pending_http_requests" -le "$PG_NET_QUEUE_MAX_PENDING" ]] \
    || failures+=("fila pg_net pendente: ${pending_http_requests:-invalido}")
else
  failures+=('consulta de saude do PostgreSQL/cron/pg_net falhou')
fi

storage_schema_health=''
if storage_schema_health="$(docker exec supabase-db psql -XAt -F '|' -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "WITH expected(id,name,hash) AS (VALUES (61,'mark-filename-immutable'::text,'fe0096517ae9d60aaec1d110172ba9036dc66bb7'::text),(62,'object-versioning-core'::text,'0b855f00ff3be0bfca91efee02a9858912491a9a'::text),(63,'fix-search-name-relative-to-prefix'::text,'c7485e417624f795ce8bb2da21927f48e088904d'::text),(64,'fix-search-by-timestamp-sqli'::text,'0af424ecd388a39bb1645184b222185a12149675'::text)), timestamp_function AS (SELECT pg_get_functiondef(p.oid) AS definition FROM pg_proc p WHERE p.oid=to_regprocedure('storage.search_by_timestamp(text,text,integer,integer,text,text,text,text)')) SELECT (SELECT count(actual.id)=4 AND bool_and((actual.id,actual.name,actual.hash::text)=(expected.id,expected.name,expected.hash)) FROM expected LEFT JOIN storage.migrations actual ON actual.id=expected.id), COALESCE((SELECT max(id)=64 FROM storage.migrations),false), COALESCE((SELECT provolatile='i' AND NOT prosecdef FROM pg_proc WHERE oid=to_regprocedure('storage.filename(text)')),false), COALESCE((SELECT provolatile='s' AND NOT prosecdef FROM pg_proc WHERE oid=to_regprocedure('storage.search(text,text,integer,integer,integer,text,text,text)')),false), COALESCE((SELECT provolatile='s' AND NOT prosecdef FROM pg_proc WHERE oid=to_regprocedure('storage.search_by_timestamp(text,text,integer,integer,text,text,text,text)')),false), COALESCE((SELECT position('v_sort_order NOT IN (''asc'', ''desc'')' IN definition)>0 AND position('v_sort_column NOT IN (''updated_at'', ''created_at'')' IN definition)>0 FROM timestamp_function),false);" 2>/dev/null)"; then
  IFS='|' read -r storage_migrations_exact storage_migration_ceiling filename_immutable search_hardened timestamp_search_hardened timestamp_search_allowlisted <<<"$storage_schema_health"
  [[ "$storage_migrations_exact" == 't' \
     && "$storage_migration_ceiling" == 't' \
     && "$filename_immutable" == 't' \
     && "$search_hardened" == 't' \
     && "$timestamp_search_hardened" == 't' \
     && "$timestamp_search_allowlisted" == 't' ]] \
    || failures+=('schema do Storage divergiu das migrations oficiais 61-64')
else
  failures+=('nao foi possivel validar as migrations oficiais 61-64 do Storage')
fi

if slow_query_metrics="$(docker exec supabase-db psql -XAt -F '|' -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT COALESCE(max(mean_exec_time), 0)::bigint, count(*) FILTER (WHERE calls >= $SLOW_QUERY_MIN_CALLS AND mean_exec_time >= $SLOW_QUERY_MEAN_WARN_MS) FROM pg_stat_statements WHERE calls >= $SLOW_QUERY_MIN_CALLS;" 2>/dev/null)"; then
  IFS='|' read -r max_mean_query_ms slow_query_count <<<"$slow_query_metrics"
  if [[ "$max_mean_query_ms" =~ ^[0-9]+$ && "$slow_query_count" =~ ^[0-9]+$ ]]; then
    (( slow_query_count == 0 )) \
      || failures+=("consultas com media lenta: $slow_query_count (maior media=${max_mean_query_ms}ms)")
  else
    failures+=('metricas agregadas de consultas lentas invalidas')
  fi
else
  failures+=('pg_stat_statements indisponivel para monitorar consultas lentas')
fi

retention_health_state='disabled'
retention_eligible_objects='n/a'
retention_overdue_objects='n/a'
retention_enabled_marker="$INSTALL_DIR/.crm-chat-media-retention-enabled"
if [[ -e "$retention_enabled_marker" || -L "$retention_enabled_marker" ]]; then
  retention_health_state='enabled'
  retention_restore_marker="$INSTALL_DIR/.crm-last-restore"
  retention_discard_marker="$INSTALL_DIR/.crm-chat-media-discarded"
  retention_marker_chain_valid=true
  if [[ -e "$INSTALL_DIR/.crm-restore-in-progress" \
     || -L "$INSTALL_DIR/.crm-restore-in-progress" ]]; then
    failures+=('restore em andamento enquanto a retencao esta habilitada')
    retention_marker_chain_valid=false
  fi
  for retention_marker_file in \
    "$retention_restore_marker" \
    "$retention_discard_marker" \
    "$retention_enabled_marker"; do
    if ! is_secure_root_file "$retention_marker_file"; then
      failures+=('marcador da retencao ausente, symlink ou sem protecao root/0600')
      retention_marker_chain_valid=false
    fi
  done

  retention_restore_sha=''
  retention_enabled_at_utc=''
  retention_enabled_epoch=''
  if [[ "$retention_marker_chain_valid" == true ]]; then
    retention_restore_sha="$(env_file_value "$retention_restore_marker" manifest_sha256)"
    retention_enabled_at_utc="$(env_file_value "$retention_enabled_marker" enabled_at_utc)"
    retention_discarded_objects="$(env_file_value "$retention_discard_marker" discarded_objects)"
    retention_discarded_bytes="$(env_file_value "$retention_discard_marker" discarded_bytes)"
    if [[ "$(env_file_value "$retention_restore_marker" status)" != 'restored' \
       || ! "$retention_restore_sha" =~ ^[0-9a-f]{64}$ \
       || "$(env_file_value "$retention_discard_marker" status)" != 'discarded' \
       || "$(env_file_value "$retention_discard_marker" restore_manifest_sha256)" != "$retention_restore_sha" \
       || ! "$retention_discarded_objects" =~ ^[0-9]+$ \
       || ! "$retention_discarded_bytes" =~ ^[0-9]+$ \
       || "$(env_file_value "$retention_discard_marker" objects_without_numeric_size)" != '0' \
       || "$(env_file_value "$retention_enabled_marker" status)" != 'enabled' \
       || "$(env_file_value "$retention_enabled_marker" restore_manifest_sha256)" != "$retention_restore_sha" \
       || "$(env_file_value "$retention_enabled_marker" retention_days)" != '7' ]]; then
      failures+=('cadeia restore/descarte/ativacao da retencao e invalida')
      retention_marker_chain_valid=false
    fi
    if [[ "$retention_enabled_at_utc" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]; then
      retention_enabled_epoch="$(date -d "$retention_enabled_at_utc" +%s 2>/dev/null || true)"
    fi
    if [[ ! "$retention_enabled_epoch" =~ ^[0-9]+$ ]]; then
      failures+=('timestamp de ativacao da retencao e invalido')
      retention_enabled_epoch=''
    elif (( retention_enabled_epoch > $(date +%s) + 300 )); then
      failures+=('timestamp de ativacao da retencao esta no futuro')
    fi
  fi

  systemctl is-enabled --quiet crm-supabase-chat-media-retention.timer \
    || failures+=('timer de retencao nao esta habilitado')
  systemctl is-active --quiet crm-supabase-chat-media-retention.timer \
    || failures+=('timer de retencao nao esta ativo')
  if systemctl is-failed --quiet crm-supabase-chat-media-retention.service; then
    failures+=('ultima execucao do servico de retencao falhou')
  fi

  retention_success_marker="$BACKUP_DIR/retention/chat-media.last-success"
  if [[ -e "$retention_success_marker" || -L "$retention_success_marker" ]]; then
    if ! is_secure_root_file "$retention_success_marker"; then
      failures+=('marcador de sucesso da retencao esta sem protecao root/0600')
    else
      retention_completed_at_utc="$(env_file_value "$retention_success_marker" completed_at_utc)"
      if [[ "$(env_file_value "$retention_success_marker" status)" != 'success' \
         || "$(env_file_value "$retention_success_marker" restore_manifest_sha256)" != "$retention_restore_sha" \
         || "$(env_file_value "$retention_success_marker" retention_days)" != '7' ]]; then
        failures+=('marcador de sucesso da retencao nao pertence ao restore atual')
      fi
      retention_completed_epoch=''
      if [[ "$retention_completed_at_utc" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]; then
        retention_completed_epoch="$(date -d "$retention_completed_at_utc" +%s 2>/dev/null || true)"
      fi
      if [[ ! "$retention_completed_epoch" =~ ^[0-9]+$ ]]; then
        failures+=('timestamp do ultimo sucesso da retencao e invalido')
      else
        retention_success_age_seconds=$(( $(date +%s) - retention_completed_epoch ))
        if (( retention_success_age_seconds < -300 )); then
          failures+=('ultimo sucesso da retencao possui timestamp no futuro')
        elif [[ "$retention_enabled_epoch" =~ ^[0-9]+$ ]] \
           && (( retention_completed_epoch < retention_enabled_epoch )); then
          retention_initial_age_seconds=$(( $(date +%s) - retention_enabled_epoch ))
          if (( retention_initial_age_seconds > RETENTION_INITIAL_GRACE_MINUTES * 60 )); then
            failures+=("retencao reativada ha mais de ${RETENTION_INITIAL_GRACE_MINUTES}min sem novo sucesso registrado")
          fi
        elif (( retention_success_age_seconds > RETENTION_LAST_SUCCESS_MAX_MINUTES * 60 )); then
          failures+=("ultima retencao bem-sucedida tem mais de ${RETENTION_LAST_SUCCESS_MAX_MINUTES}min")
        fi
      fi
    fi
  elif [[ "$retention_enabled_epoch" =~ ^[0-9]+$ ]]; then
    retention_initial_age_seconds=$(( $(date +%s) - retention_enabled_epoch ))
    if (( retention_initial_age_seconds > RETENTION_INITIAL_GRACE_MINUTES * 60 )); then
      failures+=("retencao habilitada ha mais de ${RETENTION_INITIAL_GRACE_MINUTES}min sem sucesso registrado")
    fi
  fi

  if retention_backlog_metrics="$(docker exec supabase-db psql -XAtq -F '|' -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -c 'BEGIN TRANSACTION READ ONLY;' \
    -c "SELECT current_setting('transaction_read_only'), (SELECT count(*) FROM storage.buckets WHERE id = 'chat-media'), COALESCE((SELECT bool_and(public) FROM storage.buckets WHERE id = 'chat-media'), false), count(*) FILTER (WHERE COALESCE(updated_at, created_at) < clock_timestamp() - interval '7 days'), count(*) FILTER (WHERE COALESCE(updated_at, created_at) < clock_timestamp() - (interval '7 days' + make_interval(mins => $RETENTION_BACKLOG_GRACE_MINUTES))), COALESCE(extract(epoch FROM clock_timestamp() - min(COALESCE(updated_at, created_at)) FILTER (WHERE COALESCE(updated_at, created_at) < clock_timestamp() - interval '7 days'))::bigint, 0) FROM storage.objects WHERE bucket_id = 'chat-media';" \
    -c 'COMMIT;' 2>/dev/null)"; then
    IFS='|' read -r retention_sql_read_only retention_bucket_count retention_bucket_public retention_eligible_objects retention_overdue_objects retention_oldest_eligible_age_seconds <<<"$retention_backlog_metrics"
    if [[ "$retention_sql_read_only" != 'on' \
       || ! "$retention_bucket_count" =~ ^[0-9]+$ \
       || ! "$retention_eligible_objects" =~ ^[0-9]+$ \
       || ! "$retention_overdue_objects" =~ ^[0-9]+$ \
       || ! "$retention_oldest_eligible_age_seconds" =~ ^[0-9]+$ ]]; then
      failures+=('metricas agregadas da retencao sao invalidas')
    else
      [[ "$retention_bucket_count" == '1' && "$retention_bucket_public" == 't' ]] \
        || failures+=('chat-media nao existe uma vez como bucket publico')
      (( retention_eligible_objects <= RETENTION_ELIGIBLE_MAX_OBJECTS )) \
        || failures+=("backlog elegivel de chat-media excede ${RETENTION_ELIGIBLE_MAX_OBJECTS} objetos")
      (( retention_overdue_objects == 0 )) \
        || failures+=("backlog de chat-media ultrapassou a margem de ${RETENTION_BACKLOG_GRACE_MINUTES}min: $retention_overdue_objects objetos")
    fi
  else
    failures+=('consulta read-only do backlog da retencao falhou')
  fi
else
  if systemctl is-enabled --quiet crm-supabase-chat-media-retention.timer 2>/dev/null \
     || systemctl is-active --quiet crm-supabase-chat-media-retention.timer 2>/dev/null; then
    failures+=('timer de retencao esta habilitado/ativo sem marcador de autorizacao')
  fi
  if systemctl is-failed --quiet crm-supabase-chat-media-retention.service 2>/dev/null; then
    failures+=('servico de retencao falhou sem marcador de autorizacao')
  fi
fi

disk_usage="$(df -P "$INSTALL_DIR" | awk 'NR == 2 {gsub(/%/, "", $5); print $5}')"
DISK_USAGE_WARN_PERCENT="${DISK_USAGE_WARN_PERCENT:-85}"
[[ "$DISK_USAGE_WARN_PERCENT" =~ ^[0-9]+$ ]] && (( DISK_USAGE_WARN_PERCENT >= 1 && DISK_USAGE_WARN_PERCENT <= 100 )) \
  || die 'DISK_USAGE_WARN_PERCENT deve ser inteiro entre 1 e 100'
[[ "$disk_usage" =~ ^[0-9]+$ ]] || failures+=('não foi possível ler uso de disco')
if [[ "$disk_usage" =~ ^[0-9]+$ ]] && (( disk_usage >= DISK_USAGE_WARN_PERCENT )); then
  failures+=("disco em ${disk_usage}%")
fi

inode_usage="$(df -Pi "$INSTALL_DIR" | awk 'NR == 2 {gsub(/%/, "", $5); print $5}')"
INODE_USAGE_WARN_PERCENT="${INODE_USAGE_WARN_PERCENT:-85}"
[[ "$INODE_USAGE_WARN_PERCENT" =~ ^[0-9]+$ ]] && (( INODE_USAGE_WARN_PERCENT >= 1 && INODE_USAGE_WARN_PERCENT <= 100 )) \
  || die 'INODE_USAGE_WARN_PERCENT deve ser inteiro entre 1 e 100'
[[ "$inode_usage" =~ ^[0-9]+$ ]] || failures+=('nao foi possivel ler uso de inodes')
if [[ "$inode_usage" =~ ^[0-9]+$ ]] && (( inode_usage >= INODE_USAGE_WARN_PERCENT )); then
  failures+=("inodes em ${inode_usage}%")
fi

if ss -H -ltn | awk '{print $4}' | grep -Eq '^(0\.0\.0\.0|\[::\]|\*):(5432|6543|8000)$'; then
  failures+=('porta interna publicada globalmente')
fi

if [[ ! "${SUPABASE_PUBLIC_URL:-}" =~ ^https:// ]]; then
  failures+=('SUPABASE_PUBLIC_URL ausente ou sem HTTPS')
elif [[ -z "${ANON_KEY:-}" ]]; then
  failures+=('ANON_KEY ausente para validar Auth health externo')
else
  auth_health_code=''
  if ! auth_health_code="$(
    printf 'header = "apikey: %s"\n' "$ANON_KEY" \
      | curl --silent --show-error --config - --connect-timeout 5 --max-time 15 \
          --output /dev/null --write-out '%{http_code}' \
          "${SUPABASE_PUBLIC_URL%/}/auth/v1/health"
  )"; then
    failures+=('Auth health externo indisponível')
  elif [[ ! "$auth_health_code" =~ ^2[0-9]{2}$ ]]; then
    failures+=("Auth health externo respondeu HTTP $auth_health_code")
  fi
fi
unset ANON_KEY auth_health_code

if [[ "$BACKUP_MODE" == 'restic-offsite' ]]; then
MAX_BACKUP_AGE_HOURS="${MAX_BACKUP_AGE_HOURS:-12}"
[[ "$MAX_BACKUP_AGE_HOURS" =~ ^[0-9]+$ ]] && (( MAX_BACKUP_AGE_HOURS >= 1 )) \
  || die 'MAX_BACKUP_AGE_HOURS deve ser inteiro positivo'
latest_marker="$(find "$BACKUP_DIR/logical" -mindepth 2 -maxdepth 2 -type f -name .complete -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 || true)"
if [[ -z "$latest_marker" ]]; then
  failures+=('nenhum backup completo encontrado')
else
  latest_epoch="${latest_marker%% *}"
  latest_epoch="${latest_epoch%%.*}"
  age_seconds=$(( $(date +%s) - latest_epoch ))
  if (( age_seconds > MAX_BACKUP_AGE_HOURS * 3600 )); then
    failures+=("último backup tem mais de ${MAX_BACKUP_AGE_HOURS}h")
  fi
fi

RESTIC_REMOTE_CHECK_TIMEOUT_SECONDS="${RESTIC_REMOTE_CHECK_TIMEOUT_SECONDS:-45}"
[[ "$RESTIC_REMOTE_CHECK_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] \
  && (( RESTIC_REMOTE_CHECK_TIMEOUT_SECONDS >= 5 && RESTIC_REMOTE_CHECK_TIMEOUT_SECONDS <= 300 )) \
  || die 'RESTIC_REMOTE_CHECK_TIMEOUT_SECONDS deve ser inteiro entre 5 e 300'

if [[ -n "${RESTIC_REPOSITORY:-}" || -n "${RESTIC_PASSWORD_FILE:-}" ]]; then
  restic_ready=true
  if [[ -z "${RESTIC_REPOSITORY:-}" || -z "${RESTIC_PASSWORD_FILE:-}" ]]; then
    failures+=('configuracao Restic remota incompleta')
    restic_ready=false
  fi
  case "${RESTIC_REPOSITORY:-}" in
    REPLACE*|*S3_ENDPOINT*|your-*|YOUR_*)
      failures+=('RESTIC_REPOSITORY ainda contem placeholder')
      restic_ready=false
      ;;
  esac
  if ! command -v restic >/dev/null 2>&1; then
    failures+=('comando restic ausente para validar snapshot remoto')
    restic_ready=false
  fi
  if [[ ! -f "${RESTIC_PASSWORD_FILE:-}" || ! -r "${RESTIC_PASSWORD_FILE:-}" ]]; then
    failures+=('arquivo de senha Restic ausente ou ilegivel')
    restic_ready=false
  elif [[ "$(stat -c '%u' "$RESTIC_PASSWORD_FILE")" != '0' ]]; then
    failures+=('arquivo de senha Restic nao pertence a root')
    restic_ready=false
  else
    restic_password_mode="$(stat -c '%a' "$RESTIC_PASSWORD_FILE")"
    if (( (8#$restic_password_mode & 8#077) != 0 )); then
      failures+=('arquivo de senha Restic possui permissoes inseguras')
      restic_ready=false
    fi
  fi
  if [[ "${RESTIC_REPOSITORY:-}" == s3:* ]]; then
    for restic_credential in AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
      restic_credential_value="${!restic_credential:-}"
      if [[ -z "$restic_credential_value" || "$restic_credential_value" == REPLACE* ]]; then
        failures+=("credencial Restic S3 ausente: $restic_credential")
        restic_ready=false
      fi
    done
  fi

  if [[ "$restic_ready" == true ]]; then
    RESTIC_CACHE_DIR="${RESTIC_CACHE_DIR:-$BACKUP_DIR/restic-cache}"
    export RESTIC_CACHE_DIR
    if remote_snapshots_json="$(timeout "${RESTIC_REMOTE_CHECK_TIMEOUT_SECONDS}s" \
      restic snapshots --tag crm-supabase --latest 1 --json 2>/dev/null)"; then
      if remote_snapshot_time="$(jq -er \
        --arg storage_path "$INSTALL_DIR/volumes/storage" \
        --arg logical_prefix "$BACKUP_DIR/logical/" \
        '
          if type == "array" and length > 0
          then sort_by(.time) | last
          else empty
          end
          | select(any(.paths[]?; . == $storage_path or startswith($storage_path + "/")))
          | select(any(.paths[]?; startswith($logical_prefix)))
          | .time
        ' <<<"$remote_snapshots_json")"; then
        if remote_snapshot_epoch="$(date -d "$remote_snapshot_time" +%s 2>/dev/null)"; then
          remote_snapshot_age_seconds=$(( $(date +%s) - remote_snapshot_epoch ))
          if (( remote_snapshot_age_seconds < -300 )); then
            failures+=('snapshot Restic remoto possui timestamp no futuro')
          elif (( remote_snapshot_age_seconds > MAX_BACKUP_AGE_HOURS * 3600 )); then
            failures+=("snapshot Restic remoto tem mais de ${MAX_BACKUP_AGE_HOURS}h")
          fi
        else
          failures+=('timestamp do snapshot Restic remoto e invalido')
        fi
      else
        failures+=('snapshot Restic remoto recente nao contem DB e Storage esperados')
      fi
    else
      failures+=('repositorio Restic remoto inacessivel ou sem snapshot valido')
    fi
  fi
fi
else
  production_marker="$INSTALL_DIR/.crm-production-cutover-complete"
  if [[ -e "$production_marker" || -L "$production_marker" ]]; then
    if ! is_secure_root_file "$production_marker"; then
      failures+=('marcador de producao ausente, symlink ou sem protecao root/0600')
    elif [[ "$(grep -c '^source_state=' "$production_marker" || true)" != '1' \
       || "$(grep -c '^backup_mode=' "$production_marker" || true)" != '1' \
       || "$(env_file_value "$production_marker" source_state)" != 'frozen-cold-rollback' \
       || "$(env_file_value "$production_marker" backup_mode)" != 'managed-source-cold' ]]; then
      failures+=('marcador de producao diverge do backup frio autorizado')
    fi
  fi

  for cold_disabled_timer in crm-supabase-backup.timer crm-supabase-maintenance.timer; do
    cold_timer_enabled_state="$(systemctl is-enabled "$cold_disabled_timer" 2>/dev/null || true)"
    cold_timer_active_state="$(systemctl is-active "$cold_disabled_timer" 2>/dev/null || true)"
    [[ "$cold_timer_enabled_state" == 'disabled' ]] \
      || failures+=("timer $cold_disabled_timer nao esta disabled: ${cold_timer_enabled_state:-indisponivel}")
    [[ "$cold_timer_active_state" == 'inactive' ]] \
      || failures+=("timer $cold_disabled_timer nao esta inactive: ${cold_timer_active_state:-indisponivel}")
  done
fi

if (( ${#failures[@]} > 0 )); then
  summary="CRM Supabase healthcheck falhou em $(hostname -s): $(IFS='; '; printf '%s' "${failures[*]}")"
  warn "$summary"
  send_alert "$summary"
  exit 1
fi

log "Healthcheck OK (disco=${disk_usage}% inodes=${inode_usage}% cron=${cron_launch_state:-indisponivel} jobs_ativos=$expected_active_cron_job_count/3 pg_net=${pending_http_requests:-indisponivel} retencao=$retention_health_state elegiveis=$retention_eligible_objects atrasados=$retention_overdue_objects backup=$BACKUP_MODE)"
