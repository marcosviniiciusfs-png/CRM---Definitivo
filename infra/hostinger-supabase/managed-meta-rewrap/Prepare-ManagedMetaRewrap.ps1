[CmdletBinding()]
param(
    [string]$SshKeyPath = 'C:\Users\Hurtz\.ssh\kairoz_crm_hostinger_ed25519'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ProjectRef = 'uxttihjsxfowursjyult'
$SupabaseCliSpec = 'supabase@2.116.0'
$VpsTarget = 'root@103.199.185.97'
$RemoteOneTimeFile = '/run/crm-meta-rewrap.env'
$WorkDir = [IO.Path]::GetFullPath($PSScriptRoot)
$SshKeyPath = [IO.Path]::GetFullPath($SshKeyPath)

if (-not (Test-Path -LiteralPath $SshKeyPath -PathType Leaf)) {
    throw 'Chave SSH do CRM Definitivo não encontrada.'
}
if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
    throw 'OpenSSH não está disponível.'
}
if (-not (Get-Command npx.cmd -ErrorAction SilentlyContinue)) {
    throw 'npx.cmd não está disponível.'
}

function New-RandomHex([int]$ByteCount) {
    $bytes = New-Object byte[] $ByteCount
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
        return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $generator.Dispose()
        [Array]::Clear($bytes, 0, $bytes.Length)
    }
}

function Set-PrivateDirectoryAcl([string]$Path) {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $security = New-Object Security.AccessControl.DirectorySecurity
    $security.SetAccessRuleProtection($true, $false)
    $rule = New-Object Security.AccessControl.FileSystemAccessRule(
        $identity,
        [Security.AccessControl.FileSystemRights]::FullControl,
        [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',
        [Security.AccessControl.PropagationFlags]::None,
        [Security.AccessControl.AccessControlType]::Allow
    )
    [void]$security.AddAccessRule($rule)
    [IO.Directory]::SetAccessControl($Path, $security)
}

function Remove-PrivateTempDirectory([string]$Path, [string]$ExpectedRoot) {
    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
        return
    }
    $resolvedPath = [IO.Path]::GetFullPath($Path)
    $resolvedRoot = [IO.Path]::GetFullPath($ExpectedRoot).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $resolvedPath.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Limpeza recusada: diretório temporário fora da raiz esperada.'
    }
    foreach ($file in Get-ChildItem -LiteralPath $resolvedPath -File -Force) {
        $length = [int64]$file.Length
        if ($length -gt 0 -and $length -le 1MB) {
            [IO.File]::WriteAllBytes($file.FullName, (New-Object byte[] $length))
        }
    }
    Remove-Item -LiteralPath $resolvedPath -Recurse -Force
}

function Invoke-SupabaseCliRaw([string[]]$Arguments) {
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $LASTEXITCODE = 0
        $raw = (& npx.cmd --yes $SupabaseCliSpec @Arguments 2>&1 | Out-String)
        $code = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    return [pscustomobject]@{ Output = $raw; ExitCode = $code }
}

function Invoke-SupabaseJson([string[]]$Arguments, [string]$FailureMessage) {
    $result = Invoke-SupabaseCliRaw -Arguments $Arguments
    $raw = $result.Output
    if ($result.ExitCode -ne 0) {
        $result = $null
        $raw = $null
        throw $FailureMessage
    }
    try {
        $start = $raw.IndexOf('[')
        $end = $raw.LastIndexOf(']')
        if ($start -lt 0 -or $end -le $start) { throw 'array JSON ausente' }
        $parsed = $raw.Substring($start, ($end - $start) + 1) | ConvertFrom-Json
        foreach ($item in $parsed) {
            Write-Output $item
        }
    }
    catch {
        throw "$FailureMessage (resposta JSON inválida)."
    }
    finally {
        $result = $null
        $parsed = $null
        $raw = $null
    }
}

function Get-ManagedSecretInventory {
    return Invoke-SupabaseJson -Arguments @(
        'secrets', 'list',
        '--project-ref', $ProjectRef,
        '--workdir', $WorkDir,
        '-o', 'json',
        '--log-level', 'error'
    ) -FailureMessage 'Não foi possível verificar os secrets do Supabase gerenciado.'
}

function Get-ManagedFunctionInventory {
    return Invoke-SupabaseJson -Arguments @(
        'functions', 'list',
        '--project-ref', $ProjectRef,
        '--workdir', $WorkDir,
        '-o', 'json',
        '--log-level', 'error'
    ) -FailureMessage 'Não foi possível verificar as funções do Supabase gerenciado.'
}

