#!/usr/bin/env bash

# Copy Supabase Storage through the S3 protocol using an ephemeral rclone config.
# shellcheck shell=bash

set -Eeuo pipefail
IFS=$'\n\t'
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

load_versions
require_command jq rclone
[[ $# -eq 1 ]] || die 'uso: 06-sync-storage-rclone.sh <dry-run|final>'
mode="$1"
[[ "$mode" == 'dry-run' || "$mode" == 'final' ]] || die 'modo deve ser dry-run ou final'

MIGRATION_ENV_FILE="${MIGRATION_ENV_FILE:-/etc/crm-supabase/migration.env}"
load_env_file "$MIGRATION_ENV_FILE"
for variable in \
  SOURCE_S3_ENDPOINT SOURCE_S3_REGION SOURCE_S3_ACCESS_KEY_ID SOURCE_S3_SECRET_ACCESS_KEY \
  TARGET_S3_ENDPOINT TARGET_S3_REGION TARGET_S3_ACCESS_KEY_ID TARGET_S3_SECRET_ACCESS_KEY; do
  require_non_placeholder "$variable"
done
require_https_url SOURCE_S3_ENDPOINT
require_https_url TARGET_S3_ENDPOINT
[[ "$SOURCE_S3_REGION" =~ ^[A-Za-z0-9._-]+$ && "$TARGET_S3_REGION" =~ ^[A-Za-z0-9._-]+$ ]] \
  || die 'região S3 contém caracteres inesperados'
for credential in SOURCE_S3_ACCESS_KEY_ID SOURCE_S3_SECRET_ACCESS_KEY TARGET_S3_ACCESS_KEY_ID TARGET_S3_SECRET_ACCESS_KEY; do
  [[ "${!credential}" =~ ^[A-Za-z0-9/+=._~-]+$ ]] || die "$credential contém caracteres inesperados"
done

temp_dir="$(mktemp -d)"
config_file="$temp_dir/rclone.conf"
trap 'rm -rf -- "$temp_dir"' EXIT
cat >"$config_file" <<EOF
[source]
type = s3
provider = Other
env_auth = false
access_key_id = ${SOURCE_S3_ACCESS_KEY_ID}
secret_access_key = ${SOURCE_S3_SECRET_ACCESS_KEY}
endpoint = ${SOURCE_S3_ENDPOINT}
region = ${SOURCE_S3_REGION}
acl = private

[target]
type = s3
provider = Other
env_auth = false
access_key_id = ${TARGET_S3_ACCESS_KEY_ID}
secret_access_key = ${TARGET_S3_SECRET_ACCESS_KEY}
endpoint = ${TARGET_S3_ENDPOINT}
region = ${TARGET_S3_REGION}
acl = private
EOF
chmod 0600 "$config_file"

manifest_root="${MIGRATION_ARTIFACT_DIR:-$BACKUP_DIR/migration}"
install -d -m 0700 "$manifest_root"
manifest="$manifest_root/storage-$(date -u +'%Y%m%dT%H%M%SZ')-$mode.jsonl"
touch "$manifest"
chmod 0600 "$manifest"

mapfile -t discovered_buckets < <(rclone --config "$config_file" lsf source: --dirs-only | sed 's:/$::' | LC_ALL=C sort)
(( ${#discovered_buckets[@]} > 0 )) || die 'nenhum bucket foi encontrado na origem'
discarded_bucket='chat-media'
printf '%s\n' "${discovered_buckets[@]}" | grep -Fxq "$discarded_bucket" \
  || die 'chat-media nao existe na origem; inventario aprovado divergiu'

if [[ -n "${STORAGE_BUCKETS:-}" ]]; then
  IFS=',' read -r -a buckets <<<"$STORAGE_BUCKETS"
else
  buckets=()
  for discovered_bucket in "${discovered_buckets[@]}"; do
    [[ "$discovered_bucket" == "$discarded_bucket" ]] && continue
    buckets+=("$discovered_bucket")
  done
fi

for requested_bucket in "${buckets[@]}"; do
  normalized_requested_bucket="${requested_bucket//[[:space:]]/}"
  [[ "$normalized_requested_bucket" != "$discarded_bucket" ]] \
    || die 'chat-media e descartavel e nunca pode ser copiado; remova-o de STORAGE_BUCKETS'
done

# O restore preserva storage.buckets; o descarte transacional anterior remove
# somente os metadados historicos. Falhar se o bucket nao existir ou se qualquer
# objeto aparecer no destino evita uma copia acidental ou um green reutilizado.
rclone --config "$config_file" lsf "target:$discarded_bucket" --max-depth 1 >/dev/null \
  || die 'chat-media nao existe no destino; a configuracao do bucket deve ser preservada'
discarded_target_size="$(rclone --config "$config_file" size "target:$discarded_bucket" --json)"
[[ "$(jq -r '.count' <<<"$discarded_target_size")" == '0' ]] \
  || die 'chat-media nao esta vazio no destino; execute o descarte target-only antes da copia'
discarded_source_size="$(rclone --config "$config_file" size "source:$discarded_bucket" --json)"

jq -cn \
  --arg bucket "$discarded_bucket" \
  --arg mode "$mode" \
  --argjson source "$discarded_source_size" \
  '{bucket:$bucket,mode:$mode,excluded:true,reason:"approved-discard",source:$source,target_objects:0}' \
  >>"$manifest"

for bucket in "${buckets[@]}"; do
  bucket="${bucket//[[:space:]]/}"
  [[ "$bucket" != "$discarded_bucket" ]] \
    || die 'chat-media e descartavel e nunca pode ser copiado'
  [[ "$bucket" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || die "nome de bucket inválido: $bucket"
  printf '%s\n' "${discovered_buckets[@]}" | grep -Fxq "$bucket" || die "bucket não existe na origem: $bucket"
  rclone --config "$config_file" lsf "target:$bucket" --max-depth 1 >/dev/null \
    || die "bucket não existe no destino (restaure storage.buckets primeiro): $bucket"

  source_size="$(rclone --config "$config_file" size "source:$bucket" --json)"
  log "Storage $mode: bucket $bucket ($(jq -r '.count' <<<"$source_size") objetos)"

  copy_args=(
    --config "$config_file"
    copy "source:$bucket" "target:$bucket"
    --transfers "${RCLONE_TRANSFERS:-8}"
    --checkers "${RCLONE_CHECKERS:-16}"
    --retries "${RCLONE_RETRIES:-5}"
    --low-level-retries "${RCLONE_LOW_LEVEL_RETRIES:-10}"
    --stats 30s
    --stats-one-line
  )
  if [[ "$mode" == 'dry-run' ]]; then
    copy_args+=(--dry-run)
  fi
  rclone "${copy_args[@]}"

  if [[ "$mode" == 'final' ]]; then
    verify_args=(
      --config "$config_file"
      check "source:$bucket" "target:$bucket"
      --checkers "${RCLONE_CHECKERS:-16}"
    )
    if [[ "${RCLONE_VERIFY_DOWNLOAD:-true}" == 'true' ]]; then
      verify_args+=(--download)
    fi
    rclone "${verify_args[@]}"
    target_size="$(rclone --config "$config_file" size "target:$bucket" --json)"
    jq -cn \
      --arg bucket "$bucket" \
      --arg mode "$mode" \
      --argjson source "$source_size" \
      --argjson target "$target_size" \
      '{bucket:$bucket,mode:$mode,source:$source,target:$target,verified:true}' >>"$manifest"
  else
    jq -cn \
      --arg bucket "$bucket" \
      --arg mode "$mode" \
      --argjson source "$source_size" \
      '{bucket:$bucket,mode:$mode,source:$source,verified:false}' >>"$manifest"
  fi
done

log "Sincronização de Storage ($mode) concluída. Manifesto: $manifest"
