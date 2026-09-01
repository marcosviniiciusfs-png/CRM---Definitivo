[CmdletBinding()]
param(
  [string]$ProjectRef = 'uxttihjsxfowursjyult',
  [string]$VpsHost = '103.199.185.97',
  [string]$SshKey = 'C:\Users\Hurtz\.ssh\kairoz_crm_hostinger_ed25519'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($ProjectRef -ne 'uxttihjsxfowursjyult') {
  throw 'Somente o projeto CRM Definitivo aprovado pode ser alterado.'
}
if ($VpsHost -ne '103.199.185.97') {
  throw 'Host VPS inesperado.'
}
if (-not (Test-Path -LiteralPath $SshKey -PathType Leaf)) {
  throw 'Chave SSH aprovada nao encontrada.'
}

$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$tempFile = [IO.Path]::GetFullPath((Join-Path $tempRoot (
      'crm-meta-secret-' + [guid]::NewGuid().ToString('N') + '.env'
    )))
if (-not $tempFile.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Caminho temporario saiu da raiz aprovada.'
}

$randomBytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$verifyToken = $null
$remoteHandoffDir = $null

try {
  $rng.GetBytes($randomBytes)
  $verifyToken = -join ($randomBytes | ForEach-Object { $_.ToString('x2') })
  if ($verifyToken.Length -ne 64) {
    throw 'Geracao criptografica do token falhou.'
  }

  [IO.File]::WriteAllText(
    $tempFile,
    "FACEBOOK_WEBHOOK_VERIFY_TOKEN=$verifyToken`n",
    (New-Object Text.UTF8Encoding($false))
  )

  $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $systemSid = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
  $acl = New-Object Security.AccessControl.FileSecurity
  $acl.SetOwner($currentSid)
  $acl.SetAccessRuleProtection($true, $false)
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule(
        $currentSid,
        [Security.AccessControl.FileSystemRights]::FullControl,
        [Security.AccessControl.AccessControlType]::Allow
      )))
  $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule(
        $systemSid,
        [Security.AccessControl.FileSystemRights]::FullControl,
        [Security.AccessControl.AccessControlType]::Allow
      )))
  Set-Acl -LiteralPath $tempFile -AclObject $acl

  $supabaseArguments = @(
    'supabase',
    'secrets',
    'set',
    '--project-ref', $ProjectRef,
    '--env-file', $tempFile,
    '--output', 'json'
  )
  & npx @supabaseArguments *> $null
  if ($LASTEXITCODE -ne 0) {
    throw 'Nao foi possivel atualizar o verify token no Supabase do CRM.'
  }

  $sshBaseArguments = @(
    '-i', $SshKey,
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=yes',
    "root@$VpsHost"
  )
  $remoteHandoffDir = '/run/crm-meta-handoff-' + [guid]::NewGuid().ToString('N')
  if ($remoteHandoffDir -notmatch '^/run/crm-meta-handoff-[a-f0-9]{32}$') {
    throw 'Caminho de handoff remoto invalido.'
  }
  $remoteHandoffFile = "$remoteHandoffDir/verify-token.env"

  $prepareRemote = "[[ ! -e '$remoteHandoffDir' ]] && install -d -m 0700 '$remoteHandoffDir'"
  & ssh @sshBaseArguments $prepareRemote
  if ($LASTEXITCODE -ne 0) {
    throw 'Nao foi possivel criar o handoff protegido na VPS.'
  }

  $scpArguments = @(
    '-i', $SshKey,
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=yes',
    $tempFile,
    "root@${VpsHost}:$remoteHandoffFile"
  )
  & scp @scpArguments
  if ($LASTEXITCODE -ne 0) {
    throw 'Nao foi possivel transferir o handoff protegido para a VPS.'
  }

  $remoteScript = @"
[[ '$remoteHandoffDir' =~ ^/run/crm-meta-handoff-[a-f0-9]{32}`$ ]]
chmod 0600 '$remoteHandoffFile'
source /opt/crm-migration-kit/scripts/lib.sh
load_env_file '$remoteHandoffFile'
set_env_value /opt/crm-supabase/functions.env FACEBOOK_WEBHOOK_VERIFY_TOKEN "`$FACEBOOK_WEBHOOK_VERIFY_TOKEN"
unset FACEBOOK_WEBHOOK_VERIFY_TOKEN
chown root:root /opt/crm-supabase/functions.env
chmod 0600 /opt/crm-supabase/functions.env
stored_count="`$(grep -c '^FACEBOOK_WEBHOOK_VERIFY_TOKEN=' /opt/crm-supabase/functions.env)"
stored_value="`$(sed -n 's/^FACEBOOK_WEBHOOK_VERIFY_TOKEN=//p' /opt/crm-supabase/functions.env)"
[[ "`$stored_count" == '1' && `${#stored_value} -eq 64 ]]
unset stored_value
rm -f -- '$remoteHandoffFile'
rmdir -- '$remoteHandoffDir'
printf 'vps_verify_token=configured\n'
"@

  & ssh @sshBaseArguments $remoteScript
  if ($LASTEXITCODE -ne 0) {
    throw 'Supabase foi atualizado, mas a copia segura para a VPS falhou.'
  }
  $remoteHandoffDir = $null

  Write-Output 'supabase_verify_token=configured'
}
finally {
  if ($null -ne $verifyToken) {
    $verifyToken = $null
  }
  [Array]::Clear($randomBytes, 0, $randomBytes.Length)
  $rng.Dispose()

  if (Test-Path -LiteralPath $tempFile -PathType Leaf) {
    $resolved = [IO.Path]::GetFullPath($tempFile)
    $fileName = [IO.Path]::GetFileName($resolved)
    if (-not $resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or
        -not $fileName.StartsWith('crm-meta-secret-', [StringComparison]::Ordinal)) {
      throw 'Recusa ao remover caminho temporario inesperado.'
    }
    Remove-Item -LiteralPath $resolved -Force
  }
  if ($null -ne $remoteHandoffDir -and
      $remoteHandoffDir -match '^/run/crm-meta-handoff-[a-f0-9]{32}$') {
    $cleanupRemote = "rm -f -- '$remoteHandoffDir/verify-token.env'; rmdir -- '$remoteHandoffDir' 2>/dev/null || true"
    $cleanupSshArguments = @(
      '-i', $SshKey,
      '-o', 'BatchMode=yes',
      '-o', 'StrictHostKeyChecking=yes',
      "root@$VpsHost",
      $cleanupRemote
    )
    & ssh @cleanupSshArguments *> $null
  }
  Write-Output 'temporary_secret_file=removed'
}
