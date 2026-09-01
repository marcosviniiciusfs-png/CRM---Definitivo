#!/usr/bin/env bash

# Bootstrap a clean Ubuntu host for the CRM Supabase stack.
# shellcheck shell=bash

set -Eeuo pipefail
IFS=$'\n\t'
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

require_root
[[ -r /etc/os-release ]] || die '/etc/os-release não encontrado'
# shellcheck disable=SC1091
source /etc/os-release
[[ "${ID:-}" == 'ubuntu' ]] || die "este bootstrap aceita somente Ubuntu; detectado: ${ID:-desconhecido}"
[[ -n "${VERSION_CODENAME:-}" ]] || die 'VERSION_CODENAME ausente em /etc/os-release'

SSH_PORT="${SSH_PORT:-}"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-4}"
MIN_CPU_CORES="${MIN_CPU_CORES:-4}"
MIN_RAM_GB="${MIN_RAM_GB:-8}"
MIN_TOTAL_DISK_GB="${MIN_TOTAL_DISK_GB:-80}"
[[ "$SWAP_SIZE_GB" =~ ^[0-9]+$ ]] && (( SWAP_SIZE_GB >= 1 && SWAP_SIZE_GB <= 16 )) \
  || die 'SWAP_SIZE_GB deve ser inteiro entre 1 e 16'
for resource_limit in MIN_CPU_CORES MIN_RAM_GB MIN_TOTAL_DISK_GB; do
  [[ "${!resource_limit}" =~ ^[0-9]+$ ]] && (( ${!resource_limit} >= 1 )) \
    || die "$resource_limit deve ser inteiro positivo"
done

detected_cpu="$(nproc)"
detected_ram_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
detected_disk_kb="$(df -Pk / | awk 'NR == 2 {print $2}')"
(( detected_cpu >= MIN_CPU_CORES )) \
  || die "CPU insuficiente: ${detected_cpu} core(s), mínimo configurado ${MIN_CPU_CORES}"
(( detected_ram_kb >= MIN_RAM_GB * 1024 * 1024 )) \
  || die "RAM insuficiente: mínimo configurado ${MIN_RAM_GB} GiB"
(( detected_disk_kb >= MIN_TOTAL_DISK_GB * 1024 * 1024 )) \
  || die "disco insuficiente: mínimo configurado ${MIN_TOTAL_DISK_GB} GiB"
log "Capacidade base validada: ${detected_cpu} vCPU, RAM >= ${MIN_RAM_GB} GiB, disco >= ${MIN_TOTAL_DISK_GB} GiB"

if [[ -z "$SSH_PORT" && -n "${SSH_CONNECTION:-}" ]]; then
  SSH_PORT="$(awk '{print $4}' <<<"$SSH_CONNECTION")"
fi
if [[ -z "$SSH_PORT" ]] && command -v sshd >/dev/null 2>&1; then
  SSH_PORT="$(sshd -T 2>/dev/null | awk '$1 == "port" { print $2; exit }')"
fi
[[ -n "$SSH_PORT" ]] \
  || die 'não foi possível confirmar a porta SSH; informe SSH_PORT explicitamente para evitar lockout'
[[ "$SSH_PORT" =~ ^[0-9]+$ ]] && (( SSH_PORT >= 1 && SSH_PORT <= 65535 )) \
  || die 'SSH_PORT inválida'

log 'Atualizando pacotes base do Ubuntu'
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
  ca-certificates curl dnsutils fail2ban file git gnupg iproute2 jq openssl \
  postgresql-client python3 rclone restic rsync shellcheck unattended-upgrades ufw util-linux

log 'Validando o repositório oficial do Docker'
if grep -Rqs 'https://download\.docker\.com/linux/ubuntu' /etc/apt/sources.list.d 2>/dev/null; then
  log 'Repositório oficial do Docker já configurado; preservando a definição existente'
else
  install -m 0755 -d /etc/apt/keyrings
  docker_key_temp="$(mktemp)"
  trap 'rm -f -- "$docker_key_temp"' EXIT
  curl --fail --silent --show-error --location https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor >"$docker_key_temp"
  install -m 0644 "$docker_key_temp" /etc/apt/keyrings/docker.gpg
  printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu %s stable\n' \
    "$(dpkg --print-architecture)" "$VERSION_CODENAME" \
    >/etc/apt/sources.list.d/docker.list
fi
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

