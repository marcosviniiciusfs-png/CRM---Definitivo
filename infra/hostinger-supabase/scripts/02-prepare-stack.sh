#!/usr/bin/env bash

# Install the pinned official Supabase self-hosted stack without starting it.
# shellcheck shell=bash

set -Eeuo pipefail
IFS=$'\n\t'
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

require_root
load_versions
require_command awk curl docker flock git jq mktemp openssl realpath rsync sha256sum sort stat tar

START_STACK=false
if [[ "${1:-}" == '--start' ]]; then
  START_STACK=true
  shift
fi
[[ $# -eq 0 ]] || die 'uso: 02-prepare-stack.sh [--start]'

PUBLIC_DOMAIN="${PUBLIC_DOMAIN:-api.kairozcrm.com.br}"
SITE_URL_VALUE="${SITE_URL_VALUE:-https://www.kairozcrm.com.br}"
[[ "$PUBLIC_DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || die 'PUBLIC_DOMAIN inválido'
[[ "$SITE_URL_VALUE" =~ ^https://[^[:space:]]+$ ]] || die 'SITE_URL_VALUE precisa usar https://'
PUBLIC_URL="https://$PUBLIC_DOMAIN"
created_env=false
created_functions_env=false

install_supabase_cli() {
  local reported arch asset base_url temp_dir
  reported="$(supabase --version 2>/dev/null || true)"
  if [[ "$reported" == "$SUPABASE_CLI_VERSION" ]]; then
    return 0
  fi

  case "$(uname -m)" in
    x86_64|amd64) arch='amd64' ;;
    aarch64|arm64) arch='arm64' ;;
    *) die "arquitetura sem binário Supabase CLI preparado: $(uname -m)" ;;
  esac
  asset="supabase_${SUPABASE_CLI_VERSION}_linux_${arch}.tar.gz"
  base_url="https://github.com/supabase/cli/releases/download/v${SUPABASE_CLI_VERSION}"
  temp_dir="$(mktemp -d)"
  curl --fail --silent --show-error --location "$base_url/$asset" -o "$temp_dir/$asset"
  curl --fail --silent --show-error --location "$base_url/checksums.txt" -o "$temp_dir/checksums.txt"
  (
    cd "$temp_dir"
    grep -F "  $asset" checksums.txt >selected-checksum.txt \
      || die "checksum do artefato $asset não encontrado"
    sha256sum --check selected-checksum.txt >/dev/null
    tar -xzf "$asset" supabase
    install -m 0755 supabase /usr/local/bin/supabase
  )
  rm -rf -- "$temp_dir"
  [[ "$(supabase --version)" == "$SUPABASE_CLI_VERSION" ]] \
    || die 'versão instalada da Supabase CLI diverge da versão fixada'
}

install_supabase_cli

install -d -m 0750 "$INSTALL_DIR"
marker="$INSTALL_DIR/.crm-supabase-commit"
if [[ -f "$marker" ]]; then
  [[ "$(tr -d '[:space:]' <"$marker")" == "$SUPABASE_COMMIT" ]] \
    || die "$INSTALL_DIR contém outra versão; não será sobrescrita"
else
  if find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
    die "$INSTALL_DIR não está vazio e não possui o marcador de versão esperado"
  fi

  log "Obtendo Supabase $SUPABASE_TAG no commit fixado"
  clone_dir="$(mktemp -d /opt/crm-supabase-source.XXXXXX)"
  trap 'rm -rf -- "${clone_dir:-}"' EXIT
  git -C "$clone_dir" init --quiet
  git -C "$clone_dir" remote add origin https://github.com/supabase/supabase.git
  git -C "$clone_dir" fetch --quiet --depth 1 origin "refs/tags/$SUPABASE_TAG"
  fetched_tag_object="$(git -C "$clone_dir" rev-parse FETCH_HEAD)"
  [[ "$fetched_tag_object" == "$SUPABASE_TAG_OBJECT" ]] \
    || die "tag $SUPABASE_TAG resolveu para o objeto $fetched_tag_object, não $SUPABASE_TAG_OBJECT"
  git -C "$clone_dir" checkout --quiet --detach FETCH_HEAD
  actual_commit="$(git -C "$clone_dir" rev-parse HEAD)"
  [[ "$actual_commit" == "$SUPABASE_COMMIT" ]] \
    || die "tag $SUPABASE_TAG resolveu para $actual_commit, não $SUPABASE_COMMIT"
  rsync -a -- "$clone_dir/docker/" "$INSTALL_DIR/"
  printf '%s\n' "$SUPABASE_COMMIT" >"$marker"
  chmod 0644 "$marker"
  rm -rf -- "$clone_dir"
  trap - EXIT
fi

require_file "$INSTALL_DIR/docker-compose.yml"

# The script intentionally uses umask 077 because it creates production
# secrets later on. Files copied from the official repository, however, are
# bind-mounted into containers that run as non-root users. Normalize only the
# pinned stack's static bind-mount inputs; never recurse into mutable database
# or Storage data.
normalize_static_volume_permissions() {
  local path resolved_path static_root
  local -a static_dirs=(
    "$INSTALL_DIR/volumes"
    "$INSTALL_DIR/volumes/api"
    "$INSTALL_DIR/volumes/api/envoy"
    "$INSTALL_DIR/volumes/db"
    "$INSTALL_DIR/volumes/functions"
    "$INSTALL_DIR/volumes/logs"
    "$INSTALL_DIR/volumes/pooler"
    "$INSTALL_DIR/volumes/proxy"
    "$INSTALL_DIR/volumes/proxy/caddy"
    "$INSTALL_DIR/volumes/proxy/nginx"
    "$INSTALL_DIR/volumes/snippets"
  )
  local -a static_files=(
    "$INSTALL_DIR/volumes/api/envoy/cds.yaml"
    "$INSTALL_DIR/volumes/api/envoy/envoy.yaml"
    "$INSTALL_DIR/volumes/api/envoy/lds.template.yaml"
    "$INSTALL_DIR/volumes/api/kong.yml"
    "$INSTALL_DIR/volumes/db/_supabase.sql"
    "$INSTALL_DIR/volumes/db/jwt.sql"
    "$INSTALL_DIR/volumes/db/logs.sql"
    "$INSTALL_DIR/volumes/db/pooler.sql"
    "$INSTALL_DIR/volumes/db/realtime.sql"
    "$INSTALL_DIR/volumes/db/roles.sql"
    "$INSTALL_DIR/volumes/db/webhooks.sql"
    "$INSTALL_DIR/volumes/logs/vector.yml"
    "$INSTALL_DIR/volumes/pooler/pooler.exs"
    "$INSTALL_DIR/volumes/proxy/caddy/Caddyfile"
    "$INSTALL_DIR/volumes/proxy/nginx/supabase-nginx.conf.tpl"
    "$INSTALL_DIR/volumes/snippets/.gitkeep"
  )
  local -a static_executables=(
    "$INSTALL_DIR/volumes/api/envoy/docker-entrypoint.sh"
    "$INSTALL_DIR/volumes/api/kong-entrypoint.sh"
  )
  local -a optional_function_dirs=(
    "$INSTALL_DIR/volumes/functions/hello"
    "$INSTALL_DIR/volumes/functions/main"
  )
  local -a optional_function_files=(
    "$INSTALL_DIR/volumes/functions/hello/index.ts"
    "$INSTALL_DIR/volumes/functions/main/index.ts"
  )

  static_root="$(realpath -e -- "$INSTALL_DIR/volumes")"
  [[ "$static_root" == "$INSTALL_DIR/volumes" ]] \
    || die "raiz de volumes resolveu para caminho inesperado: $static_root"

  for path in "${static_dirs[@]}"; do
    require_dir "$path"
    [[ ! -L "$path" ]] || die "diretorio estatico nao pode ser link: $path"
    resolved_path="$(realpath -e -- "$path")"
    [[ "$resolved_path" == "$static_root" || "$resolved_path" == "$static_root/"* ]] \
      || die "diretorio estatico saiu da raiz de volumes: $path"
    chmod 0755 -- "$path"
  done
  for path in "${static_files[@]}"; do
    require_file "$path"
    [[ ! -L "$path" ]] || die "arquivo estatico nao pode ser link: $path"
    resolved_path="$(realpath -e -- "$path")"
    [[ "$resolved_path" == "$static_root/"* ]] \
      || die "arquivo estatico saiu da raiz de volumes: $path"
    chmod 0644 -- "$path"
  done
  for path in "${static_executables[@]}"; do
    require_file "$path"
    [[ ! -L "$path" ]] || die "entrypoint estatico nao pode ser link: $path"
    resolved_path="$(realpath -e -- "$path")"
    [[ "$resolved_path" == "$static_root/"* ]] \
      || die "entrypoint estatico saiu da raiz de volumes: $path"
    chmod 0755 -- "$path"
  done
  for path in "${optional_function_dirs[@]}"; do
    [[ -e "$path" || -L "$path" ]] || continue
    require_dir "$path"
    [[ ! -L "$path" ]] || die "diretorio de exemplo nao pode ser link: $path"
    resolved_path="$(realpath -e -- "$path")"
    [[ "$resolved_path" == "$static_root/"* ]] \
      || die "diretorio de exemplo saiu da raiz de volumes: $path"
    chmod 0755 -- "$path"
  done
  for path in "${optional_function_files[@]}"; do
    [[ -e "$path" || -L "$path" ]] || continue
    require_file "$path"
    [[ ! -L "$path" ]] || die "arquivo de exemplo nao pode ser link: $path"
    resolved_path="$(realpath -e -- "$path")"
    [[ "$resolved_path" == "$static_root/"* ]] \
      || die "arquivo de exemplo saiu da raiz de volumes: $path"
    chmod 0644 -- "$path"
  done
}

normalize_static_volume_permissions

if [[ ! -f "$INSTALL_DIR/.env" ]]; then
  created_env=true
  install -m 0600 "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
  (
    cd "$INSTALL_DIR"
    sh utils/generate-keys.sh --update-env >/dev/null
    sh utils/add-new-auth-keys.sh --update-env >/dev/null
  ) || die 'a geração oficial de secrets/API keys falhou'
  rm -f -- "$INSTALL_DIR/.env.old"
fi
chmod 0600 "$INSTALL_DIR/.env"
set_env_value "$INSTALL_DIR/.env" STUDIO_DEFAULT_ORGANIZATION 'Kairoz'
set_env_value "$INSTALL_DIR/.env" STUDIO_DEFAULT_PROJECT 'CRM-Definitivo'
chmod 0750 "$SCRIPT_DIR"/*.sh

log 'Instalando overrides e configurações do CRM'
install -m 0644 "$KIT_DIR/config/docker-compose.crm.yml" "$INSTALL_DIR/docker-compose.crm.yml"
install -d -m 0755 "$INSTALL_DIR/runtime/main" "$INSTALL_DIR/volumes/db"
install -m 0644 "$KIT_DIR/runtime/main/index.ts" "$INSTALL_DIR/runtime/main/index.ts"
install -m 0644 "$KIT_DIR/config/postgresql.crm.conf" "$INSTALL_DIR/volumes/db/99-crm.conf"
if [[ ! -f "$INSTALL_DIR/functions.env" ]]; then
  created_functions_env=true
  install -m 0600 "$KIT_DIR/config/functions.env.example" "$INSTALL_DIR/functions.env"
fi
chmod 0600 "$INSTALL_DIR/functions.env"

merge_functions_env_schema() {
  local target="$1"
  local template="$2"
  local temp_file

  require_file "$target"
  require_file "$template"
  temp_file="$(mktemp "${target}.XXXXXX")"
  if ! awk '
    NR == FNR {
      print
      separator = index($0, "=")
      key = separator > 1 ? substr($0, 1, separator - 1) : ""
      if (key ~ /^[A-Z][A-Z0-9_]*$/ && seen[key]++) duplicate = 1
      next
    }
    {
      separator = index($0, "=")
      key = separator > 1 ? substr($0, 1, separator - 1) : ""
      if (key ~ /^[A-Z][A-Z0-9_]*$/ && !(key in seen)) {
        print
        seen[key] = 1
      }
    }
    END { if (duplicate) exit 1 }
  ' "$target" "$template" >"$temp_file"; then
    rm -f -- "$temp_file"
    die "functions.env contem chaves duplicadas; merge recusado"
  fi
  chmod 0600 "$temp_file"
  mv -f -- "$temp_file" "$target"
}

merge_functions_env_schema "$INSTALL_DIR/functions.env" "$KIT_DIR/config/functions.env.example"

placeholder_temp="$(mktemp "${INSTALL_DIR}/functions.env.placeholders.XXXXXX")"
awk '
  /^[A-Z][A-Z0-9_]*=REPLACE/ {
    separator = index($0, "=")
    print substr($0, 1, separator)
    next
  }
  { print }
' "$INSTALL_DIR/functions.env" >"$placeholder_temp"
chmod 0600 "$placeholder_temp"
mv -f -- "$placeholder_temp" "$INSTALL_DIR/functions.env"

if [[ "$created_functions_env" == true ]]; then
  set_env_value "$INSTALL_DIR/functions.env" SITE_URL "$SITE_URL_VALUE"
fi
if [[ -z "$(env_file_value "$INSTALL_DIR/functions.env" PUBLIC_FORM_ALLOWED_ORIGINS)" ]]; then
  set_env_value "$INSTALL_DIR/functions.env" PUBLIC_FORM_ALLOWED_ORIGINS "$SITE_URL_VALUE"
fi

ensure_function_secret() {
  local key="$1"
  local current
  current="$(awk -F= -v wanted="$key" '$1 == wanted {sub(/^[^=]*=/, ""); print; exit}' "$INSTALL_DIR/functions.env")"
  if [[ -z "$current" || "$current" == REPLACE* ]]; then
    current="$(openssl rand -hex 32)"
    set_env_value "$INSTALL_DIR/functions.env" "$key" "$current"
    log "$key gerado sem exibir o valor"
  fi
  (( ${#current} >= 32 )) || die "$key precisa conter ao menos 32 caracteres"
  [[ "$current" != *[[:space:]]* ]] || die "$key não pode conter espaços"
}
ensure_function_secret ADMIN_JWT_SECRET
ensure_function_secret CRON_SECRET
ensure_function_secret OAUTH_STATE_SECRET

set_env_value "$INSTALL_DIR/.env" COMPOSE_FILE 'docker-compose.yml:docker-compose.caddy.yml:docker-compose.crm.yml'
set_env_value "$INSTALL_DIR/.env" FUNCTIONS_VERIFY_JWT 'true'
if [[ "$created_env" == true ]]; then
  set_env_value "$INSTALL_DIR/.env" SUPABASE_PUBLIC_URL "$PUBLIC_URL"
  set_env_value "$INSTALL_DIR/.env" API_EXTERNAL_URL "$PUBLIC_URL/auth/v1"
  set_env_value "$INSTALL_DIR/.env" SITE_URL "$SITE_URL_VALUE"
  set_env_value "$INSTALL_DIR/.env" ADDITIONAL_REDIRECT_URLS "$SITE_URL_VALUE/**"
  set_env_value "$INSTALL_DIR/.env" PROXY_DOMAIN "$PUBLIC_DOMAIN"
  set_env_value "$INSTALL_DIR/.env" GOOGLE_ENABLED 'false'
fi

if grep -Eq '^(POSTGRES_PASSWORD|JWT_SECRET|DASHBOARD_PASSWORD)=(your-|this_password|$)' "$INSTALL_DIR/.env"; then
  die 'a geração de secrets deixou valores padrão críticos em .env'
fi

(
  cd "$INSTALL_DIR"
  docker compose config --quiet
  image_manifest="$INSTALL_DIR/.crm-image-manifest"
  image_progress="$INSTALL_DIR/.crm-image-manifest.in-progress"
  exec 9<"$INSTALL_DIR"
  flock -n 9 || die 'outro preparo de imagens esta em execucao'

  compose_images="$(docker compose config --images)" \
    || die 'nao foi possivel obter as imagens efetivas do compose'
  mapfile -t image_refs < <(printf '%s\n' "$compose_images" | LC_ALL=C sort -u)
  (( ${#image_refs[@]} > 0 )) || die 'o compose nao retornou imagens para o manifesto'
  for image_ref in "${image_refs[@]}"; do
    [[ "$image_ref" =~ ^[^[:space:]|]+$ ]] || die 'referencia de imagem inesperada no compose'
  done

  inspect_local_image() {
    local image_ref="$1"
    local failure_guidance="${2:-}"
    local failure_suffix=''
    local raw_repo_digests

    [[ -z "$failure_guidance" ]] || failure_suffix="; $failure_guidance"
    if ! inspected_image_id="$(docker image inspect --format '{{.Id}}' "$image_ref" 2>/dev/null)"; then
      die "imagem local ausente: $image_ref$failure_suffix"
    fi
    raw_repo_digests="$(docker image inspect --format '{{json .RepoDigests}}' "$image_ref")" \
      || die "nao foi possivel inspecionar RepoDigests de $image_ref$failure_suffix"
    if ! inspected_repo_digests="$(
      jq -er '
        if type == "array"
           and length > 0
           and (length == (unique | length))
           and all(.[]; type == "string" and test("^[^\\s,]+@sha256:[0-9a-f]{64}$"))
        then sort | join(",")
        else error("RepoDigests invalidos")
        end
      ' <<<"$raw_repo_digests"
    )"; then
      die "RepoDigests ausentes ou invalidos para $image_ref$failure_suffix"
    fi
    [[ "$inspected_image_id" =~ ^sha256:[0-9a-f]{64}$ ]] \
      || die "image ID invalido para $image_ref$failure_suffix"
  }

  validate_manifest_structure() {
    local manifest="$1"
    local expected_rows="$2"

    awk -F '\t' -v expected_commit="$SUPABASE_COMMIT" -v expected_rows="$expected_rows" '
      /^# generated_at_utc=[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]Z$/ {
        generated++
        next
      }
      /^# supabase_commit=/ {
        commit_lines++
        if ($0 == "# supabase_commit=" expected_commit) commit_matches++
        next
      }
      $0 == "image_ref\timage_id\trepo_digests" {
        headers++
        next
      }
      {
        rows++
        if (NF != 3 || $1 == "" || $2 == "" || $3 == "" || seen[$1]++) invalid=1
      }
      END {
        if (generated != 1 || commit_lines != 1 || commit_matches != 1 ||
            headers != 1 || rows != expected_rows || invalid) exit 1
      }
    ' "$manifest"
  }

  rebuild_guidance='restaure o snapshot green limpo ou reprovisione um green novo, execute este preparo uma vez e aprove o novo manifesto; nao remova nem substitua o manifesto no destino atual'

  if [[ -e "$image_manifest" || -L "$image_manifest" ]]; then
    [[ -f "$image_manifest" && ! -L "$image_manifest" ]] \
      || die "$image_manifest precisa ser um arquivo regular, nao um link"
    [[ "$(stat -c '%u' -- "$image_manifest")" == 0 ]] \
      || die "$image_manifest precisa pertencer ao root"
    manifest_mode="$(stat -c '%a' -- "$image_manifest")"
    (( (8#$manifest_mode & 8#022) == 0 )) \
      || die "$image_manifest nao pode permitir escrita ao grupo ou a outros"
    validate_manifest_structure "$image_manifest" "${#image_refs[@]}" \
      || die "manifesto de imagens invalido ou incompativel com o compose; $rebuild_guidance"

    log 'Manifesto de imagens existente: validando somente imagens locais, sem pull'
    for image_ref in "${image_refs[@]}"; do
      if ! locked_identity="$(
        awk -F '\t' -v wanted="$image_ref" '
          $1 == wanted { matches++; locked_id=$2; locked_digests=$3 }
          END {
            if (matches != 1) exit 1
            printf "%s\t%s", locked_id, locked_digests
          }
        ' "$image_manifest"
      )"; then
        die "imagem $image_ref ausente ou duplicada no manifesto; $rebuild_guidance"
      fi
      IFS=$'\t' read -r locked_image_id locked_repo_digests <<<"$locked_identity"
      [[ "$locked_image_id" =~ ^sha256:[0-9a-f]{64}$ ]] \
        || die "image ID invalido no manifesto para $image_ref; $rebuild_guidance"
      if ! locked_repo_digests_normalized="$(
        jq -Rer '
          split(",") |
          if length > 0
             and (length == (unique | length))
             and all(.[]; test("^[^\\s,]+@sha256:[0-9a-f]{64}$"))
          then sort | join(",")
          else error("RepoDigests invalidos")
          end
        ' <<<"$locked_repo_digests"
      )"; then
        die "RepoDigests invalidos no manifesto para $image_ref; $rebuild_guidance"
      fi
      [[ "$locked_repo_digests" == "$locked_repo_digests_normalized" ]] \
        || die "RepoDigests nao canonicos no manifesto para $image_ref; $rebuild_guidance"

      inspect_local_image "$image_ref" "$rebuild_guidance"
      [[ "$inspected_image_id" == "$locked_image_id" ]] \
        || die "image ID local diverge do manifesto para $image_ref; $rebuild_guidance"
      [[ "$inspected_repo_digests" == "$locked_repo_digests" ]] \
        || die "RepoDigests locais divergem do manifesto para $image_ref; $rebuild_guidance"
    done

    if [[ -e "$image_progress" || -L "$image_progress" ]]; then
      [[ -f "$image_progress" && ! -L "$image_progress" ]] \
        || die "marcador de preparo interrompido invalido: $image_progress"
      rm -f -- "$image_progress"
    fi
    log "Manifesto e imagens locais conferem: $image_manifest"
  else
    [[ ! -e "$image_progress" && ! -L "$image_progress" ]] \
      || die "um preparo anterior de imagens foi interrompido; $rebuild_guidance"

    temp_progress="$(mktemp "${image_progress}.XXXXXX")"
    temp_manifest=''
    trap '[[ -z "${temp_manifest:-}" ]] || rm -f -- "$temp_manifest"; [[ -z "${temp_progress:-}" ]] || rm -f -- "$temp_progress"' EXIT
    printf 'started_at_utc=%s\nsupabase_commit=%s\n' \
      "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$SUPABASE_COMMIT" >"$temp_progress"
    chmod 0600 "$temp_progress"
    mv -f -- "$temp_progress" "$image_progress"
    temp_progress=''

    log 'Primeiro preparo: baixando imagens do compose oficial para materializar o lock'
    docker compose pull

    temp_manifest="$(mktemp "${image_manifest}.XXXXXX")"
    printf '# generated_at_utc=%s\n# supabase_commit=%s\nimage_ref\timage_id\trepo_digests\n' \
      "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
      "$SUPABASE_COMMIT" \
      >"$temp_manifest"
    for image_ref in "${image_refs[@]}"; do
      inspect_local_image "$image_ref"
      printf '%s\t%s\t%s\n' \
        "$image_ref" "$inspected_image_id" "$inspected_repo_digests" >>"$temp_manifest"
    done
    chmod 0644 "$temp_manifest"
    mv -f -- "$temp_manifest" "$image_manifest"
    temp_manifest=''
    rm -f -- "$image_progress"
    trap - EXIT
    log "Manifesto imutavel de imagens gravado atomicamente em $image_manifest"
  fi
)

if [[ "$START_STACK" == true ]]; then
  for key in \
    ADMIN_JWT_SECRET CRON_SECRET OAUTH_STATE_SECRET EVOLUTION_API_URL EVOLUTION_API_KEY \
    EVOLUTION_WEBHOOK_SECRET FACEBOOK_APP_ID FACEBOOK_APP_SECRET FACEBOOK_WEBHOOK_VERIFY_TOKEN \
    META_TOKEN_ENCRYPTION_KEY SITE_URL; do
    require_configured_env_key "$INSTALL_DIR/functions.env" "$key"
  done
  compose up -d
else
  log 'Stack preparada e imagens locais bloqueadas pelo manifesto. Nenhum container foi iniciado (use --start somente após preencher os secrets).'
fi
