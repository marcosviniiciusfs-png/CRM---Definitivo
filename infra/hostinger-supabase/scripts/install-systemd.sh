#!/usr/bin/env bash

# Install recurring backup, health-check and optional chat-media retention timers.
# shellcheck shell=bash

set -Eeuo pipefail
IFS=$'\n\t'
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

require_root
load_versions
require_command awk date flock mktemp sed stat systemctl tr

ENABLE_CHAT_MEDIA_RETENTION=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --enable-chat-media-retention)
      ENABLE_CHAT_MEDIA_RETENTION=true
      ;;
    *)
      die 'uso: install-systemd.sh [--enable-chat-media-retention]'
      ;;
  esac
  shift
done

units=(
  crm-supabase-backup.service
  crm-supabase-backup.timer
  crm-supabase-maintenance.service
  crm-supabase-maintenance.timer
  crm-supabase-health.service
  crm-supabase-health.timer
  crm-supabase-chat-media-retention.service
  crm-supabase-chat-media-retention.timer
)
for unit in "${units[@]}"; do
  require_file "$KIT_DIR/systemd/$unit"
done
require_secret_file /etc/crm-supabase/backup.env
load_env_file /etc/crm-supabase/backup.env
export -n ALERT_WEBHOOK_URL 2>/dev/null || true
BACKUP_MODE="${BACKUP_MODE:-restic-offsite}"
case "$BACKUP_MODE" in
  restic-offsite)
    require_command restic
    require_non_placeholder RESTIC_RECOVERY_KEY_ID
    require_non_placeholder RECOVERY_ESCROW_RECORD_ID
    [[ "$RESTIC_RECOVERY_KEY_ID" =~ ^[0-9a-f]{8,64}$ ]] \
      || die 'RESTIC_RECOVERY_KEY_ID deve conter o ID hexadecimal exibido por restic key list'
    restic cat config >/dev/null 2>&1 \
      || die 'repositório restic ainda não foi validado; execute primeiro 09-backup.sh --init-repository'
    key_list="$(restic key list 2>/dev/null)" \
      || die 'não foi possível auditar as chaves do repositório Restic'
    if ! awk -v recovery_id="$RESTIC_RECOVERY_KEY_ID" '
      $1 == recovery_id { found_recovery = 1 }
      $1 ~ /^\*[0-9a-f]+$/ { current++ }
      $1 ~ /^\*?[0-9a-f]+$/ { total++ }
      END { exit !(found_recovery && current == 1 && total >= 2) }
    ' <<<"$key_list"; then
      die 'segunda chave Restic não encontrada ou indistinguível da chave operacional; timers recusados'
    fi
    unset key_list
    ;;
  managed-source-cold)
    [[ "${COLD_BACKUP_PROJECT_REF:-}" == 'uxttihjsxfowursjyult' ]] \
      || die 'COLD_BACKUP_PROJECT_REF diverge do Supabase congelado aprovado'
    require_managed_source_cold_approval "$COLD_BACKUP_PROJECT_REF"
    ;;
  *)
    die 'BACKUP_MODE deve ser restic-offsite ou managed-source-cold'
    ;;
esac

