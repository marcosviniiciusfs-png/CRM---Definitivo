[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [ValidatePattern('^[a-z0-9]{20}$')]
    [string]$ProjectRef = 'uxttihjsxfowursjyult',

    [string]$ExpectedProjectName = 'Kairoz - crm',

    [ValidatePattern('^root@[0-9a-fA-F:.]+$')]
    [string]$VpsTarget = 'root@103.199.185.97',

    [ValidateNotNullOrEmpty()]
    [string]$SshKeyPath = 'C:\Users\Hurtz\.ssh\kairoz_crm_hostinger_ed25519',

    [ValidateRange(1, 60)]
    [int]$ConnectionAttempts = 30,

    [ValidateRange(1, 30)]
    [int]$ConnectionDelaySeconds = 10,

    [switch]$SkipConnectionTest
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$apiBase = 'https://api.supabase.com/v1'
$expectedDbHost = "db.$ProjectRef.supabase.co"

function Add-CredentialInteropType {
    if ('CrmNativeCredentialApi' -as [type]) {
        return
    }

    $nativeSource = @"
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct CrmNativeCredential {
    public UInt32 Flags;
    public UInt32 Type;
    public IntPtr TargetName;
    public IntPtr Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize;
    public IntPtr CredentialBlob;
    public UInt32 Persist;
    public UInt32 AttributeCount;
    public IntPtr Attributes;
    public IntPtr TargetAlias;
    public IntPtr UserName;
}

public static class CrmNativeCredentialApi {
    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr credential);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern void CredFree(IntPtr buffer);
}
"@
    Add-Type -TypeDefinition $nativeSource
}

function Get-SupabaseCredentialCandidates {
    Add-CredentialInteropType

    $credentialPointer = [IntPtr]::Zero
    if (-not [CrmNativeCredentialApi]::CredRead(
        'Supabase CLI:supabase',
        1,
        0,
        [ref]$credentialPointer
    )) {
        $code = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        throw "Falha ao ler a sessão Supabase do cofre do Windows. Código=$code"
    }

    try {
        $credential = [Runtime.InteropServices.Marshal]::PtrToStructure(
            $credentialPointer,
            [type][CrmNativeCredential]
        )
        $blob = New-Object byte[] ([int]$credential.CredentialBlobSize)
        [Runtime.InteropServices.Marshal]::Copy(
            $credential.CredentialBlob,
            $blob,
            0,
            $blob.Length
        )
    }
    finally {
        [CrmNativeCredentialApi]::CredFree($credentialPointer)
    }

    @(
        [Text.Encoding]::UTF8.GetString($blob).Trim([char]0),
        [Text.Encoding]::Unicode.GetString($blob).Trim([char]0)
    ) | Select-Object -Unique
}

function Get-ValidatedSupabaseSession {
    foreach ($candidate in Get-SupabaseCredentialCandidates) {
        if ([string]::IsNullOrWhiteSpace($candidate) -or $candidate -match '\s') {
            continue
        }

        try {
            $headers = @{ Authorization = 'Bearer ' + $candidate }
            $project = Invoke-RestMethod `
                -Method Get `
                -Uri "$apiBase/projects/$ProjectRef" `
                -Headers $headers `
                -TimeoutSec 20
            $actualRef = if ($project.ref) { $project.ref } else { $project.id }
            if (
                $actualRef -eq $ProjectRef -and
                $project.name -eq $ExpectedProjectName -and
                $project.status -eq 'ACTIVE_HEALTHY'
            ) {
                return [pscustomobject]@{
                    AccessToken = $candidate
                    Project = $project
                }
            }
        }
        catch {
            # Try the other decoding used by Windows generic credentials.
        }
    }

    throw 'A sessão Supabase não autenticou de forma inequívoca o projeto Kairoz/CRM saudável.'
}

