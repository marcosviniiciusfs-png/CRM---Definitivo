[CmdletBinding()]
param(
    [string]$SshKeyPath = 'C:\Users\Hurtz\.ssh\kairoz_crm_hostinger_ed25519'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ProjectRef = 'uxttihjsxfowursjyult'
$FunctionName = 'meta-token-rewrap'
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

function Invoke-SupabaseCliRaw([string[]]$Arguments) {
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        # Windows PowerShell 5.1 turns successful native stderr into a
        # NativeCommandError under Stop. The CLI exit code is authoritative.
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

function Invoke-SupabaseQuiet([string[]]$Arguments, [string]$FailureMessage) {
    $result = Invoke-SupabaseCliRaw -Arguments $Arguments
    if ($result.ExitCode -ne 0) {
        $result = $null
        throw $FailureMessage
    }
    $result = $null
}

function Get-ManagedSecrets {
    return Invoke-SupabaseJson -Arguments @(
        'secrets', 'list',
        '--project-ref', $ProjectRef,
        '--workdir', $WorkDir,
        '-o', 'json',
        '--log-level', 'error'
    ) -FailureMessage 'Não foi possível inventariar os secrets managed.'
}

function Get-ManagedFunctions {
    return Invoke-SupabaseJson -Arguments @(
        'functions', 'list',
        '--project-ref', $ProjectRef,
        '--workdir', $WorkDir,
        '-o', 'json',
        '--log-level', 'error'
    ) -FailureMessage 'Não foi possível inventariar as funções managed.'
}

function Invoke-SshScript([string]$Script, [string]$FailureMessage) {
    $wireScript = $Script.Replace("`r`n", "`n").Replace("`r", "`n")
    $processInfo = New-Object Diagnostics.ProcessStartInfo
    $processInfo.FileName = 'ssh'
    $escapedKey = $SshKeyPath.Replace('"', '\"')
    $processInfo.Arguments = "-i `"$escapedKey`" -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 -o LogLevel=ERROR $VpsTarget bash -s"
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
        $process.StandardInput.Write($wireScript)
        $process.StandardInput.Close()
        $standardOutput = $process.StandardOutput.ReadToEnd()
        $standardError = $process.StandardError.ReadToEnd()
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) {
            throw $FailureMessage
        }
        return $standardOutput.Trim()
    }
    finally {
        [Console]::InputEncoding = $originalInputEncoding
        $wireScript = $null
        $standardOutput = $null
        $standardError = $null
        $process.Dispose()
    }
}

function Get-HandoffProvenanceFromVps {
    $remoteScript = @'
set -euo pipefail
set +x
target=/run/crm-meta-rewrap.env
if [[ ! -e "$target" && ! -L "$target" ]]; then
  printf 'marker_state=absent\n'
  exit 0
fi
[[ -f "$target" && ! -L "$target" ]] || exit 61
[[ "$(stat -c '%u:%a' "$target")" == '0:600' ]] || exit 62
for key in CRM_META_REWRAP_PROJECT_REF CRM_META_REWRAP_META_DIGEST CRM_META_REWRAP_BEARER_DIGEST; do
  [[ "$(grep -c "^${key}=" "$target")" == '1' ]] || exit 63
done
project_ref="$(awk -F= '$1 == "CRM_META_REWRAP_PROJECT_REF" {sub(/^[^=]*=/, ""); print}' "$target")"
meta_digest="$(awk -F= '$1 == "CRM_META_REWRAP_META_DIGEST" {sub(/^[^=]*=/, ""); print}' "$target")"
bearer_digest="$(awk -F= '$1 == "CRM_META_REWRAP_BEARER_DIGEST" {sub(/^[^=]*=/, ""); print}' "$target")"
[[ "$project_ref" == 'uxttihjsxfowursjyult' ]] || exit 64
[[ "$meta_digest" =~ ^[0-9a-f]{64}$ && "$bearer_digest" =~ ^[0-9a-f]{64}$ ]] || exit 65
printf 'marker_state=present project_ref=%s meta_digest=%s bearer_digest=%s\n' \
  "$project_ref" "$meta_digest" "$bearer_digest"
'@
    $result = Invoke-SshScript -Script $remoteScript -FailureMessage 'Não foi possível validar a proveniência do handoff na VPS.'
    if ($result -eq 'marker_state=absent') {
        return [pscustomobject]@{ Present = $false; MetaDigest = ''; BearerDigest = '' }
    }
    if ($result -notmatch '^marker_state=present project_ref=uxttihjsxfowursjyult meta_digest=([0-9a-f]{64}) bearer_digest=([0-9a-f]{64})$') {
        throw 'Marcador de proveniência do handoff possui formato inesperado.'
    }
    return [pscustomobject]@{
        Present = $true
        MetaDigest = $Matches[1]
        BearerDigest = $Matches[2]
    }
}

function Remove-OneTimeFileFromVps {
    $remoteScript = @'
set -euo pipefail
set +x
target=/run/crm-meta-rewrap.env
if [[ -e "$target" || -L "$target" ]]; then
  [[ -f "$target" && ! -L "$target" ]] || exit 51
  [[ "$(stat -c '%u:%a' "$target")" == '0:600' ]] || exit 52
  shred -u -- "$target"
fi
[[ ! -e "$target" && ! -L "$target" ]]
printf 'vps_one_time_file=removed\n'
'@
    $output = Invoke-SshScript -Script $remoteScript -FailureMessage 'Cleanup managed concluído, mas não foi possível remover o bearer volátil da VPS.'
    if ($output -ne 'vps_one_time_file=removed') {
        throw 'Cleanup managed concluído, mas não foi possível remover o bearer volátil da VPS.'
    }
    $output = $null
}

$provenance = Get-HandoffProvenanceFromVps
$initialSecrets = @(Get-ManagedSecrets)
$initialFunctions = @(Get-ManagedFunctions)
$temporarySecrets = @($initialSecrets | Where-Object {
    $_.name -in @('META_REWRAP_ONE_TIME_SECRET', 'META_TOKEN_ENCRYPTION_KEY')
})
$temporaryFunctions = @($initialFunctions | Where-Object { $_.slug -eq $FunctionName })

if (-not $provenance.Present) {
    if ($temporarySecrets.Count -ne 0 -or $temporaryFunctions.Count -ne 0) {
        throw 'Cleanup recusado: há artefato managed sem marcador de proveniência criado pelo handoff.'
    }
}
else {
    foreach ($expected in @(
        [pscustomobject]@{ Name = 'META_REWRAP_ONE_TIME_SECRET'; Digest = $provenance.BearerDigest },
        [pscustomobject]@{ Name = 'META_TOKEN_ENCRYPTION_KEY'; Digest = $provenance.MetaDigest }
    )) {
        $matches = @($initialSecrets | Where-Object { $_.name -eq $expected.Name })
        if ($matches.Count -gt 1) {
            throw "Cleanup recusado: inventário ambíguo para $($expected.Name)."
        }
        if (
            $matches.Count -eq 1 -and
            ([string]$matches[0].value).ToLowerInvariant() -ne $expected.Digest
        ) {
            throw "Cleanup recusado: $($expected.Name) não pertence ao handoff registrado."
        }
    }
}
$initialSecrets = $null
$initialFunctions = $null
$temporarySecrets = $null
$temporaryFunctions = $null

# Revoke authorization first. If a later cleanup step fails, the deployed
# endpoint remains inert and a rerun can safely finish the idempotent cleanup.
$secrets = @(Get-ManagedSecrets)
if ($secrets | Where-Object { $_.name -eq 'META_REWRAP_ONE_TIME_SECRET' }) {
    Invoke-SupabaseQuiet -Arguments @(
        'secrets', 'unset', 'META_REWRAP_ONE_TIME_SECRET',
        '--project-ref', $ProjectRef,
        '--workdir', $WorkDir,
        '--yes',
        '--log-level', 'error'
    ) -FailureMessage 'Não foi possível revogar o bearer one-time managed.'
}
$secrets = $null

$functions = @(Get-ManagedFunctions)
if ($functions | Where-Object { $_.slug -eq $FunctionName }) {
    Invoke-SupabaseQuiet -Arguments @(
        'functions', 'delete', $FunctionName,
        '--project-ref', $ProjectRef,
        '--workdir', $WorkDir,
        '--yes',
        '--log-level', 'error'
    ) -FailureMessage 'Bearer revogado, mas não foi possível excluir a função temporária.'
}
$functions = $null

$secrets = @(Get-ManagedSecrets)
if ($secrets | Where-Object { $_.name -eq 'META_TOKEN_ENCRYPTION_KEY' }) {
    Invoke-SupabaseQuiet -Arguments @(
        'secrets', 'unset', 'META_TOKEN_ENCRYPTION_KEY',
        '--project-ref', $ProjectRef,
        '--workdir', $WorkDir,
        '--yes',
        '--log-level', 'error'
    ) -FailureMessage 'Endpoint removido, mas não foi possível remover a cópia temporária da chave Meta.'
}
$secrets = $null

$finalSecrets = @(Get-ManagedSecrets)
$finalFunctions = @(Get-ManagedFunctions)
if ($finalSecrets | Where-Object { $_.name -in @('META_REWRAP_ONE_TIME_SECRET', 'META_TOKEN_ENCRYPTION_KEY') }) {
    throw 'Cleanup incompleto: ainda existe secret temporário managed.'
}
if ($finalFunctions | Where-Object { $_.slug -eq $FunctionName }) {
    throw 'Cleanup incompleto: a função temporária ainda existe.'
}
$finalSecrets = $null
$finalFunctions = $null

Remove-OneTimeFileFromVps

Write-Output 'managed_meta_rewrap_cleanup=PASS'
Write-Output "project_ref=$ProjectRef"
Write-Output "vps_one_time_file=$RemoteOneTimeFile removed=yes"
Write-Output 'secret_values_printed=no'