function Remove-TemporaryManagedSecrets {
    foreach ($name in @('META_REWRAP_ONE_TIME_SECRET', 'META_TOKEN_ENCRYPTION_KEY')) {
        $matches = @((Get-ManagedSecretInventory) | Where-Object { $_.name -eq $name })
        if ($matches.Count -gt 1) {
            throw "Inventário managed ambíguo para $name."
        }
        if ($matches.Count -eq 1) {
            $unsetResult = Invoke-SupabaseCliRaw -Arguments @(
                'secrets', 'unset', $name,
                '--project-ref', $ProjectRef,
                '--workdir', $WorkDir,
                '--yes',
                '--log-level', 'error'
            )
            if ($unsetResult.ExitCode -ne 0) {
                $unsetResult = $null
                throw "Não foi possível remover $name durante rollback."
            }
            $unsetResult = $null
        }
    }
    $remaining = @((Get-ManagedSecretInventory) | Where-Object {
        $_.name -in @('META_REWRAP_ONE_TIME_SECRET', 'META_TOKEN_ENCRYPTION_KEY')
    })
    if ($remaining.Count -ne 0) {
        throw 'Rollback não convergiu: ainda existe secret temporário managed.'
    }
}

function Wait-TemporaryManagedSecretDigests {
    for ($attempt = 0; $attempt -lt 10; $attempt++) {
        $inventory = @(Get-ManagedSecretInventory)
        $meta = @($inventory | Where-Object { $_.name -eq 'META_TOKEN_ENCRYPTION_KEY' })
        $bearer = @($inventory | Where-Object { $_.name -eq 'META_REWRAP_ONE_TIME_SECRET' })
        if (
            $meta.Count -eq 1 -and
            $bearer.Count -eq 1 -and
            [string]$meta[0].value -match '^[0-9a-fA-F]{64}$' -and
            [string]$bearer[0].value -match '^[0-9a-fA-F]{64}$'
        ) {
            return [pscustomobject]@{
                Meta = ([string]$meta[0].value).ToLowerInvariant()
                Bearer = ([string]$bearer[0].value).ToLowerInvariant()
            }
        }
        Start-Sleep -Seconds 1
    }
    throw 'Os digests dos secrets temporários não convergiram no managed.'
}

function Read-MetaKeyFromVps {
    $remoteScript = @'
set -euo pipefail
set +x
awk -F= '$1 == "META_TOKEN_ENCRYPTION_KEY" { sub(/^[^=]*=/, ""); print; found++ } END { if (found != 1) exit 42 }' /opt/crm-supabase/functions.env
'@
    $processInfo = New-Object Diagnostics.ProcessStartInfo
    $processInfo.FileName = 'ssh'
    $escapedKey = $SshKeyPath.Replace('"', '\"')
    $processInfo.Arguments = "-i `"$escapedKey`" -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 $VpsTarget bash -s"
    $processInfo.UseShellExecute = $false
    $processInfo.RedirectStandardInput = $true
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true
    $processInfo.CreateNoWindow = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $processInfo
    $originalInputEncoding = [Console]::InputEncoding
    $wireScript = $remoteScript.Replace("`r`n", "`n").Replace("`r", "`n")
    try {
        [Console]::InputEncoding = New-Object Text.UTF8Encoding($false)
        [void]$process.Start()
        $process.StandardInput.Write($wireScript)
        $process.StandardInput.Close()
        $standardOutput = $process.StandardOutput.ReadToEnd()
        $standardError = $process.StandardError.ReadToEnd()
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) {
            throw 'Não foi possível ler a chave Meta protegida da VPS.'
        }
        return $standardOutput.Trim()
    }
    finally {
        [Console]::InputEncoding = $originalInputEncoding
        $remoteScript = $null
        $wireScript = $null
        $standardOutput = $null
        $standardError = $null
        $process.Dispose()
    }
}