function Get-SourceServiceRoleKey {
    $json = & npx --yes supabase@2.116.0 projects api-keys `
        --project-ref $ProjectRef `
        --output json 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw 'Falha ao obter a chave service_role existente do projeto esperado.'
    }

    $rows = $json | ConvertFrom-Json
    $matches = @($rows | Where-Object { $_.name -eq 'service_role' })
    if ($matches.Count -ne 1) {
        throw 'A chave service_role não foi encontrada de forma única.'
    }

    $key = [string]$matches[0].api_key
    if (
        $key -notmatch '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' -or
        $key.Length -lt 100
    ) {
        throw 'A chave service_role não possui o formato JWT esperado.'
    }

    $payloadSegment = $key.Split('.')[1].Replace('-', '+').Replace('_', '/')
    switch ($payloadSegment.Length % 4) {
        2 { $payloadSegment += '==' }
        3 { $payloadSegment += '=' }
    }
    $payloadJson = [Text.Encoding]::UTF8.GetString(
        [Convert]::FromBase64String($payloadSegment)
    )
    $payload = $payloadJson | ConvertFrom-Json
    if (
        $payload.role -ne 'service_role' -or
        ([string]$payload.ref -and $payload.ref -ne $ProjectRef)
    ) {
        throw 'A chave retornada não corresponde ao papel/projeto esperado.'
    }

    $key
}

function New-StrongDatabasePassword {
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        do {
            $bytes = New-Object byte[] 48
            $rng.GetBytes($bytes)
            $password = [Convert]::ToBase64String($bytes).
                TrimEnd('=').
                Replace('+', '-').
                Replace('/', '_')
        } until (
            $password -cmatch '[A-Z]' -and
            $password -cmatch '[a-z]' -and
            $password -match '[0-9]' -and
            $password -match '[-_]'
        )
        $password
    }
    finally {
        $rng.Dispose()
    }
}

function Invoke-SshScript {
    param(
        [Parameter(Mandatory)]
        [string]$Script,

        [string[]]$InputLines = @()
    )

    $encodedScript = [Convert]::ToBase64String(
        [Text.Encoding]::UTF8.GetBytes($Script)
    )
    $singleQuote = [string][char]39
    $remoteCommand = (
        'umask 077; f=/tmp/crm-ssh-script.$$; printf %s ' +
        $singleQuote + $encodedScript + $singleQuote +
        ' | base64 -d > $f || exit 91; bash $f; s=$?; ' +
        'rm -f -- $f; exit $s'
    )

    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = 'ssh.exe'
    $startInfo.Arguments = (
        '-T -i "' + $SshKeyPath + '"' +
        ' -o BatchMode=yes -o ConnectTimeout=10 ' +
        $VpsTarget +
        ' "' + $remoteCommand + '"'
    )
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.CreateNoWindow = $true

    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
        throw 'Não foi possível iniciar a sessão SSH protegida.'
    }

    foreach ($line in $InputLines) {
        if ($line -notmatch '^[\x21-\x7E]+$') {
            $process.Kill()
            throw 'A entrada protegida do SSH contém caractere fora de ASCII imprimível.'
        }
    }
    $inputText = if ($InputLines.Count -gt 0) {
        ($InputLines -join "`n") + "`n"
    }
    else {
        ''
    }
    $inputBytes = [Text.Encoding]::ASCII.GetBytes($inputText)
    $process.StandardInput.BaseStream.Write($inputBytes, 0, $inputBytes.Length)
    $process.StandardInput.BaseStream.Flush()
    $process.StandardInput.Close()

    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    [pscustomobject]@{
        ExitCode = $process.ExitCode
        Stdout = $stdout
        Stderr = $stderr
    }
}

if (-not (Test-Path -LiteralPath $SshKeyPath -PathType Leaf)) {
    throw "Chave SSH não encontrada: $SshKeyPath"
}

$session = Get-ValidatedSupabaseSession
Write-Output "Projeto confirmado: $ExpectedProjectName ($ProjectRef), ACTIVE_HEALTHY."

if (-not $PSCmdlet.ShouldProcess(
    "$ExpectedProjectName ($ProjectRef)",
    'resetar a senha Postgres e gravá-la no arquivo 0600 da VPS'
)) {
    return
}

