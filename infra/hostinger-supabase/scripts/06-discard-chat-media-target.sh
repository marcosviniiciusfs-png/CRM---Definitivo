#!/usr/bin/env bash

# One-time, target-only removal of restored historical chat-media metadata.
# shellcheck shell=bash

set -Eeuo pipefail
IFS=$'\n\t'
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

require_root
load_versions
require_command docker flock mktemp
[[ $# -eq 0 ]] || die 'uso: 06-discard-chat-media-target.sh'

expected_confirmation='YES_DISCARD_ALL_HISTORICAL_CHAT_MEDIA_ON_TARGET'
[[ "${CONFIRM_DISCARD_CHAT_MEDIA:-}" == "$expected_confirmation" ]] \
  || die "confirme o descarte exclusivo do destino com CONFIRM_DISCARD_CHAT_MEDIA=$expected_confirmation"

require_file "$INSTALL_DIR/.crm-supabase-commit"
[[ "$(tr -d '[:space:]' <"$INSTALL_DIR/.crm-supabase-commit")" == "$SUPABASE_COMMIT" ]] \
  || die 'a stack de destino nao esta no commit fixado'

restore_marker="$INSTALL_DIR/.crm-last-restore"
restore_in_progress_marker="$INSTALL_DIR/.crm-restore-in-progress"
discard_marker="$INSTALL_DIR/.crm-chat-media-discarded"
require_secret_file "$restore_marker"
[[ ! -e "$restore_in_progress_marker" ]] \
  || die 'o marcador de restore em andamento ainda existe; descarte recusado'
[[ "$(env_file_value "$restore_marker" status)" == 'restored' ]] \
  || die 'o marcador nao confirma um restore transacional concluido'
restore_manifest_sha256="$(env_file_value "$restore_marker" manifest_sha256)"
[[ "$restore_manifest_sha256" =~ ^[0-9a-f]{64}$ ]] \
  || die 'o marcador de restore nao contem SHA-256 valido'

DISCARD_SQL="${DISCARD_SQL:-$KIT_DIR/sql/discard-chat-media-target.sql}"
require_file "$DISCARD_SQL"

exec 9>"$INSTALL_DIR/.chat-media-discard.lock"
flock -n 9 || die 'outro descarte de chat-media esta em execucao'

compose config --quiet
mapfile -t non_db_services < <(compose config --services | grep -Ev '^db$' || true)
for service in "${non_db_services[@]}"; do
  container_id="$(compose ps -a -q "$service" 2>/dev/null || true)"
  [[ -z "$container_id" ]] && continue
  container_state="$(docker inspect --format '{{.State.Status}}' "$container_id")"
  [[ "$container_state" != 'running' ]] \
    || die "servico $service esta em execucao; mantenha todo produtor parado durante o descarte"
done

compose up -d db
wait_for_container_health supabase-db 240

chat_media_count() {
  docker exec supabase-db psql -XAt -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -c "SELECT count(*) FROM storage.objects WHERE bucket_id = 'chat-media';"
}

if [[ -e "$discard_marker" ]]; then
  require_secret_file "$discard_marker"
  [[ "$(env_file_value "$discard_marker" status)" == 'discarded' ]] \
    || die 'marcador de descarte possui estado invalido'
  [[ "$(env_file_value "$discard_marker" restore_manifest_sha256)" == "$restore_manifest_sha256" ]] \
    || die 'marcador de descarte pertence a outro restore'
  existing_count="$(chat_media_count)"
  [[ "$existing_count" == '0' ]] \
    || die 'chat-media recebeu novos objetos depois do descarte; reexecucao destrutiva recusada'
  log 'chat-media ja foi descartado para este restore e continua vazio'
  exit 0
fi

preflight="$(docker exec supabase-db psql -XAt -F '|' -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT current_database(), current_setting('transaction_read_only'), count(*), bool_and(public), (SELECT count(*) FROM storage.objects WHERE bucket_id = 'chat-media'), (SELECT COALESCE(sum((metadata ->> 'size')::numeric), 0) FROM storage.objects WHERE bucket_id = 'chat-media' AND metadata ->> 'size' ~ '^[0-9]+$'), (SELECT count(*) FROM storage.objects WHERE bucket_id = 'chat-media' AND (metadata ->> 'size' IS NULL OR metadata ->> 'size' !~ '^[0-9]+$')) FROM storage.buckets WHERE id = 'chat-media' GROUP BY current_database(), current_setting('transaction_read_only');")" \
  || die 'falha no preflight de chat-media do destino'
IFS='|' read -r database_name transaction_read_only bucket_count bucket_public object_count object_bytes objects_without_numeric_size <<<"$preflight"
[[ "$database_name" == 'postgres' && "$transaction_read_only" == 'off' ]] \
  || die 'o banco nao e o destino postgres gravavel esperado'
[[ "$bucket_count" == '1' && "$bucket_public" == 't' ]] \
  || die 'chat-media nao existe uma vez como bucket publico; descarte recusado'
[[ "$object_count" =~ ^[0-9]+$ && "$object_bytes" =~ ^[0-9]+$ \
   && "$objects_without_numeric_size" == '0' ]] \
  || die 'inventario restaurado de chat-media e invalido ou contem tamanho nao numerico'

export CRM_CONFIRM_DISCARD_CHAT_MEDIA="$expected_confirmation"
export CRM_CHAT_MEDIA_OBJECT_COUNT="$object_count"
export CRM_CHAT_MEDIA_OBJECT_BYTES="$object_bytes"
{
  printf '%s\n' '\getenv confirm_discard_chat_media CRM_CONFIRM_DISCARD_CHAT_MEDIA'
  printf '%s\n' '\getenv expected_object_count CRM_CHAT_MEDIA_OBJECT_COUNT'
  printf '%s\n' '\getenv expected_object_bytes CRM_CHAT_MEDIA_OBJECT_BYTES'
  cat -- "$DISCARD_SQL"
} | docker exec -i \
  --env CRM_CONFIRM_DISCARD_CHAT_MEDIA \
  --env CRM_CHAT_MEDIA_OBJECT_COUNT \
  --env CRM_CHAT_MEDIA_OBJECT_BYTES \
  supabase-db sh -ceu \
    'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -h 127.0.0.1 -X -U supabase_admin -d postgres --variable ON_ERROR_STOP=1'
unset CRM_CONFIRM_DISCARD_CHAT_MEDIA CRM_CHAT_MEDIA_OBJECT_COUNT CRM_CHAT_MEDIA_OBJECT_BYTES

final_state="$(docker exec supabase-db psql -XAt -F '|' -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT count(*), bool_and(public), (SELECT count(*) FROM storage.objects WHERE bucket_id = 'chat-media') FROM storage.buckets WHERE id = 'chat-media';")"
IFS='|' read -r final_bucket_count final_bucket_public final_object_count <<<"$final_state"
[[ "$final_bucket_count" == '1' && "$final_bucket_public" == 't' && "$final_object_count" == '0' ]] \
  || die 'chat-media nao terminou preservado, publico e vazio'

temp_marker="$(mktemp "${discard_marker}.XXXXXX")"
trap 'rm -f -- "$temp_marker"' EXIT
printf '%s\n' \
  'status=discarded' \
  "completed_at_utc=$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  "restore_manifest_sha256=$restore_manifest_sha256" \
  "discarded_objects=$object_count" \
  "discarded_bytes=$object_bytes" \
  'objects_without_numeric_size=0' \
  >"$temp_marker"
chmod 0600 "$temp_marker"
mv -f -- "$temp_marker" "$discard_marker"
trap - EXIT

log 'chat-media foi preservado vazio somente no destino; a origem nao foi acessada nem alterada'
