#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'
umask 077

install_dir="${1:-/opt/crm-supabase}"
stage_dir="${2:?informe o diretorio de staging}"
target_functions="$install_dir/volumes/functions"

case "$(realpath -m -- "$install_dir")" in
  /opt/crm-supabase) ;;
  *) printf '%s\n' 'install_dir inesperado' >&2; exit 41 ;;
esac

case "$(realpath -m -- "$stage_dir")" in
  /opt/crm-supabase/change-staging/facebook-reentry-*) ;;
  *) printf '%s\n' 'stage_dir inesperado' >&2; exit 42 ;;
esac

test -f "$stage_dir/sql/migration.sql"
test -f "$stage_dir/sql/recovery.sql"
test -f "$stage_dir/facebook-leads-webhook/index.ts"
test -f "$stage_dir/_shared/facebook-lead-policy.ts"

services_restored=false
restore_services() {
  if [[ "$services_restored" != true ]]; then
    cd "$install_dir"
    docker compose up -d realtime >/dev/null 2>&1 || true
    docker compose up -d --no-deps functions >/dev/null 2>&1 || true
  fi
}
trap restore_services EXIT

cd "$install_dir"
docker compose stop functions realtime >/dev/null

{
  printf '%s\n' \
    'BEGIN;' \
    "SET LOCAL lock_timeout='15s';" \
    "SET LOCAL statement_timeout='180s';"
  sed '1s/^\xEF\xBB\xBF//' "$stage_dir/sql/migration.sql"
  printf '%s\n' \
    "SELECT 'MIGRATION_VALIDATION', (SELECT count(*) FROM public.facebook_lead_receipts), (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='facebook_lead_id'), (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='leads' AND indexname='leads_automatic_phone_org_unique');" \
    "NOTIFY pgrst, 'reload schema';" \
    'COMMIT;'
} | docker exec -i supabase-db \
  psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -P pager=off -F '|' -At

install -d -m 0755 \
  "$target_functions/_shared" \
  "$target_functions/facebook-leads-webhook"
install -o root -g root -m 0644 \
  "$stage_dir/_shared/facebook-lead-policy.ts" \
  "$target_functions/_shared/facebook-lead-policy.ts.next"
install -o root -g root -m 0644 \
  "$stage_dir/facebook-leads-webhook/index.ts" \
  "$target_functions/facebook-leads-webhook/index.ts.next"

policy_hash="$(sha256sum "$target_functions/_shared/facebook-lead-policy.ts.next" | awk '{print $1}')"
webhook_hash="$(sha256sum "$target_functions/facebook-leads-webhook/index.ts.next" | awk '{print $1}')"
[[ "$policy_hash" == '7ada2ed9139c3b7685fe7d1d680af1dd08f5a53f4373bb85fb97c75a7088bcbf' ]]
[[ "$webhook_hash" == 'c42b83ee494df09ba988d6688b4b2c3d918f8845ad15afe9e39292a6e30f69d7' ]]

mv -- \
  "$target_functions/_shared/facebook-lead-policy.ts.next" \
  "$target_functions/_shared/facebook-lead-policy.ts"
mv -- \
  "$target_functions/facebook-leads-webhook/index.ts.next" \
  "$target_functions/facebook-leads-webhook/index.ts"

sed '1s/^\xEF\xBB\xBF//' "$stage_dir/sql/recovery.sql" | docker exec -i supabase-db \
  psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -P pager=off -F '|' -At

docker compose up -d realtime >/dev/null
docker compose up -d --no-deps --force-recreate functions >/dev/null

for service_name in supabase-edge-functions realtime-dev.supabase-realtime; do
  final_health=''
  for _attempt in $(seq 1 60); do
    final_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$service_name")"
    if [[ "$final_health" == healthy || "$final_health" == running ]]; then
      break
    fi
    sleep 1
  done
  [[ "$final_health" == healthy || "$final_health" == running ]]
  printf '%s|%s\n' "$service_name" "$final_health"
done

services_restored=true
trap - EXIT