$sourceServiceRoleKey = Get-SourceServiceRoleKey
$databasePassword = New-StrongDatabasePassword
if ($sourceServiceRoleKey -isnot [string]) {
    throw ('Get-SourceServiceRoleKey retornou tipo inesperado: ' + $sourceServiceRoleKey.GetType().FullName)
}
if ($databasePassword -isnot [string]) {
    throw ('New-StrongDatabasePassword retornou tipo inesperado: ' + $databasePassword.GetType().FullName)
}
Write-Output ('Entradas protegidas validadas localmente (key_length=' +
    $sourceServiceRoleKey.Length + ', password_length=' + $databasePassword.Length + ').')

$stageScript = @'
set -euo pipefail
set +x
umask 077
IFS=: read -r source_key db_password
source_key="${source_key%$'\r'}"
source_key="${source_key#$'\xEF\xBB\xBF'}"
source_key="${source_key#$'\xFF\xFE'}"
db_password="${db_password%$'\r'}"
[[ "$source_key" =~ ^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$ ]] || {
  key_length="$(printf '%s' "$source_key" | wc -c)"
  key_dots="$(printf '%s' "$source_key" | tr -cd '.' | wc -c)"
  key_invalid_chars="$(printf '%s' "$source_key" | tr -d 'A-Za-z0-9_.-' | wc -c)"
  printf 'chave da origem inválida (length=%s,dots=%s,invalid=%s)\n' \
    "$key_length" "$key_dots" "$key_invalid_chars" >&2
  exit 2
}
[[ "$db_password" =~ ^[A-Za-z0-9_-]{48,}$ ]] || {
  echo 'senha gerada inválida' >&2
  exit 3
}

target_key=''
while IFS='=' read -r key value; do
  if [[ "$key" == 'SERVICE_ROLE_KEY' ]]; then
    target_key="$value"
    break
  fi
done < /opt/crm-supabase/.env
[[ "$(printf '%s' "$target_key" | wc -c)" -ge 20 ]] || {
  echo 'chave interna do destino ausente' >&2
  exit 4
}

env_file=/etc/crm-supabase/migration.env
[[ -f "$env_file" && ! -L "$env_file" ]] || {
  echo 'arquivo protegido de migração inválido' >&2
  exit 5
}

tmp_file="$(mktemp /etc/crm-supabase/migration.env.tmp.XXXXXX)"
cleanup() {
  unset source_key db_password target_key
  rm -f -- "$tmp_file"
}
trap cleanup EXIT

while IFS= read -r line || [[ -n "$line" ]]; do
  case "$line" in
    SOURCE_DB_URL=*)
      printf 'SOURCE_DB_URL=postgresql://postgres:%s@db.uxttihjsxfowursjyult.supabase.co:5432/postgres\n' "$db_password"
      ;;
    SOURCE_PROJECT_REF=*)
      printf '%s\n' 'SOURCE_PROJECT_REF=uxttihjsxfowursjyult'
      ;;
    SOURCE_EXPECTED_DATABASE=*)
      printf '%s\n' 'SOURCE_EXPECTED_DATABASE=postgres'
      ;;
    SOURCE_EXPECTED_DB_HOST=*)
      printf '%s\n' 'SOURCE_EXPECTED_DB_HOST=db.uxttihjsxfowursjyult.supabase.co'
      ;;
    SOURCE_SUPABASE_URL=*)
      printf '%s\n' 'SOURCE_SUPABASE_URL=https://uxttihjsxfowursjyult.supabase.co'
      ;;
    SOURCE_SERVICE_ROLE_KEY=*)
      printf 'SOURCE_SERVICE_ROLE_KEY=%s\n' "$source_key"
      ;;
    TARGET_SERVICE_ROLE_KEY=*)
      printf 'TARGET_SERVICE_ROLE_KEY=%s\n' "$target_key"
      ;;
    *)
      printf '%s\n' "$line"
      ;;
  esac
done < "$env_file" > "$tmp_file"