log 'Limitando os logs do Docker'
install -m 0755 -d /etc/docker
daemon_temp="$(mktemp)"
if [[ -s /etc/docker/daemon.json ]]; then
  jq '. + {"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"5"},"live-restore":true}' \
    /etc/docker/daemon.json >"$daemon_temp" || die '/etc/docker/daemon.json não contém JSON válido'
else
  jq -n '{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"5"},"live-restore":true}' \
    >"$daemon_temp"
fi
if ! cmp -s "$daemon_temp" /etc/docker/daemon.json; then
  install -m 0644 "$daemon_temp" /etc/docker/daemon.json
  systemctl restart docker
fi
rm -f -- "$daemon_temp"
systemctl enable --now docker

if [[ -z "$(swapon --noheadings --show 2>/dev/null)" ]]; then
  log "Criando swap de ${SWAP_SIZE_GB} GiB"
  new_swapfile=false
  if [[ ! -e /swapfile ]]; then
    fallocate -l "${SWAP_SIZE_GB}G" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count="$((SWAP_SIZE_GB * 1024))" status=progress
    new_swapfile=true
  fi
  [[ -f /swapfile ]] || die '/swapfile já existe mas não é arquivo regular'
  chmod 0600 /swapfile
  if ! file /swapfile | grep -q 'swap file'; then
    [[ "$new_swapfile" == true ]] || die '/swapfile já existia e não é swap; não será sobrescrito'
    mkswap /swapfile >/dev/null
  fi
  swapon /swapfile
  grep -qE '^/swapfile[[:space:]]' /etc/fstab || printf '/swapfile none swap sw 0 0\n' >>/etc/fstab
else
  log 'Swap já está ativa; nenhuma alteração necessária'
fi

install -m 0644 /dev/null /etc/sysctl.d/99-crm-supabase.conf
printf '%s\n' \
  'vm.swappiness=10' \
  'vm.vfs_cache_pressure=50' \
  'net.core.somaxconn=4096' \
  >/etc/sysctl.d/99-crm-supabase.conf
sysctl --system >/dev/null

load_versions
install -d -m 0750 "$INSTALL_DIR" "$MIGRATION_KIT_DIR"
install -d -m 0700 "$BACKUP_DIR" /etc/crm-supabase

log 'Configurando UFW para SSH, HTTP e HTTPS'
if ufw status | grep -q '^Status: active'; then
  unexpected_rules="$(ufw status | awk '/ALLOW IN/ {print $1}' | grep -Ev "^(OpenSSH|${SSH_PORT}/tcp|80/tcp|443/tcp|443/udp)$" || true)"
  [[ -z "$unexpected_rules" ]] || die "UFW já possui regras ALLOW inesperadas; revise-as manualmente antes de continuar: $unexpected_rules"
else
  unexpected_added_rules="$(ufw show added | awk '/^ufw allow/ {print $3}' | grep -Ev "^(OpenSSH|${SSH_PORT}/tcp|80/tcp|443/tcp|443/udp)$" || true)"
  [[ -z "$unexpected_added_rules" ]] \
    || die "UFW inativo contém regras ALLOW inesperadas; revise-as antes de habilitar: $unexpected_added_rules"
fi
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow "$SSH_PORT/tcp" comment 'CRM SSH' >/dev/null
ufw allow 80/tcp comment 'CRM HTTP ACME' >/dev/null
ufw allow 443/tcp comment 'CRM HTTPS' >/dev/null
ufw allow 443/udp comment 'CRM HTTP3' >/dev/null
ufw --force enable >/dev/null

install -m 0644 /dev/null /etc/fail2ban/jail.d/sshd.local
printf '%s\n' \
  '[sshd]' \
  'enabled = true' \
  "port = $SSH_PORT" \
  'maxretry = 3' \
  'findtime = 10m' \
  'bantime = 1h' \
  'bantime.increment = true' \
  'bantime.factor = 2' \
  'bantime.maxtime = 1d' \
  >/etc/fail2ban/jail.d/sshd.local
systemctl enable fail2ban
systemctl restart fail2ban

dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null
systemctl enable --now unattended-upgrades
if command -v timedatectl >/dev/null 2>&1; then
  timedatectl set-ntp true || warn 'não foi possível habilitar sincronização NTP'
fi

if [[ -e /var/run/reboot-required ]]; then
  warn 'O Ubuntu solicita reboot após as atualizações; reinicie antes de preparar a stack.'
fi

log 'Bootstrap concluído. Confirme também o firewall externo da Hostinger (SSH/80/443 somente).'