function Write-OneTimeSecretToVps(
    [string]$Secret,
    [string]$MetaDigest,
    [string]$BearerDigest
) {
    $remoteScript = @'
set -euo pipefail
set +x
main() {
  IFS= read -r one_time_secret
  IFS= read -r meta_digest
  IFS= read -r bearer_digest
  one_time_secret="${one_time_secret%$'\r'}"
  meta_digest="${meta_digest%$'\r'}"
  bearer_digest="${bearer_digest%$'\r'}"
  [[ "$one_time_secret" =~ ^[0-9a-f]{64}$ ]] || return 41
  [[ "$meta_digest" =~ ^[0-9a-f]{64}$ ]] || return 42
  [[ "$bearer_digest" =~ ^[0-9a-f]{64}$ ]] || return 43
  target=/run/crm-meta-rewrap.env
  temp_file="$(mktemp /run/.crm-meta-rewrap.env.XXXXXX)"
  trap 'unset one_time_secret; if [[ -n "${temp_file:-}" && -e "$temp_file" ]]; then shred -u -- "$temp_file"; fi' RETURN
  printf '%s\n' \
    "META_REWRAP_ONE_TIME_SECRET=$one_time_secret" \
    'CRM_META_REWRAP_PROJECT_REF=uxttihjsxfowursjyult' \
    "CRM_META_REWRAP_META_DIGEST=$meta_digest" \
    "CRM_META_REWRAP_BEARER_DIGEST=$bearer_digest" \
    >"$temp_file"
  chown root:root "$temp_file"
  chmod 0600 "$temp_file"
  mv -f -- "$temp_file" "$target"
  temp_file=''
  [[ "$(stat -c '%a:%U:%G' "$target")" == '600:root:root' ]]
  printf 'vps_one_time_file=ready mode=600 owner=root\n'
}
main
'@
    $wireScript = $remoteScript.Replace("`r`n", "`n").Replace("`r", "`n")
    $payload = $wireScript + "`n" + $Secret + "`n" + $MetaDigest + "`n" + $BearerDigest + "`n" + ': # end'
    $processInfo = New-Object Diagnostics.ProcessStartInfo
    $processInfo.FileName = 'ssh'
    $escapedKey = $SshKeyPath.Replace('"', '\"')
    $processInfo.Arguments = "-i `"$escapedKey`" -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 $VpsTarget bash -s"
    $processInfo.UseShellExecute = $false
    $processInfo.RedirectStandardInput = $true
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true
    $processInfo.CreateNoWindow = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $processInfo
    $originalInputEncoding = [Console]::InputEncoding
    try {
        [Console]::InputEncoding = New-Object Text.UTF8Encoding($false)
        [void]$process.Start()
        $process.StandardInput.Write($payload)
        $process.StandardInput.Close()
        $standardOutput = $process.StandardOutput.ReadToEnd()
        $standardError = $process.StandardError.ReadToEnd()
        $process.WaitForExit()
        if ($process.ExitCode -ne 0 -or $standardOutput -notmatch 'vps_one_time_file=ready') {
            throw 'Falha ao entregar o segredo one-time à VPS.'
        }
    }
    finally {
        [Console]::InputEncoding = $originalInputEncoding
        $wireScript = $null
        $payload = $null
        $standardOutput = $null
        $standardError = $null
        $process.Dispose()
    }
}

$temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$temporaryDirectory = Join-Path $temporaryRoot ('crm-meta-rewrap-' + [Guid]::NewGuid().ToString('N'))
$temporaryEnv = Join-Path $temporaryDirectory 'managed-secrets.env'
$metaKey = $null
$oneTimeSecret = $null

try {
    $inventory = @(Get-ManagedSecretInventory)
    if ($inventory | Where-Object { $_.name -in @('META_TOKEN_ENCRYPTION_KEY', 'META_REWRAP_ONE_TIME_SECRET') }) {
        throw 'Secrets temporários já existem no managed; limpe ou audite a execução anterior antes de continuar.'
    }
    if (-not ($inventory | Where-Object { $_.name -eq 'GOOGLE_CALENDAR_ENCRYPTION_KEY' })) {
        throw 'A chave legada managed não está configurada; o oráculo não pode funcionar.'
    }
    $managedFunctions = @(Get-ManagedFunctionInventory)
    if ($managedFunctions | Where-Object { $_.slug -eq 'meta-token-rewrap' }) {
        throw 'A função temporária já existe no managed; limpe ou audite a execução anterior antes de continuar.'
    }
    $inventory = $null
    $managedFunctions = $null

    $metaKey = Read-MetaKeyFromVps
    if ($metaKey -notmatch '^[0-9a-fA-F]{64}$') {
        throw 'A chave Meta da VPS não tem o formato esperado.'
    }

    $oneTimeSecret = New-RandomHex 32
    [void][IO.Directory]::CreateDirectory($temporaryDirectory)
    Set-PrivateDirectoryAcl $temporaryDirectory
    $utf8NoBom = New-Object Text.UTF8Encoding($false)
    [IO.File]::WriteAllText(
        $temporaryEnv,
        "META_TOKEN_ENCRYPTION_KEY=$metaKey`nMETA_REWRAP_ONE_TIME_SECRET=$oneTimeSecret`n",
        $utf8NoBom
    )

    try {
        $setResult = Invoke-SupabaseCliRaw -Arguments @(
            'secrets', 'set',
            '--env-file', $temporaryEnv,
            '--project-ref', $ProjectRef,
            '--workdir', $WorkDir,
            '--yes',
            '--log-level', 'error'
        )
        if ($setResult.ExitCode -ne 0) {
            $setResult = $null
            throw 'Falha ao configurar os secrets temporários no managed.'
        }
        $setResult = $null
        $digests = Wait-TemporaryManagedSecretDigests
        Write-OneTimeSecretToVps -Secret $oneTimeSecret -MetaDigest $digests.Meta -BearerDigest $digests.Bearer
        $digests = $null
    }
    catch {
        $handoffFailure = $_
        try {
            Remove-TemporaryManagedSecrets
        }
        catch {
            throw 'Handoff falhou e o rollback managed não pôde ser confirmado; audite imediatamente os dois secrets temporários.'
        }
        throw $handoffFailure
    }

    Write-Output 'managed_secret_handoff=PASS'
    Write-Output "project_ref=$ProjectRef"
    Write-Output "vps_one_time_file=$RemoteOneTimeFile mode=600"
    Write-Output 'secret_values_printed=no'
}
finally {
    Remove-PrivateTempDirectory $temporaryDirectory $temporaryRoot
    $metaKey = $null
    $oneTimeSecret = $null
    [GC]::Collect()
}