for required_key in \
  SOURCE_DB_URL SOURCE_PROJECT_REF SOURCE_EXPECTED_DATABASE \
  SOURCE_EXPECTED_DB_HOST SOURCE_SUPABASE_URL \
  SOURCE_SERVICE_ROLE_KEY TARGET_SERVICE_ROLE_KEY; do
  [[ "$(grep -c "^${required_key}=" "$tmp_file")" == '1' ]] || {
    echo "campo obrigatório ausente ou duplicado: $required_key" >&2
    exit 6
  }
done

chown root:root "$tmp_file"
chmod 600 "$tmp_file"
mv -f -- "$tmp_file" "$env_file"
trap - EXIT
unset source_key db_password target_key
printf '%s\n' 'PROTECTED_MIGRATION_CONFIG_STAGED'
'@

$stageInput = $sourceServiceRoleKey + ':' + $databasePassword
$stageResult = Invoke-SshScript `
    -Script $stageScript `
    -InputLines @($stageInput)
if (
    $stageResult.ExitCode -ne 0 -or
    $stageResult.Stdout -notmatch 'PROTECTED_MIGRATION_CONFIG_STAGED'
) {
    $safeError = $stageResult.Stderr.
        Replace($sourceServiceRoleKey, '<redacted>').
        Replace($databasePassword, '<redacted>')
    throw "Falha ao preparar o arquivo protegido da VPS: $safeError"
}
Write-Output 'Configuração protegida preparada na VPS.'

$headers = @{
    Authorization = 'Bearer ' + $session.AccessToken
    'Content-Type' = 'application/json'
}
$body = @{ password = $databasePassword } | ConvertTo-Json -Compress
try {
    $null = Invoke-RestMethod `
        -Method Patch `
        -Uri "$apiBase/projects/$ProjectRef/database/password" `
        -Headers $headers `
        -Body $body `
        -TimeoutSec 60
}
catch {
    throw 'O endpoint oficial recusou o reset. A senha candidata permanece somente no arquivo protegido da VPS.'
}
Write-Output 'Reset da senha Postgres aceito pela Supabase.'

if (-not $SkipConnectionTest) {
    $testScript = @'
set -euo pipefail
set +x
env_file=/etc/crm-supabase/migration.env
source_url="$(grep '^SOURCE_DB_URL=' "$env_file" | cut -d= -f2-)"
db_password="$(printf '%s' "$source_url" | sed -E 's#^postgresql://postgres:([^@]+)@.*#\1#')"
[[ "$db_password" != "$source_url" && -n "$db_password" ]] || exit 2
export PGPASSWORD="$db_password"
unset db_password source_url
image="$(docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -E '^supabase/postgres:' | head -n 1)"
[[ -n "$image" ]] || exit 3
for attempt in $(seq 1 __CONNECTION_ATTEMPTS__); do
  if docker run --rm --network host -e PGPASSWORD "$image" \
      psql 'host=db.uxttihjsxfowursjyult.supabase.co port=5432 user=postgres dbname=postgres sslmode=require connect_timeout=8' \
      -X -v ON_ERROR_STOP=1 -tAc 'select current_database()' 2>/dev/null \
      | grep -qx 'postgres'; then
    unset PGPASSWORD
    printf '%s\n' 'SOURCE_DATABASE_AUTHENTICATED'
    exit 0
  fi
  sleep __CONNECTION_DELAY_SECONDS__
done
unset PGPASSWORD
exit 4
'@
    $testScript = $testScript.
        Replace('__CONNECTION_ATTEMPTS__', [string]$ConnectionAttempts).
        Replace('__CONNECTION_DELAY_SECONDS__', [string]$ConnectionDelaySeconds)

    $testResult = Invoke-SshScript -Script $testScript
    if (
        $testResult.ExitCode -ne 0 -or
        $testResult.Stdout -notmatch 'SOURCE_DATABASE_AUTHENTICATED'
    ) {
        throw 'A Supabase aceitou o reset, mas a autenticação ainda não confirmou após as tentativas configuradas.'
    }
    Write-Output 'Nova senha autenticada no banco de origem pela VPS.'
}

$session.AccessToken = $null
$sourceServiceRoleKey = $null
$databasePassword = $null
$body = $null
Write-Output 'RESET_SOURCE_DB_PASSWORD_COMPLETE'