retention_restore_manifest_sha256=''
retention_enabled_marker="$INSTALL_DIR/.crm-chat-media-retention-enabled"
if [[ "$ENABLE_CHAT_MEDIA_RETENTION" == true ]]; then
  expected_retention_confirmation='YES_ENABLE_7_DAY_CHAT_MEDIA_RETENTION_ON_TARGET'
  [[ "${CONFIRM_ENABLE_CHAT_MEDIA_RETENTION:-}" == "$expected_retention_confirmation" ]] \
    || die "confirme a retencao exclusiva do destino com CONFIRM_ENABLE_CHAT_MEDIA_RETENTION=$expected_retention_confirmation"

  require_file "$INSTALL_DIR/.crm-supabase-commit"
  [[ "$(tr -d '[:space:]' <"$INSTALL_DIR/.crm-supabase-commit")" == "$SUPABASE_COMMIT" ]] \
    || die 'a stack de destino nao esta no commit fixado'
  [[ ! -e "$INSTALL_DIR/.crm-restore-in-progress" \
     && ! -L "$INSTALL_DIR/.crm-restore-in-progress" ]] \
    || die 'o marcador de restore em andamento ainda existe; ativacao recusada'

  restore_marker="$INSTALL_DIR/.crm-last-restore"
  discard_marker="$INSTALL_DIR/.crm-chat-media-discarded"
  for marker_file in "$restore_marker" "$discard_marker"; do
    [[ ! -L "$marker_file" ]] || die "marcador symlink recusado: $marker_file"
    require_secret_file "$marker_file"
  done
  if [[ -e "$retention_enabled_marker" || -L "$retention_enabled_marker" ]]; then
    [[ ! -L "$retention_enabled_marker" ]] || die 'marcador de retencao symlink recusado'
    require_secret_file "$retention_enabled_marker"
  fi

  [[ "$(env_file_value "$restore_marker" status)" == 'restored' ]] \
    || die 'o marcador nao confirma um restore concluido'
  retention_restore_manifest_sha256="$(env_file_value "$restore_marker" manifest_sha256)"
  [[ "$retention_restore_manifest_sha256" =~ ^[0-9a-f]{64}$ ]] \
    || die 'o marcador de restore nao contem SHA-256 valido'
  retention_discarded_objects="$(env_file_value "$discard_marker" discarded_objects)"
  retention_discarded_bytes="$(env_file_value "$discard_marker" discarded_bytes)"
  [[ "$(env_file_value "$discard_marker" status)" == 'discarded' \
     && "$(env_file_value "$discard_marker" restore_manifest_sha256)" == "$retention_restore_manifest_sha256" \
     && "$retention_discarded_objects" =~ ^[0-9]+$ \
     && "$retention_discarded_bytes" =~ ^[0-9]+$ \
     && "$(env_file_value "$discard_marker" objects_without_numeric_size)" == '0' ]] \
    || die 'o descarte inicial de chat-media nao pertence ao restore ou possui inventario invalido'

  target_env_file="$INSTALL_DIR/.env"
  [[ ! -L "$target_env_file" ]] || die '.env symlink recusado'
  require_secret_file "$target_env_file"
  service_role_key_count="$(awk -F= '$1 == "SERVICE_ROLE_KEY" { count++ } END { print count + 0 }' "$target_env_file")"
  [[ "$service_role_key_count" == '1' ]] \
    || die 'SERVICE_ROLE_KEY precisa existir exatamente uma vez em .env'
  retention_service_key="$(env_file_value "$target_env_file" SERVICE_ROLE_KEY)"
  [[ ${#retention_service_key} -ge 20 \
     && "$retention_service_key" != *[[:space:]]* \
     && "$retention_service_key" != REPLACE* ]] \
    || die 'SERVICE_ROLE_KEY ausente ou invalida em .env'
  unset retention_service_key
fi

require_dir "$INSTALL_DIR"
exec 8>"$INSTALL_DIR/.chat-media-retention.lock"
flock -n 8 || die 'a retencao de chat-media esta em execucao; instalacao adiada sem parar o timer'

retention_timer_was_enabled=false
if systemctl is-enabled --quiet crm-supabase-chat-media-retention.timer 2>/dev/null; then
  retention_timer_was_enabled=true
fi
retention_timer_was_stopped=false
retention_timer_was_restarted=false
temp_retention_marker=''

cleanup_systemd_install() {
  local status=$?

  if [[ -n "$temp_retention_marker" ]]; then
    rm -f -- "$temp_retention_marker"
  fi
  if (( status != 0 )) \
     && [[ "$retention_timer_was_enabled" == true \
        && "$retention_timer_was_stopped" == true \
        && "$retention_timer_was_restarted" == false ]]; then
    systemctl start crm-supabase-chat-media-retention.timer >/dev/null 2>&1 \
      || warn 'falha ao restaurar o timer de retencao apos erro de instalacao'
  fi
  exit "$status"
}
trap cleanup_systemd_install EXIT

if systemctl cat crm-supabase-chat-media-retention.timer >/dev/null 2>&1; then
  systemctl stop crm-supabase-chat-media-retention.timer
  [[ "$retention_timer_was_enabled" == false ]] || retention_timer_was_stopped=true
fi

LIBEXEC_ROOT='/usr/local/libexec/crm-supabase'
LIBEXEC_SCRIPT_DIR="$LIBEXEC_ROOT/scripts"
[[ ! -L "$LIBEXEC_ROOT" && ! -L "$LIBEXEC_SCRIPT_DIR" ]] \
  || die 'caminho libexec é symlink; instalação recusada'
install -d -o root -g root -m 0755 "$LIBEXEC_ROOT" "$LIBEXEC_SCRIPT_DIR"
install -o root -g root -m 0644 "$KIT_DIR/versions.conf" "$LIBEXEC_ROOT/versions.conf"
install -o root -g root -m 0755 \
  "$SCRIPT_DIR/lib.sh" \
  "$SCRIPT_DIR/09-backup.sh" \
  "$SCRIPT_DIR/10-healthcheck.sh" \
  "$SCRIPT_DIR/13-chat-media-retention.sh" \
  "$LIBEXEC_SCRIPT_DIR/"
for trusted_dir in /usr /usr/local /usr/local/libexec "$LIBEXEC_ROOT" "$LIBEXEC_SCRIPT_DIR"; do
  trusted_owner="$(stat -c '%u' "$trusted_dir")"
  trusted_mode="$(stat -c '%a' "$trusted_dir")"
  (( trusted_numeric_mode = 8#$trusted_mode ))
  [[ "$trusted_owner" == '0' ]] && (( (trusted_numeric_mode & 8#022) == 0 )) \
    || die "diretório da cadeia systemd não é controlado exclusivamente por root: $trusted_dir"
done

for unit in "${units[@]}"; do
  temp_unit="$(mktemp)"
  sed "s|@SCRIPT_DIR@|$LIBEXEC_SCRIPT_DIR|g" "$KIT_DIR/systemd/$unit" >"$temp_unit"
  install -o root -g root -m 0644 "$temp_unit" "/etc/systemd/system/$unit"
  rm -f -- "$temp_unit"
done

systemctl daemon-reload
if [[ "$BACKUP_MODE" == 'restic-offsite' ]]; then
  systemctl enable --now \
    crm-supabase-backup.timer crm-supabase-maintenance.timer
else
  systemctl disable --now \
    crm-supabase-backup.timer crm-supabase-maintenance.timer >/dev/null 2>&1 || true
fi

if [[ "$ENABLE_CHAT_MEDIA_RETENTION" == true ]]; then
  if systemctl is-active --quiet crm-supabase-chat-media-retention.service; then
    die 'o servico de retencao esta em execucao; aguarde e repita a ativacao'
  fi

  temp_retention_marker="$(mktemp "${retention_enabled_marker}.XXXXXX")"
  printf '%s\n' \
    'status=enabled' \
    "enabled_at_utc=$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
    "restore_manifest_sha256=$retention_restore_manifest_sha256" \
    'retention_days=7' \
    >"$temp_retention_marker"
  chmod 0600 "$temp_retention_marker"
  mv -f -- "$temp_retention_marker" "$retention_enabled_marker"
  temp_retention_marker=''

  systemctl enable --now \
    crm-supabase-chat-media-retention.timer crm-supabase-health.timer
  retention_timer_was_restarted=true
  log 'Retencao de chat-media e healthcheck de producao habilitados explicitamente para o restore atual; primeira janela em ate 20min.'
elif [[ "$retention_timer_was_enabled" == true ]]; then
  if [[ -f "$retention_enabled_marker" && ! -L "$retention_enabled_marker" ]]; then
    systemctl enable --now \
      crm-supabase-chat-media-retention.timer crm-supabase-health.timer
    retention_timer_was_restarted=true
    warn 'Timers de retencao e healthcheck ja estavam em producao e foram reiniciados; nenhum novo marcador foi criado.'
  else
    systemctl disable --now \
      crm-supabase-chat-media-retention.timer crm-supabase-health.timer
    warn 'Timer de retencao estava habilitado sem marcador regular; retencao e healthcheck foram desativados. Reative apenas com a confirmacao explicita pos-cutover.'
  fi
else
  systemctl disable --now \
    crm-supabase-chat-media-retention.timer crm-supabase-health.timer
  log 'Timers de retencao e healthcheck instalados, mas inativos ate o pos-cutover e a confirmacao explicita.'
fi

if [[ "$BACKUP_MODE" == 'restic-offsite' ]]; then
  log 'Timers base instalados: backup a cada 6h e manutencao restic semanal. Healthcheck de producao roda a cada 5min somente apos a ativacao explicita.'
else
  log 'Modo de backup frio gerenciado aprovado: timers Restic permanecem desativados; retencao e healthcheck continuam operacionais.'
fi
trap - EXIT
