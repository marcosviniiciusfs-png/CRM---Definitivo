#requires -Version 5.1

<#
.SYNOPSIS
Orquestra o corte final do CRM Definitivo com checkpoints e rollback capturado.

.DESCRIPTION
As identidades de projeto, VPS, dominio e Vercel sao constantes, nao parametros.
Use -Preflight para verificacoes sem mutacao remota/provedor. O corte exige a
frase exata PODE_COLOCAR_EM_PRODUCAO. Secrets ficam na VPS/Vercel; a ANON_KEY
passa apenas por memoria e stdin e nunca e exibida, persistida ou posta em argv.
#>

[CmdletBinding(DefaultParameterSetName = 'Execute')]
param(
    [Parameter(Mandatory = $true, ParameterSetName = 'Execute')]
    [string]$Confirm,

    [Parameter(ParameterSetName = 'Execute')]
    [ValidatePattern('^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$')]
    [string]$ResumeRunId,

    [Parameter(Mandatory = $true, ParameterSetName = 'Preflight')]
    [switch]$Preflight,

    [Parameter(Mandatory = $true, ParameterSetName = 'Rollback')]
    [switch]$Rollback,

    [Parameter(Mandatory = $true, ParameterSetName = 'Rollback')]
    [ValidatePattern('^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$')]
    [string]$RunId,

    [Parameter(Mandatory = $true, ParameterSetName = 'Rollback')]
    [string]$ConfirmRollback
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:GoPhrase = 'PODE_COLOCAR_EM_PRODUCAO'
$script:RollbackPhrase = 'VOLTAR_PARA_SUPABASE'
$script:ProjectRef = 'uxttihjsxfowursjyult'
$script:Vps = '103.199.185.97'
$script:ApiHost = 'api.kairozcrm.com.br'
$script:ApiOrigin = 'https://api.kairozcrm.com.br'
$script:SourceOrigin = 'https://uxttihjsxfowursjyult.supabase.co'
$script:FrontendOrigin = 'https://www.kairozcrm.com.br'
$script:VercelProject = 'crm-definitivo'
$script:VercelProjectId = 'prj_xH76duP9ZeURyP1O69nrfcMufSMN'
$script:VercelOrgId = 'team_A0CUJoHvMbaNzctSEu07wxdF'
$script:VercelScope = 'kairozs-projects'
$script:VercelVersion = '59.10.0'
$script:SupabaseVersion = '2.116.0'
$script:FunctionCount = 96
$script:BackupMode = 'managed-source-cold'
$script:RemoteKit = '/opt/crm-migration-kit'
$script:RemoteInstall = '/opt/crm-supabase'
$script:RemoteBackup = '/var/backups/crm-supabase'
$script:SshTarget = "root@$($script:Vps)"
$script:SshKey = Join-Path $env:USERPROFILE '.ssh\kairoz_crm_hostinger_ed25519'
$script:RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$script:ManagedMetaWorkDir = Join-Path $PSScriptRoot 'managed-meta-rewrap'
$script:StateRoot = Join-Path $script:RepoRoot '.crm-cutover-state'
$script:Npx = $null
$script:CutoverLock = $null

function Write-CutoverLog {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host "[$([DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ'))] $Message"
}

function Protect-LogLine {
    param([AllowEmptyString()][string]$Line)
    if ($null -eq $Line) { return '' }
    $safe = $Line -replace 'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}', '[JWT REDACTED]'
    $safe = $safe -replace '(?i)(STORAGE_HANDOFF:[A-Z0-9_]+:)[A-Za-z0-9+/]*={0,2}', '$1[REDACTED]'
    return ($safe -replace '(?i)((?:password|secret|token|api[_-]?key)\s*[=:]\s*)\S+', '$1[REDACTED]')
}

function Enter-CutoverLock {
    if (-not (Test-Path -LiteralPath $script:StateRoot -PathType Container)) {
        [void](New-Item -ItemType Directory -Path $script:StateRoot)
    }
    $path = Join-Path $script:StateRoot '.orchestrator.lock'
    try {
        $script:CutoverLock = [IO.File]::Open(
            $path, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None
        )
    }
    catch {
        throw 'Outro processo de corte/rollback esta ativo neste checkout.'
    }
}

function Exit-CutoverLock {
    if ($null -ne $script:CutoverLock) {
        $script:CutoverLock.Dispose()
        $script:CutoverLock = $null
    }
}

function Write-SafeOutput {
    param([object[]]$Lines)
    foreach ($line in @($Lines)) { Write-Host (Protect-LogLine ([string]$line)) }
}

function Assert-ExitCode {
    param([int]$Code, [string]$Operation)
    if ($Code -ne 0) { throw "$Operation falhou (exit code $Code)." }
}

function Invoke-Native {
    param([string]$Command, [string[]]$Arguments = @(), [switch]$Capture, [switch]$Quiet)
    # Windows PowerShell 5.1 promotes native stderr records to NativeCommandError
    # when the caller uses ErrorActionPreference=Stop. CLIs such as Vercel emit
    # harmless version/progress lines on stderr even with exit code zero, so the
    # native process exit code must remain the source of truth.
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $LASTEXITCODE = 0
        $output = @(& $Command @Arguments 2>&1)
        $code = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if (-not $Quiet -or $code -ne 0) { Write-SafeOutput $output }
    Assert-ExitCode $code $Command
    if ($Capture) { return $output }
}

function Get-SshArguments {
    return @(
        '-T', '-i', $script:SshKey,
        '-o', 'BatchMode=yes',
        '-o', 'IdentitiesOnly=yes',
        '-o', 'StrictHostKeyChecking=yes',
        '-o', 'ConnectTimeout=10',
        '-o', 'ServerAliveInterval=15',
        '-o', 'ServerAliveCountMax=4',
        '-o', 'LogLevel=ERROR'
    )
}

function Get-ScpArguments {
    return @(
        '-q', '-i', $script:SshKey,
        '-o', 'BatchMode=yes',
        '-o', 'IdentitiesOnly=yes',
        '-o', 'StrictHostKeyChecking=yes',
        '-o', 'ConnectTimeout=10',
        '-o', 'LogLevel=ERROR'
    )
}

function Invoke-Remote {
    param([Parameter(Mandatory = $true)][string]$Script, [switch]$Capture, [switch]$Quiet)
    $normalized = $Script.Replace("`r`n", "`n").Replace("`r", "`n") + "`n"
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = (Get-Command ssh.exe -ErrorAction Stop).Source
    $info.Arguments = Join-WindowsArguments (@(Get-SshArguments) + @($script:SshTarget, 'bash -s'))
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    $originalInputEncoding = [Console]::InputEncoding
    try {
        [Console]::InputEncoding = New-Object Text.UTF8Encoding($false)
        if (-not $process.Start()) { throw 'Nao foi possivel iniciar o SSH da VPS.' }
        $outTask = $process.StandardOutput.ReadToEndAsync()
        $errTask = $process.StandardError.ReadToEndAsync()
        $process.StandardInput.Write($normalized)
        $process.StandardInput.Close()
        $process.WaitForExit()
        $outTask.Wait(); $errTask.Wait()
        $output = @()
        if ($outTask.Result) { $output += ($outTask.Result -split "`r?`n" | Where-Object { $_ }) }
        if ($errTask.Result) { $output += ($errTask.Result -split "`r?`n" | Where-Object { $_ }) }
        if (-not $Quiet -or $process.ExitCode -ne 0) { Write-SafeOutput $output }
        Assert-ExitCode $process.ExitCode 'SSH/VPS'
        if ($Capture) { return $output }
    }
    finally {
        [Console]::InputEncoding = $originalInputEncoding
        $normalized = $null
        $process.Dispose()
    }
}

function Get-Npx {
    if ($null -eq $script:Npx) { $script:Npx = (Get-Command npx.cmd -ErrorAction Stop).Source }
    return $script:Npx
}

function Invoke-Vercel {
    param([string[]]$Arguments, [switch]$Capture, [switch]$Quiet)
    $all = @('--yes', "vercel@$($script:VercelVersion)") + $Arguments
    return Invoke-Native -Command (Get-Npx) -Arguments $all -Capture:$Capture -Quiet:$Quiet
}

function Get-VercelDeploymentText {
    param(
        [Parameter(Mandatory = $true)][string]$Deployment,
        [Parameter(Mandatory = $true)][string]$Path
    )
    if ($Deployment -notmatch '^https://crm-definitivo-[a-z0-9-]+\.vercel\.app$') {
        throw 'Deploy protegido recusado.'
    }
    if ($Path -notmatch '^/[^\r\n]*$') { throw 'Caminho de deploy protegido recusado.' }
    $lines = @(Invoke-Vercel -Arguments @(
        'curl', $Path, '--deployment', $Deployment, '--yes', '--',
        '--fail', '--silent', '--show-error'
    ) -Capture -Quiet)
    $text = $lines -join "`n"
    if ([string]::IsNullOrWhiteSpace($text)) { throw 'Vercel curl retornou corpo vazio.' }
    return $text
}

function Invoke-Supabase {
    param([string[]]$Arguments, [switch]$Capture, [switch]$Quiet)
    $all = @('--yes', "supabase@$($script:SupabaseVersion)") + $Arguments
    return Invoke-Native -Command (Get-Npx) -Arguments $all -Capture:$Capture -Quiet:$Quiet
}

function ConvertFrom-CliJsonArray {
    param([object[]]$Output, [string]$Operation)
    $text = $Output -join "`n"
    $start = $text.IndexOf('[')
    $end = $text.LastIndexOf(']')
    if ($start -lt 0 -or $end -le $start) { throw "$Operation nao retornou array JSON." }
    try { $parsed = $text.Substring($start, ($end - $start) + 1) | ConvertFrom-Json }
    catch { throw "$Operation retornou JSON invalido." }
    foreach ($item in $parsed) { Write-Output $item }
}

function Get-ManagedMetaFunctions {
    $output = @(Invoke-Supabase -Arguments @(
        'functions', 'list', '--project-ref', $script:ProjectRef, '--output-format', 'json',
        '--workdir', $script:ManagedMetaWorkDir, '--log-level', 'error'
    ) -Capture -Quiet)
    return ConvertFrom-CliJsonArray $output 'Inventario de Functions managed'
}

function Get-ManagedMetaSecrets {
    $output = @(Invoke-Supabase -Arguments @(
        'secrets', 'list', '--project-ref', $script:ProjectRef, '--output-format', 'json',
        '--workdir', $script:ManagedMetaWorkDir, '--log-level', 'error'
    ) -Capture -Quiet)
    return ConvertFrom-CliJsonArray $output 'Inventario de secrets managed'
}

function Get-RemoteMetaRewrapProvenance {
    $output = @(Invoke-Remote -Capture -Quiet @'
set -Eeuo pipefail
set +x
file=/run/crm-meta-rewrap.env
[[ -f "$file" && ! -L "$file" ]]
[[ "$(stat -c '%u:%a' "$file")" == '0:600' ]]
for key in CRM_META_REWRAP_PROJECT_REF CRM_META_REWRAP_META_DIGEST CRM_META_REWRAP_BEARER_DIGEST; do
  [[ "$(grep -c "^${key}=" "$file")" == '1' ]]
done
project_ref="$(awk -F= '$1 == "CRM_META_REWRAP_PROJECT_REF" {sub(/^[^=]*=/, ""); print}' "$file")"
meta_digest="$(awk -F= '$1 == "CRM_META_REWRAP_META_DIGEST" {sub(/^[^=]*=/, ""); print}' "$file")"
bearer_digest="$(awk -F= '$1 == "CRM_META_REWRAP_BEARER_DIGEST" {sub(/^[^=]*=/, ""); print}' "$file")"
[[ "$project_ref" == 'uxttihjsxfowursjyult' ]]
[[ "$meta_digest" =~ ^[0-9a-f]{64}$ && "$bearer_digest" =~ ^[0-9a-f]{64}$ ]]
printf 'CRM_META_REWRAP_PROVENANCE=%s:%s:%s\n' "$project_ref" "$meta_digest" "$bearer_digest"
'@)
    $tagged = @($output | ForEach-Object { [string]$_ } |
        Where-Object { $_.StartsWith('CRM_META_REWRAP_PROVENANCE=') })
    if ($tagged.Count -ne 1 -or
        $tagged[0] -notmatch '^CRM_META_REWRAP_PROVENANCE=uxttihjsxfowursjyult:([0-9a-f]{64}):([0-9a-f]{64})$') {
        throw 'Proveniencia do handoff Meta na VPS esta ausente ou invalida.'
    }
    return [pscustomobject]@{ MetaDigest = $Matches[1]; BearerDigest = $Matches[2] }
}

function Assert-ManagedMetaOracleReadiness {
    $functions = @(Get-ManagedMetaFunctions)
    $oracle = @($functions | Where-Object { $_.slug -eq 'meta-token-rewrap' })
    if ($oracle.Count -ne 1 -or $oracle[0].status -ne 'ACTIVE' -or [bool]$oracle[0].verify_jwt) {
        throw 'Oraculo temporario Meta managed ausente/inativo ou com verify_jwt inesperado.'
    }
    $secrets = @(Get-ManagedMetaSecrets)
    $provenance = Get-RemoteMetaRewrapProvenance
    foreach ($expected in @(
        [pscustomobject]@{ Name = 'META_REWRAP_ONE_TIME_SECRET'; Digest = $provenance.BearerDigest },
        [pscustomobject]@{ Name = 'META_TOKEN_ENCRYPTION_KEY'; Digest = $provenance.MetaDigest }
    )) {
        $matches = @($secrets | Where-Object { $_.name -eq $expected.Name })
        if ($matches.Count -ne 1 -or ([string]$matches[0].value).ToLowerInvariant() -ne $expected.Digest) {
            throw "Secret temporario managed nao pertence ao handoff registrado: $($expected.Name)."
        }
    }
    Write-CutoverLog 'Oraculo Meta temporario e proveniencia do handoff foram validados sem expor valores.'
}

function Assert-ManagedMetaOracleRevoked {
    if (@((Get-ManagedMetaFunctions) | Where-Object { $_.slug -eq 'meta-token-rewrap' }).Count -ne 0) {
        throw 'Function temporaria Meta ainda existe.'
    }
    $secrets = @(Get-ManagedMetaSecrets)
    if (@($secrets | Where-Object { $_.name -in @('META_REWRAP_ONE_TIME_SECRET', 'META_TOKEN_ENCRYPTION_KEY') }).Count -ne 0) {
        throw 'Secrets temporarios Meta ainda existem no managed.'
    }
    Invoke-Remote -Quiet "set -Eeuo pipefail; [[ ! -e /run/crm-meta-rewrap.env && ! -L /run/crm-meta-rewrap.env ]]"
}

function Remove-ManagedMetaOracle {
    $helper = Join-Path $script:ManagedMetaWorkDir 'Remove-ManagedMetaRewrap.ps1'
    if (-not (Test-Path -LiteralPath $helper -PathType Leaf)) { throw 'Helper de cleanup Meta esta ausente.' }
    $output = @(& $helper -SshKeyPath $script:SshKey)
    Write-SafeOutput $output
    Assert-ManagedMetaOracleRevoked
}

function Quote-WindowsArgument {
    param([AllowEmptyString()][string]$Value)
    if ($Value.Length -gt 0 -and $Value -notmatch '[\s"]') { return $Value }
    $builder = New-Object Text.StringBuilder
    [void]$builder.Append('"')
    $slashes = 0
    foreach ($character in $Value.ToCharArray()) {
        if ($character -eq '\') { $slashes++; continue }
        if ($character -eq '"') {
            [void]$builder.Append(('\' * (($slashes * 2) + 1)))
            [void]$builder.Append('"')
            $slashes = 0
            continue
        }
        if ($slashes -gt 0) { [void]$builder.Append(('\' * $slashes)); $slashes = 0 }
        [void]$builder.Append($character)
    }
    if ($slashes -gt 0) { [void]$builder.Append(('\' * ($slashes * 2))) }
    [void]$builder.Append('"')
    return $builder.ToString()
}

function Join-WindowsArguments {
    param([string[]]$Arguments)
    return (($Arguments | ForEach-Object { Quote-WindowsArgument $_ }) -join ' ')
}

function Invoke-VercelWithBytes {
    param([string[]]$Arguments, [byte[]]$InputBytes)
    $tokens = @((Get-Npx), '--yes', "vercel@$($script:VercelVersion)") + $Arguments
    $quoted = @($tokens | ForEach-Object { '"' + $_.Replace('"', '""') + '"' }) -join ' '
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = $env:ComSpec
    $info.Arguments = '/d /s /c "' + $quoted + '"'
    $info.WorkingDirectory = $script:RepoRoot
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    $originalInputEncoding = [Console]::InputEncoding
    try {
        [Console]::InputEncoding = New-Object Text.UTF8Encoding($false)
        if (-not $process.Start()) { throw 'Nao foi possivel iniciar a CLI da Vercel.' }
        $outTask = $process.StandardOutput.ReadToEndAsync()
        $errTask = $process.StandardError.ReadToEndAsync()
        $process.StandardInput.BaseStream.Write($InputBytes, 0, $InputBytes.Length)
        $process.StandardInput.Close()
        $process.WaitForExit()
        $outTask.Wait(); $errTask.Wait()
        $lines = @()
        if ($outTask.Result) { $lines += ($outTask.Result -split "`r?`n") }
        if ($errTask.Result) { $lines += ($errTask.Result -split "`r?`n") }
        Write-SafeOutput ($lines | Where-Object { $_ })
        Assert-ExitCode $process.ExitCode 'Vercel env add'
    }
    finally {
        [Console]::InputEncoding = $originalInputEncoding
        $process.Dispose()
    }
}

function Set-VercelTextEnv {
    param([string]$Name, [string]$Value, [switch]$Sensitive)
    if ($Name -notmatch '^VITE_[A-Z0-9_]+$') { throw "Variavel Vercel recusada: $Name" }
    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    try {
        $args = @(
            'env', 'add', $Name, 'production', '--force', '--yes',
            '--project', $script:VercelProject, '--scope', $script:VercelScope, '--no-color'
        )
        if ($Sensitive) { $args += '--sensitive' } else { $args += '--no-sensitive' }
        Invoke-VercelWithBytes -Arguments $args -InputBytes $bytes
    }
    finally { [Array]::Clear($bytes, 0, $bytes.Length) }
}

function Set-VercelTargetAnonKey {
    $reader = @'
set -Eeuo pipefail
set +x
file=/opt/crm-supabase/.env
[[ -f "$file" && ! -L "$file" ]]
awk -F= '
  $1 == "ANON_KEY" { value=substr($0,index($0,"=")+1); found++ }
  END {
    if (found != 1 || length(value) < 20 || value ~ /[[:space:]]/) exit 42
    printf "%s", value
  }
' "$file"
'@
    $reader = $reader.Replace("`r`n", "`n").Replace("`r", "`n") + "`n"
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = (Get-Command ssh.exe -ErrorAction Stop).Source
    $info.Arguments = Join-WindowsArguments (@(Get-SshArguments) + @($script:SshTarget, 'bash -s'))
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $ssh = New-Object Diagnostics.Process
    $ssh.StartInfo = $info
    $memory = New-Object IO.MemoryStream
    $bytes = $null
    $originalInputEncoding = [Console]::InputEncoding
    try {
        [Console]::InputEncoding = New-Object Text.UTF8Encoding($false)
        if (-not $ssh.Start()) { throw 'Nao foi possivel iniciar o relay SSH da ANON_KEY.' }
        $errorTask = $ssh.StandardError.ReadToEndAsync()
        $copyTask = $ssh.StandardOutput.BaseStream.CopyToAsync($memory)
        $ssh.StandardInput.Write($reader); $ssh.StandardInput.Close()
        $ssh.WaitForExit(); $copyTask.Wait(); $errorTask.Wait()
        if ($ssh.ExitCode -ne 0) {
            if ($errorTask.Result) { Write-SafeOutput @($errorTask.Result) }
            throw 'Relay SSH da ANON_KEY falhou; Vercel nao foi alterada.'
        }
        $bytes = $memory.ToArray()
        if ($bytes.Length -lt 20 -or $bytes.Length -gt 4096) { throw 'ANON_KEY possui comprimento invalido.' }
        $dots = 0
        foreach ($byte in $bytes) {
            if ($byte -lt 33 -or $byte -gt 126) { throw 'ANON_KEY contem byte inesperado.' }
            if ($byte -eq 46) { $dots++ }
        }
        if ($dots -ne 2 -or $bytes[0] -ne 101 -or $bytes[1] -ne 121 -or $bytes[2] -ne 74) {
            throw 'ANON_KEY nao tem formato JWT.'
        }
        Invoke-VercelWithBytes -Arguments @(
            'env', 'add', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'production',
            '--force', '--yes', '--type', 'config', '--project', $script:VercelProject,
            '--scope', $script:VercelScope, '--no-color'
        ) -InputBytes $bytes
        Write-CutoverLog 'ANON_KEY transferida VPS -> Vercel sem persistencia/exibicao local.'
    }
    finally {
        [Console]::InputEncoding = $originalInputEncoding
        if ($null -ne $bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
        $memory.Dispose(); $ssh.Dispose()
    }
}

function Initialize-State {
    param([string]$CurrentRunId)
    if ($CurrentRunId -notmatch '^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$') { throw 'Run id invalido.' }
    if (-not (Test-Path -LiteralPath $script:StateRoot)) { [void](New-Item -ItemType Directory $script:StateRoot) }
    $script:RunState = Join-Path $script:StateRoot $CurrentRunId
    if (-not (Test-Path -LiteralPath $script:RunState)) {
        [void](New-Item -ItemType Directory $script:RunState)
        [IO.File]::WriteAllText((Join-Path $script:RunState 'RUN_ID'), $CurrentRunId)
        $rollbackCommand = ".\infra\hostinger-supabase\Invoke-CrmProductionCutover.ps1 -Rollback -RunId $CurrentRunId -ConfirmRollback $($script:RollbackPhrase)`r`n"
        [IO.File]::WriteAllText((Join-Path $script:RunState 'ROLLBACK_COMMAND.txt'), $rollbackCommand)
    }
    if ([IO.File]::ReadAllText((Join-Path $script:RunState 'RUN_ID')).Trim() -ne $CurrentRunId) {
        throw 'Diretorio de estado pertence a outro run.'
    }
}

function State-Path {
    param([string]$Name)
    if ($Name -notmatch '^[a-z0-9_.-]+$') { throw "Nome de checkpoint invalido: $Name" }
    return Join-Path $script:RunState $Name
}

function Set-Artifact {
    param([string]$Name, [string]$Value)
    if ($Value -match "[`r`n]") { throw 'Artefato multilinha recusado.' }
    $path = State-Path "$Name.artifact"
    $temporary = "$path.$([Guid]::NewGuid().ToString('N')).tmp"
    [IO.File]::WriteAllText($temporary, $Value)
    Move-Item -LiteralPath $temporary -Destination $path -Force
}

function Get-Artifact {
    param([string]$Name)
    $path = State-Path "$Name.artifact"
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
    return [IO.File]::ReadAllText($path).Trim()
}

function Test-Stage {
    param([string]$Name)
    return Test-Path -LiteralPath (State-Path "$Name.done") -PathType Leaf
}

function Test-RollbackStep {
    param([string]$Name)
    return Test-Path -LiteralPath (State-Path "rollback_$Name.done") -PathType Leaf
}

function Set-RollbackStarted {
    $path = State-Path 'rollback.started'
    if (Test-Path -LiteralPath $path -PathType Leaf) { return }
    if (Test-Path -LiteralPath $path) { throw 'Marker local de rollback possui tipo inesperado.' }
    $temporary = "$path.$([Guid]::NewGuid().ToString('N')).tmp"
    try {
        [IO.File]::WriteAllText($temporary, [DateTime]::UtcNow.ToString('o'))
        Move-Item -LiteralPath $temporary -Destination $path
    }
    finally {
        if (Test-Path -LiteralPath $temporary -PathType Leaf) {
            Remove-Item -LiteralPath $temporary -Force
        }
    }
}

function Assert-RunCanResumeForward {
    if (Test-Path -LiteralPath (State-Path 'rolled_back.done') -PathType Leaf) {
        throw 'Este run terminou em rollback e nao pode ser retomado. Execute novo preflight e inicie um novo run.'
    }
    $rollbackStarted = Test-Path -LiteralPath (State-Path 'rollback.started') -PathType Leaf
    $rollbackSteps = @(Get-ChildItem -LiteralPath $script:RunState -File -Filter 'rollback_*.done')
    if ($rollbackStarted -or $rollbackSteps.Count -gt 0) {
        throw 'Este run iniciou rollback e nao pode voltar ao fluxo de producao. Retome somente com -Rollback ate convergir.'
    }
}

function Complete-RollbackStep {
    param([string]$Name)
    $path = State-Path "rollback_$Name.done"
    $temporary = "$path.$([Guid]::NewGuid().ToString('N')).tmp"
    [IO.File]::WriteAllText($temporary, [DateTime]::UtcNow.ToString('o'))
    Move-Item -LiteralPath $temporary -Destination $path -Force
}

function Invoke-RollbackAction {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Description,
        [Parameter(Mandatory = $true)][scriptblock]$Action,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][System.Collections.Generic.List[string]]$Failures
    )
    if (Test-RollbackStep $Name) {
        Write-CutoverLog "Rollback SKIP checkpoint: $Description"
        return $true
    }
    Write-CutoverLog "Rollback INICIO: $Description"
    try {
        & $Action | Out-Null
        Complete-RollbackStep $Name
        Write-CutoverLog "Rollback OK: $Description"
        return $true
    }
    catch {
        $message = Protect-LogLine $_.Exception.Message
        [void]$Failures.Add("${Name}: $message")
        Write-CutoverLog "Rollback FALHA FECHADA em ${Name}: $message"
        return $false
    }
}

function Invoke-Stage {
    param([string]$Name, [string]$Description, [scriptblock]$Action)
    if (Test-Stage $Name) { Write-CutoverLog "SKIP checkpoint: $Description"; return }
    [IO.File]::WriteAllText((State-Path "$Name.running"), [DateTime]::UtcNow.ToString('o'))
    Write-CutoverLog "INICIO: $Description"
    try {
        & $Action
        [IO.File]::WriteAllText((State-Path "$Name.done"), [DateTime]::UtcNow.ToString('o'))
        $running = State-Path "$Name.running"
        if (Test-Path -LiteralPath $running) { Remove-Item -LiteralPath $running -Force }
        Write-CutoverLog "OK: $Description"
    }
    catch {
        Write-CutoverLog "FALHA FECHADA: $Description. Retome com -ResumeRunId $($script:ActiveRunId)."
        throw
    }
}

function Get-CurrentProductionDeployment {
    for ($attempt = 0; $attempt -lt 12; $attempt++) {
        $output = @(Invoke-Vercel -Arguments @(
            'inspect', $script:FrontendOrigin, '--json', '--non-interactive',
            '--scope', $script:VercelScope, '--no-color'
        ) -Capture -Quiet)
        $text = $output -join "`n"
        $match = [regex]::Match($text, '(?s)\{.*\}')
        if ($match.Success) {
            $deployment = $match.Value | ConvertFrom-Json
            $properties = @($deployment.PSObject.Properties.Name)
            if (@('contextName', 'name', 'target', 'readyState', 'url') |
                Where-Object { $properties -notcontains $_ }) {
                Start-Sleep -Seconds 3
                continue
            }
            if ($deployment.contextName -ne $script:VercelScope -or
                $deployment.name -ne $script:VercelProject -or
                $deployment.target -ne 'production' -or
                $deployment.readyState -ne 'READY') {
                throw 'Deploy Vercel nao pertence ao CRM Definitivo/production.'
            }
            if (($properties -contains 'aliases') -and
                @($deployment.aliases) -notcontains ([Uri]$script:FrontendOrigin).Host) {
                throw 'Alias principal nao pertence ao deploy inspecionado.'
            }
            $url = [string]$deployment.url
            if ($url -notmatch '^crm-definitivo-[a-z0-9-]+\.vercel\.app$') { throw 'URL Vercel inesperada.' }
            return "https://$url"
        }
        Start-Sleep -Seconds 3
    }
    throw 'Vercel nao retornou inventario convergente do alias de producao.'
}

function Get-DeploymentUrl {
    param([object[]]$Output)
    $text = $Output -join "`n"
    $candidates = New-Object Collections.Generic.HashSet[string] ([StringComparer]::OrdinalIgnoreCase)
    foreach ($match in [regex]::Matches(
        $text,
        '(?<![A-Za-z0-9-])(?:https://)?crm-definitivo-[a-z0-9-]+\.vercel\.app(?![A-Za-z0-9.-])'
    )) {
        $value = $match.Value
        if (-not $value.StartsWith('https://', [StringComparison]::OrdinalIgnoreCase)) { $value = "https://$value" }
        [void]$candidates.Add($value.ToLowerInvariant())
    }
    if ($candidates.Count -eq 1) { return @($candidates)[0] }
    if ($candidates.Count -gt 1) { throw 'Saida Vercel retornou URLs de deploy ambiguas.' }
    $jsonMatch = [regex]::Match($text, '(?s)\{.*\}')
    if ($jsonMatch.Success) {
        $parsed = $jsonMatch.Value | ConvertFrom-Json
        if ($parsed.PSObject.Properties.Name -contains 'url') {
            $value = [string]$parsed.url
            if ($value -match '^crm-definitivo-[a-z0-9-]+\.vercel\.app$') { return "https://$value" }
            if ($value -match '^https://crm-definitivo-[a-z0-9-]+\.vercel\.app$') { return $value }
        }
        if (($parsed.PSObject.Properties.Name -contains 'deployment') -and $null -ne $parsed.deployment -and
            ($parsed.deployment.PSObject.Properties.Name -contains 'url')) {
            $value = [string]$parsed.deployment.url
            if ($value -match '^crm-definitivo-[a-z0-9-]+\.vercel\.app$') { return "https://$value" }
            if ($value -match '^https://crm-definitivo-[a-z0-9-]+\.vercel\.app$') { return $value }
        }
    }
    throw 'URL do deploy candidato nao foi encontrada.'
}

function Assert-VercelBundle {
    param([string]$Url, [bool]$Maintenance, [bool]$TargetApi)
    if ($Url -notmatch '^https://crm-definitivo-[a-z0-9-]+\.vercel\.app$') { throw 'URL candidata recusada.' }
    $index = Get-VercelDeploymentText -Deployment $Url -Path '/'
    $matches = [regex]::Matches($index, '(?:src|href)=["'']([^"'']+\.js(?:\?[^"'']*)?)["'']')
    if ($matches.Count -eq 0) { throw 'Bundle JavaScript candidato nao foi encontrado.' }
    $compiled = New-Object Text.StringBuilder
    foreach ($match in $matches) {
        $path = $match.Groups[1].Value
        if ($path -match '^https://') { continue }
        $asset = Get-VercelDeploymentText -Deployment $Url -Path "/$($path.TrimStart('/'))"
        [void]$compiled.Append($asset)
    }
    $text = $compiled.ToString()
    if ($text.Contains('Estamos migrando nossa infraestrutura') -ne $Maintenance) {
        throw "Bundle divergiu do modo manutencao esperado ($Maintenance)."
    }
    if ($text.Contains($script:ApiOrigin) -ne $TargetApi) {
        throw "Bundle divergiu do backend target esperado ($TargetApi)."
    }
}

function ConvertFrom-Base64UrlBytes {
    param([string]$Value)
    $normalized = $Value.Replace('-', '+').Replace('_', '/')
    while (($normalized.Length % 4) -ne 0) { $normalized += '=' }
    return [Convert]::FromBase64String($normalized)
}

function Test-BlueAnonJwt {
    param([string]$Jwt)
    try {
        $parts = $Jwt.Split('.')
        if ($parts.Count -ne 3) { return $false }
        $payloadBytes = ConvertFrom-Base64UrlBytes $parts[1]
        try {
            $payload = [Text.Encoding]::UTF8.GetString($payloadBytes) | ConvertFrom-Json
            return ($payload.role -eq 'anon' -and $payload.ref -eq $script:ProjectRef -and $payload.iss -eq 'supabase')
        }
        finally { [Array]::Clear($payloadBytes, 0, $payloadBytes.Length) }
    }
    catch { return $false }
}

function Capture-BlueAnonKey {
    $destination = State-Path 'blue-anon.dpapi'
    Add-Type -AssemblyName System.Security
    if (Test-Path -LiteralPath $destination -PathType Leaf) {
        $entropy = [Text.Encoding]::UTF8.GetBytes("crm-definitivo-blue-anon:$($script:ProjectRef)")
        $existingCipher = [IO.File]::ReadAllBytes($destination)
        $existingPlain = $null
        try {
            $existingPlain = [Security.Cryptography.ProtectedData]::Unprotect(
                $existingCipher, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser
            )
            $existingJwt = [Text.Encoding]::UTF8.GetString($existingPlain)
            if (-not (Test-BlueAnonJwt $existingJwt)) {
                throw 'Captura DPAPI blue existente falhou na revalidacao de identidade.'
            }
            Write-CutoverLog 'Captura DPAPI blue existente revalidada.'
            return
        }
        finally {
            [Array]::Clear($existingCipher, 0, $existingCipher.Length)
            if ($null -ne $existingPlain) { [Array]::Clear($existingPlain, 0, $existingPlain.Length) }
            [Array]::Clear($entropy, 0, $entropy.Length)
        }
    }
    $blue = Get-Artifact 'blue_deployment'
    if ($blue -notmatch '^https://crm-definitivo-[a-z0-9-]+\.vercel\.app$') { throw 'Deploy blue ausente para capturar env.' }
    Assert-VercelBundle -Url $blue -Maintenance $false -TargetApi $false
    $index = Get-VercelDeploymentText -Deployment $blue -Path '/'
    $assetMatches = [regex]::Matches($index, '(?:src|href)=["'']([^"'']+\.js(?:\?[^"'']*)?)["'']')
    $candidates = New-Object Collections.Generic.List[string]
    foreach ($assetMatch in $assetMatches) {
        $path = $assetMatch.Groups[1].Value
        if ($path -match '^https://') { continue }
        $asset = Get-VercelDeploymentText -Deployment $blue -Path "/$($path.TrimStart('/'))"
        foreach ($jwtMatch in [regex]::Matches($asset, 'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}')) {
            $jwt = $jwtMatch.Value
            if ((Test-BlueAnonJwt $jwt) -and -not $candidates.Contains($jwt)) { $candidates.Add($jwt) }
        }
    }
    if ($candidates.Count -ne 1) { throw 'Bundle blue nao contem exatamente uma ANON_KEY do projeto fixado.' }
    $plain = [Text.Encoding]::UTF8.GetBytes($candidates[0])
    $entropy = [Text.Encoding]::UTF8.GetBytes("crm-definitivo-blue-anon:$($script:ProjectRef)")
    $protected = $null
    $temporary = "$destination.$([Guid]::NewGuid().ToString('N')).tmp"
    try {
        $protected = [Security.Cryptography.ProtectedData]::Protect(
            $plain, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser
        )
        [IO.File]::WriteAllBytes($temporary, $protected)
        Move-Item -LiteralPath $temporary -Destination $destination -Force
    }
    finally {
        [Array]::Clear($plain, 0, $plain.Length)
        [Array]::Clear($entropy, 0, $entropy.Length)
        if ($null -ne $protected) { [Array]::Clear($protected, 0, $protected.Length) }
        $candidates.Clear()
        if (Test-Path -LiteralPath $temporary -PathType Leaf) { Remove-Item -LiteralPath $temporary -Force }
    }
    Write-CutoverLog 'Env blue capturado com DPAPI; nenhum valor foi exibido ou salvo em claro.'
}

function Restore-VercelBlueEnvironment {
    $destination = State-Path 'blue-anon.dpapi'
    if (-not (Test-Path -LiteralPath $destination -PathType Leaf)) { throw 'Captura DPAPI da ANON_KEY blue esta ausente.' }
    Add-Type -AssemblyName System.Security
    $cipher = [IO.File]::ReadAllBytes($destination)
    $entropy = [Text.Encoding]::UTF8.GetBytes("crm-definitivo-blue-anon:$($script:ProjectRef)")
    $plain = $null
    try {
        $plain = [Security.Cryptography.ProtectedData]::Unprotect(
            $cipher, $entropy, [Security.Cryptography.DataProtectionScope]::CurrentUser
        )
        $jwt = [Text.Encoding]::UTF8.GetString($plain)
        if (-not (Test-BlueAnonJwt $jwt)) { throw 'Captura DPAPI blue falhou na revalidacao de identidade.' }
        Set-VercelTextEnv 'VITE_SUPABASE_URL' $script:SourceOrigin
        Invoke-VercelWithBytes -Arguments @(
            'env', 'add', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'production', '--force', '--yes', '--type', 'config',
            '--project', $script:VercelProject, '--scope', $script:VercelScope, '--no-color'
        ) -InputBytes $plain
        Set-VercelTextEnv 'VITE_MAINTENANCE_MODE' 'false'
    }
    finally {
        [Array]::Clear($cipher, 0, $cipher.Length)
        [Array]::Clear($entropy, 0, $entropy.Length)
        if ($null -ne $plain) { [Array]::Clear($plain, 0, $plain.Length) }
    }
    Write-CutoverLog 'Trio de envs blue restaurado de forma protegida na Vercel.'
}

function New-VercelCandidate {
    param([bool]$Maintenance, [bool]$TargetApi)
    Assert-OrCaptureReleaseFingerprints
    $deployStartedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $output = @(Invoke-Vercel -Arguments @(
        'deploy', $script:RepoRoot, '--prod', '--skip-domain', '--force', '--yes', '--json',
        '--project', $script:VercelProject, '--scope', $script:VercelScope, '--no-color'
    ) -Capture -Quiet)
    $url = $null
    try { $url = Get-DeploymentUrl $output }
    catch { Write-CutoverLog 'Saida direta do deploy sem URL; consultando inventario Vercel pelo timestamp.' }
    if ($null -eq $url) {
        for ($attempt = 0; $attempt -lt 60 -and $null -eq $url; $attempt++) {
            $inventoryOutput = @(Invoke-Vercel -Arguments @(
                'ls', $script:VercelProject, '--scope', $script:VercelScope, '--json'
            ) -Capture -Quiet)
            $inventoryText = $inventoryOutput -join "`n"
            $inventoryMatch = [regex]::Match($inventoryText, '(?s)\{.*\}')
            if (-not $inventoryMatch.Success) { throw 'Inventario Vercel nao retornou JSON.' }
            $inventory = $inventoryMatch.Value | ConvertFrom-Json
            if ($inventory.contextName -ne $script:VercelScope) { throw 'Inventario Vercel pertence a outro escopo.' }
            $recent = @($inventory.deployments | Where-Object {
                $_.name -eq $script:VercelProject -and $_.target -eq 'production' -and
                [int64]$_.createdAt -ge ($deployStartedAt - 10000)
            } | Sort-Object { [int64]$_.createdAt } -Descending)
            if ($recent.Count -gt 0 -and $recent[0].state -eq 'ERROR') {
                throw 'Deploy candidato Vercel terminou em ERROR.'
            }
            if ($recent.Count -gt 0 -and $recent[0].state -eq 'READY') {
                $candidateHost = [string]$recent[0].url
                if ($candidateHost -notmatch '^crm-definitivo-[a-z0-9-]+\.vercel\.app$') {
                    throw 'Inventario Vercel retornou URL candidata inesperada.'
                }
                $url = "https://$candidateHost"
                break
            }
            Start-Sleep -Seconds 5
        }
    }
    if ($null -eq $url) { throw 'Deploy candidato Vercel nao ficou READY dentro do limite.' }
    Write-CutoverLog "Deploy candidato validando: $url"
    Assert-VercelBundle -Url $url -Maintenance $Maintenance -TargetApi $TargetApi
    return $url
}

function Promote-Vercel {
    param([string]$Url)
    if ($Url -notmatch '^https://crm-definitivo-[a-z0-9-]+\.vercel\.app$') { throw 'Deploy recusado para promocao.' }
    if ((Get-CurrentProductionDeployment) -eq $Url) {
        Write-CutoverLog 'Alias Vercel ja aponta para o deploy esperado; promocao idempotente.'
        return
    }
    Invoke-Vercel -Arguments @('promote', $Url, '--yes', '--timeout', '3m', '--scope', $script:VercelScope, '--no-color')
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try {
            if ((Get-CurrentProductionDeployment) -eq $Url) { return }
        }
        catch {
            if ($attempt -eq 19) { throw }
        }
        Start-Sleep -Seconds 3
    }
    throw 'Promocao Vercel nao convergiu.'
}

function Assert-LocalReadiness {
    $repo = (Resolve-Path -LiteralPath $script:RepoRoot).Path
    if ((Split-Path $repo -Leaf) -ne 'CRM---Definitivo') { throw 'Checkout errado; esperado CRM---Definitivo.' }
    $gitRoot = (@(Invoke-Native -Command 'git.exe' -Arguments @(
        '-C', $repo, 'rev-parse', '--show-toplevel'
    ) -Capture -Quiet) -join '').Trim().Replace('/', '\')
    if ([IO.Path]::GetFullPath($gitRoot).TrimEnd('\') -ne $repo.TrimEnd('\')) { throw 'Raiz Git inesperada.' }
    $projectFile = Join-Path $repo '.vercel\project.json'
    if (-not (Test-Path -LiteralPath $projectFile -PathType Leaf)) { throw 'Projeto Vercel nao esta linkado.' }
    $project = [IO.File]::ReadAllText($projectFile) | ConvertFrom-Json
    if ($project.projectName -ne $script:VercelProject -or
        $project.projectId -ne $script:VercelProjectId -or
        $project.orgId -ne $script:VercelOrgId) { throw 'Link Vercel divergiu do projeto fixado.' }
    if (-not (Test-Path -LiteralPath $script:SshKey -PathType Leaf)) { throw 'Chave SSH da VPS esta ausente.' }

    $required = @(
        'infra\hostinger-supabase\versions.conf',
        'infra\hostinger-supabase\scripts\03-export-source.sh',
        'infra\hostinger-supabase\scripts\04-restore-target.sh',
        'infra\hostinger-supabase\scripts\11-freeze-source.sh',
        'infra\hostinger-supabase\scripts\14-reset-rehearsal-target.sh',
        'infra\hostinger-supabase\scripts\15-cutover-evolution-webhooks.sh',
        'infra\hostinger-supabase\scripts\16-cutover-meta-webhook.sh',
        'infra\hostinger-supabase\scripts\17-rewrap-meta-tokens.sh',
        'infra\hostinger-supabase\scripts\copy-storage.mjs',
        'infra\hostinger-supabase\scripts\rewrap-meta-token-artifacts.py',
        'infra\hostinger-supabase\managed-meta-rewrap\supabase\config.toml',
        'infra\hostinger-supabase\managed-meta-rewrap\Remove-ManagedMetaRewrap.ps1',
        'infra\hostinger-supabase\sql\target-validation.sql',
        'src\components\MigrationMaintenance.tsx'
    )
    foreach ($file in $required) {
        if (-not (Test-Path -LiteralPath (Join-Path $repo $file) -PathType Leaf)) { throw "Arquivo ausente: $file" }
    }
    $count = @(Get-ChildItem -LiteralPath (Join-Path $repo 'supabase\functions') -Directory |
        Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'index.ts') -PathType Leaf }).Count
    if ($count -ne $script:FunctionCount) { throw "Functions locais: $count; esperado: $($script:FunctionCount)." }
    $localFunctionNames = @(Get-ChildItem -LiteralPath (Join-Path $repo 'supabase\functions') -Directory |
        Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'index.ts') -PathType Leaf } |
        Select-Object -ExpandProperty Name | Sort-Object -Unique)
    $managedFunctions = @(Get-ManagedMetaFunctions)
    $managedProduction = @($managedFunctions |
        Where-Object { $_.slug -ne 'meta-token-rewrap' } |
        Sort-Object -Property slug)
    if ($managedProduction.Count -ne $script:FunctionCount) {
        throw "Functions managed de producao: $($managedProduction.Count); esperado: $($script:FunctionCount)."
    }
    if (@($managedProduction | Where-Object { $_.status -ne 'ACTIVE' }).Count -ne 0) {
        throw 'Existe Function managed de producao fora do estado ACTIVE.'
    }
    $managedFunctionNames = @($managedProduction | ForEach-Object { [string]$_.slug } | Sort-Object -Unique)
    $functionDrift = @(Compare-Object -ReferenceObject $localFunctionNames -DifferenceObject $managedFunctionNames)
    if ($functionDrift.Count -ne 0) {
        throw 'Os slugs das Functions managed divergiram da release local; recapture o inventario antes do corte.'
    }
    $managedFunctions = $null
    $managedProduction = $null
    $managedFunctionNames = $null
    $localFunctionNames = $null
    $links = @(Get-ChildItem -LiteralPath (Join-Path $repo 'infra\hostinger-supabase'), (Join-Path $repo 'supabase\functions') -Recurse -Force |
        Where-Object { ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 })
    if ($links.Count -gt 0) { throw 'Release contem symlink/reparse point.' }
    $version = @(Invoke-Vercel -Arguments @('--version') -Capture) -join "`n"
    if ($version -notmatch [regex]::Escape($script:VercelVersion)) { throw 'Versao da CLI Vercel divergiu.' }
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $nodeVersion = (@(Invoke-Native -Command $node -Arguments @('--version') -Capture -Quiet) -join '').Trim()
    if ($nodeVersion -notmatch '^v([0-9]+)\.' -or [int]$Matches[1] -lt 20) {
        throw "Node.js >= 20 e obrigatorio para copiar o Storage; encontrado: $nodeVersion"
    }
    Invoke-Native -Command $node -Arguments @(
        (Join-Path $repo 'infra\hostinger-supabase\scripts\copy-storage.mjs'), '--help'
    ) -Quiet
    Write-CutoverLog 'Compilando frontend para validar a release.'
    Invoke-Native -Command (Get-Command npm.cmd -ErrorAction Stop).Source -Arguments @('run', 'build')
}

function Get-FileSetFingerprint {
    param([string[]]$Directories = @(), [string[]]$Files = @())
    $paths = New-Object 'System.Collections.Generic.List[string]'
    foreach ($directory in $Directories) {
        $absolute = Join-Path $script:RepoRoot $directory
        foreach ($file in @(Get-ChildItem -LiteralPath $absolute -Recurse -Force -File)) {
            if ($file.FullName -match '[\\/](?:\.temp|__pycache__)[\\/]') { continue }
            if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "Fingerprint recusou reparse point: $($file.FullName)"
            }
            [void]$paths.Add($file.FullName)
        }
    }
    foreach ($file in $Files) {
        $absolute = Join-Path $script:RepoRoot $file
        if (Test-Path -LiteralPath $absolute -PathType Leaf) { [void]$paths.Add([IO.Path]::GetFullPath($absolute)) }
    }
    $entries = New-Object Text.StringBuilder
    foreach ($path in @($paths | Sort-Object -Unique)) {
        $relative = $path.Substring($script:RepoRoot.TrimEnd('\').Length).TrimStart('\').Replace('\', '/')
        $hash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        [void]$entries.Append($relative); [void]$entries.Append("`0"); [void]$entries.Append($hash); [void]$entries.Append("`n")
    }
    $bytes = [Text.Encoding]::UTF8.GetBytes($entries.ToString())
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() }
    finally { [Array]::Clear($bytes, 0, $bytes.Length); $sha.Dispose() }
}

function Assert-OrCaptureReleaseFingerprints {
    $fingerprints = [ordered]@{
        release_kit_sha256 = Get-FileSetFingerprint -Directories @('infra\hostinger-supabase')
        release_functions_sha256 = Get-FileSetFingerprint -Directories @('supabase\functions')
        release_frontend_sha256 = Get-FileSetFingerprint -Directories @('src', 'public') -Files @(
            'index.html', 'package.json', 'package-lock.json', 'vite.config.ts',
            'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json',
            'tailwind.config.ts', 'postcss.config.js', 'components.json', '.vercelignore', 'vercel.json'
        )
    }
    foreach ($name in $fingerprints.Keys) {
        $expected = Get-Artifact $name
        $actual = [string]$fingerprints[$name]
        if ($actual -notmatch '^[0-9a-f]{64}$') { throw "Fingerprint local invalido: $name." }
        if ($null -eq $expected) { Set-Artifact $name $actual; continue }
        if ($expected -notmatch '^[0-9a-f]{64}$' -or $expected -ne $actual) {
            throw "Release local mudou durante o run: $name. Corrija ou inicie novo run somente antes da manutencao."
        }
    }
    Write-CutoverLog 'Fingerprints imutaveis do kit, Functions e frontend conferidos.'
}

function Assert-DnsAndHttps {
    param([switch]$AllowBackendUnavailable)
    # Query two independent public resolvers so an old negative cache on the
    # operator workstation cannot block a freshly-created authoritative record.
    foreach ($resolver in @('1.1.1.1', '8.8.8.8')) {
        $records = @(Resolve-DnsName -Name $script:ApiHost -Server $resolver -Type A -DnsOnly -ErrorAction Stop |
            Where-Object { $_.Type -eq 'A' } | Select-Object -ExpandProperty IPAddress -Unique)
        if ($records.Count -ne 1 -or $records[0] -ne $script:Vps) {
            throw "DNS A via $resolver precisa apontar exclusivamente para $($script:Vps)."
        }
        $aaaa = @()
        try {
            $aaaa = @(Resolve-DnsName -Name $script:ApiHost -Server $resolver -Type AAAA -DnsOnly -ErrorAction Stop |
                Where-Object { $_.Type -eq 'AAAA' })
        }
        catch { $aaaa = @() }
        if ($aaaa.Count -gt 0) { throw "DNS AAAA inesperado no backend via $resolver." }
    }
    try {
        # The public gateway intentionally requires an apikey and therefore
        # returns 401 to an anonymous health request. Here that response proves
        # DNS routing, SNI, the trusted certificate and the Envoy route. The
        # authenticated Auth health is checked from the VPS below without
        # moving the ANON_KEY off the protected host.
        $healthProbe = @(Invoke-Native -Command (Get-Command curl.exe -ErrorAction Stop).Source -Arguments @(
            '--silent', '--show-error', '--connect-timeout', '10', '--max-time', '30',
            '--resolve', "$($script:ApiHost):443:$($script:Vps)",
            '--output', 'NUL', '--write-out', '%{http_code}|%{ssl_verify_result}',
            "$($script:ApiOrigin)/auth/v1/health"
        ) -Capture -Quiet)
        $healthResult = ($healthProbe -join '').Trim()
        if ($healthResult -notmatch '^(?:200|401)\|0$') {
            throw 'TLS/gateway publico da VPS nao retornou o estado esperado.'
        }
    }
    catch {
        if (-not $AllowBackendUnavailable) { throw }
        Write-CutoverLog 'Backend temporariamente indisponivel durante retomada; checkpoints remotos decidirao a proxima etapa.'
    }
    $frontend = Invoke-WebRequest -UseBasicParsing -Uri "$($script:FrontendOrigin)/" -TimeoutSec 30
    if ($frontend.StatusCode -ne 200) { throw 'Frontend atual nao responde HTTP 200.' }
}

function Assert-RemoteReadiness {
    param(
        [switch]$ResumeMode,
        [switch]$SkipMetaProviderCheck,
        [switch]$SkipFreezeProviderCheck,
        [switch]$SkipMetaRewrapSecretCheck
    )
    $resumeFlag = if ($ResumeMode) { 'true' } else { 'false' }
    $expectedRun = if ($ResumeMode) { $script:ActiveRunId } else { '' }
    $skipMeta = if ($SkipMetaProviderCheck) { 'true' } else { 'false' }
    $skipFreeze = if ($SkipFreezeProviderCheck) { 'true' } else { 'false' }
    $skipRewrapSecret = if ($SkipMetaRewrapSecretCheck) { 'true' } else { 'false' }
    $remote = @"
set -Eeuo pipefail
set +x
umask 077
kit='$($script:RemoteKit)'
install_dir='$($script:RemoteInstall)'
migration=/etc/crm-supabase/migration.env
functions_env="`$install_dir/functions.env"
stack_env="`$install_dir/.env"
backup_env=/etc/crm-supabase/backup.env
backup_approval=/etc/crm-supabase/managed-source-cold-approved
rewrap_secret=/run/crm-meta-rewrap.env
resume_mode='$resumeFlag'
expected_run='$expectedRun'
skip_meta_provider_check='$skipMeta'
skip_freeze_provider_check='$skipFreeze'
skip_rewrap_secret_check='$skipRewrapSecret'
for file in "`$migration" "`$functions_env" "`$stack_env" "`$backup_env"; do
  [[ -f "`$file" && ! -L "`$file" ]]
  mode="`$(stat -c '%a' "`$file")"; (( (8#`$mode & 8#077) == 0 ))
done
if [[ "`$skip_rewrap_secret_check" != 'true' ]]; then
  [[ -f "`$rewrap_secret" && ! -L "`$rewrap_secret" ]]
  [[ "`$(stat -c '%u' "`$rewrap_secret")" == '0' ]] && (( (8#`$(stat -c '%a' "`$rewrap_secret") & 8#077) == 0 ))
  awk -F= '
    `$1 == "META_REWRAP_ONE_TIME_SECRET" {value=substr(`$0,index(`$0,"=")+1); found++}
    END {exit !(found == 1 && value ~ /^[0-9a-fA-F]+`$/ && length(value) >= 64 && length(value) <= 128)}
  ' "`$rewrap_secret"
  awk -F= '
    `$1 == "CRM_META_REWRAP_PROJECT_REF" {project=substr(`$0,index(`$0,"=")+1); project_count++}
    `$1 == "CRM_META_REWRAP_META_DIGEST" {meta=substr(`$0,index(`$0,"=")+1); meta_count++}
    `$1 == "CRM_META_REWRAP_BEARER_DIGEST" {bearer=substr(`$0,index(`$0,"=")+1); bearer_count++}
    END {
      exit !(project_count == 1 &&
        project == "uxttihjsxfowursjyult" &&
        meta_count == 1 && meta ~ /^[0-9a-f]{64}`$/ &&
        bearer_count == 1 && bearer ~ /^[0-9a-f]{64}`$/)
    }
  ' "`$rewrap_secret"
fi
get_value() { awk -F= -v wanted="`$2" '`$1 == wanted {print substr(`$0,index(`$0,"=")+1); exit}' "`$1"; }
[[ "`$(get_value "`$migration" SOURCE_PROJECT_REF)" == '$($script:ProjectRef)' ]]
[[ "`$(get_value "`$migration" NEW_SUPABASE_PUBLIC_URL)" == '$($script:ApiOrigin)' ]]
[[ "`$(get_value "`$migration" OLD_SUPABASE_PUBLIC_URL)" == '$($script:SourceOrigin)' ]]
[[ "`$(get_value "`$stack_env" SUPABASE_PUBLIC_URL)" == '$($script:ApiOrigin)' ]]
missing=0
require_key() {
  local file="`$1" key="`$2" minimum="`$3"
  if ! awk -F= -v wanted="`$key" -v minimum="`$minimum" '
    `$1 == wanted {value=substr(`$0,index(`$0,"=")+1); found++}
    END {exit !(found == 1 && length(value) >= minimum && value !~ /[[:space:]]/ && value !~ /^REPLACE/)}
  ' "`$file"; then printf 'MISSING_OR_INVALID_KEY:%s\n' "`$key" >&2; missing=1; fi
}
require_exact() {
  local file="`$1" key="`$2" expected="`$3"
  [[ "`$(get_value "`$file" "`$key")" == "`$expected" ]] || { printf 'MISSING_OR_INVALID_KEY:%s\n' "`$key" >&2; missing=1; }
}
require_hex_64() {
  local file="`$1" key="`$2"
  if ! awk -F= -v wanted="`$key" '
    `$1 == wanted {value=substr(`$0,index(`$0,"=")+1); found++}
    END {exit !(found == 1 && value ~ /^[0-9a-fA-F]{64}`$/)}
  ' "`$file"; then printf 'MISSING_OR_INVALID_KEY:%s\n' "`$key" >&2; missing=1; fi
}
require_legacy_fallback() {
  local file="`$1" key='GOOGLE_CALENDAR_ENCRYPTION_KEY'
  if ! awk -F= -v wanted="`$key" '
    `$1 == wanted {value=substr(`$0,index(`$0,"=")+1); found++}
    END {exit !(found == 1 && length(value) >= 16 && length(value) <= 256 && value !~ /[[:space:]]/)}
  ' "`$file"; then printf 'MISSING_OR_INVALID_KEY:%s\n' "`$key" >&2; missing=1; fi
}
require_key "`$migration" SOURCE_DB_URL 30
require_exact "`$backup_env" BACKUP_MODE '$($script:BackupMode)'
require_exact "`$backup_env" COLD_BACKUP_PROJECT_REF '$($script:ProjectRef)'
require_exact "`$backup_env" COLD_BACKUP_APPROVAL_FILE '/etc/crm-supabase/managed-source-cold-approved'
require_exact "`$migration" SOURCE_SUPABASE_URL '$($script:SourceOrigin)'
require_key "`$migration" SOURCE_SERVICE_ROLE_KEY 20
require_exact "`$migration" TARGET_SUPABASE_URL '$($script:ApiOrigin)'
require_key "`$migration" TARGET_SERVICE_ROLE_KEY 20
require_exact "`$migration" STORAGE_BUCKETS 'activity-attachments,avatars,team-avatars'
source_storage_key="`$(get_value "`$migration" SOURCE_SERVICE_ROLE_KEY)"
target_storage_key="`$(get_value "`$migration" TARGET_SERVICE_ROLE_KEY)"
stack_service_key="`$(get_value "`$stack_env" SERVICE_ROLE_KEY)"
[[ "`$source_storage_key" != "`$target_storage_key" ]] || { printf 'SOURCE_AND_TARGET_STORAGE_KEYS_MUST_DIFFER\n' >&2; missing=1; }
[[ "`$target_storage_key" == "`$stack_service_key" ]] || { printf 'TARGET_STORAGE_KEY_MISMATCH\n' >&2; missing=1; }
unset source_storage_key target_storage_key stack_service_key
for key in ADMIN_JWT_SECRET CRON_SECRET OAUTH_STATE_SECRET META_TOKEN_ENCRYPTION_KEY; do require_key "`$functions_env" "`$key" 32; done
require_hex_64 "`$functions_env" META_TOKEN_ENCRYPTION_KEY
legacy_fallback_count="`$(grep -c '^GOOGLE_CALENDAR_ENCRYPTION_KEY=' "`$functions_env" || true)"
if [[ "`$skip_rewrap_secret_check" != 'true' ]]; then
  require_legacy_fallback "`$functions_env"
elif [[ "`$legacy_fallback_count" == '1' ]]; then
  # Resume immediately after the DB transaction and before the dedicated
  # removal checkpoint is valid; the checkpoint will remove it atomically.
  require_legacy_fallback "`$functions_env"
elif [[ "`$legacy_fallback_count" != '0' ]]; then
  printf 'MISSING_OR_INVALID_KEY:GOOGLE_CALENDAR_ENCRYPTION_KEY\n' >&2
  missing=1
fi
unset legacy_fallback_count
require_key "`$functions_env" EVOLUTION_API_URL 10
require_key "`$functions_env" EVOLUTION_API_KEY 16
require_key "`$functions_env" EVOLUTION_WEBHOOK_SECRET 16
require_key "`$functions_env" FACEBOOK_APP_ID 5
require_key "`$functions_env" FACEBOOK_APP_SECRET 16
require_key "`$functions_env" FACEBOOK_WEBHOOK_VERIFY_TOKEN 64
app_id="`$(get_value "`$functions_env" FACEBOOK_APP_ID)"
[[ "`$app_id" =~ ^[0-9]{5,32}`$ ]] || { printf 'MISSING_OR_INVALID_KEY:FACEBOOK_APP_ID\n' >&2; missing=1; }
verify_token="`$(get_value "`$functions_env" FACEBOOK_WEBHOOK_VERIFY_TOKEN)"
[[ "`$verify_token" =~ ^[0-9a-f]{64}`$ ]] || { printf 'MISSING_OR_INVALID_KEY:FACEBOOK_WEBHOOK_VERIFY_TOKEN\n' >&2; missing=1; }
unset verify_token
require_exact "`$functions_env" SITE_URL '$($script:FrontendOrigin)'
require_key "`$stack_env" ANON_KEY 20
require_key "`$stack_env" SERVICE_ROLE_KEY 20
disabled=",`$(get_value "`$functions_env" EDGE_DISABLED_FUNCTIONS),"
  for fn in create-calendar-event delete-calendar-event list-calendar-events update-calendar-event google-calendar-oauth-initiate google-calendar-oauth-callback google-sheets-oauth-initiate google-sheets-oauth-callback sync-google-sheets sync-google-sheets-meta create-checkout update-subscription mercadopago-webhook admin-generate-temp-password admin-reset-password; do
  [[ "`$disabled" == *",`$fn,"* ]] || { printf 'FUNCTION_MUST_REMAIN_DISABLED:%s\n' "`$fn" >&2; missing=1; }
done
(( missing == 0 ))
[[ -f "`$backup_approval" && ! -L "`$backup_approval" ]]
[[ "`$(stat -c '%u:%a' "`$backup_approval")" == '0:600' ]]
for approval_key in status mode project_ref approved_at_utc; do
  [[ "`$(grep -c "^`${approval_key}=" "`$backup_approval" || true)" == '1' ]]
done
[[ "`$(get_value "`$backup_approval" status)" == 'approved' ]]
[[ "`$(get_value "`$backup_approval" mode)" == '$($script:BackupMode)' ]]
[[ "`$(get_value "`$backup_approval" project_ref)" == '$($script:ProjectRef)' ]]
approval_at="`$(get_value "`$backup_approval" approved_at_utc)"
[[ "`$approval_at" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z`$ ]]
unset approval_at
for timer in crm-supabase-backup.timer crm-supabase-maintenance.timer; do
  ! systemctl is-enabled --quiet "`$timer"
  ! systemctl is-active --quiet "`$timer"
done
if [[ "`$resume_mode" != 'true' ]]; then
  anon_key="`$(get_value "`$stack_env" ANON_KEY)"
  [[ `${#anon_key} -ge 20 && ! "`$anon_key" =~ [[:space:]\"\\] ]]
  auth_health="`$(
    printf 'header = "apikey: %s"\n' "`$anon_key" |
      curl --silent --show-error --config - \
        --resolve '$($script:ApiHost):443:127.0.0.1' \
        --connect-timeout 5 --max-time 20 --output /dev/null \
        --write-out '%{http_code}' '$($script:ApiOrigin)/auth/v1/health'
  )"
  unset anon_key
  [[ "`$auth_health" =~ ^2[0-9][0-9]`$ ]] || {
    printf 'AUTHENTICATED_PUBLIC_HEALTH_FAILED:%s\n' "`$auth_health" >&2
    exit 1
  }
  unset auth_health
fi
[[ "`$(find "`$kit/app-functions" -mindepth 2 -maxdepth 2 -type f -name index.ts | wc -l)" == '$($script:FunctionCount)' ]]
for file in "`$kit"/scripts/*.sh; do bash -n "`$file"; done
[[ -x "`$kit/scripts/16-cutover-meta-webhook.sh" ]]
if [[ "`$resume_mode" == 'true' ]]; then
  run_dir='$($script:RemoteBackup)/orchestrator/'"`$expected_run"
  if [[ -e "`$run_dir" ]]; then
    [[ -f "`$run_dir/RUN_ID" && "`$(tr -d '[:space:]' <"`$run_dir/RUN_ID")" == "`$expected_run" ]]
  else
    [[ -f "`$install_dir/.crm-last-restore" && -f "`$install_dir/.crm-chat-media-discarded" ]]
    [[ ! -e "`$install_dir/.crm-production-cutover-complete" && ! -e "`$install_dir/.crm-chat-media-retention-enabled" ]]
  fi
else
  [[ -f "`$install_dir/.crm-last-restore" && -f "`$install_dir/.crm-chat-media-discarded" ]]
  [[ ! -e "`$install_dir/.crm-production-cutover-complete" && ! -e "`$install_dir/.crm-chat-media-retention-enabled" ]]
fi
available="`$(df -Pk "`$install_dir" | awk 'NR == 2 {print `$4}')"
[[ "`$available" =~ ^[0-9]+`$ && "`$available" -ge 20971520 ]]
if [[ "`$skip_freeze_provider_check" != 'true' ]]; then
  '$($script:RemoteKit)/scripts/11-freeze-source.sh' --preflight
fi
if [[ "`$skip_meta_provider_check" != 'true' ]]; then
  '$($script:RemoteKit)/scripts/16-cutover-meta-webhook.sh' preflight
fi
printf 'REMOTE_PREFLIGHT_OK\n'
"@
    Invoke-Remote $remote
}

function Invoke-FullPreflight {
    param([switch]$ResumeMode)
    $skipMeta = $false
    $skipFreeze = $false
    if ($ResumeMode -and (Test-Path -LiteralPath (State-Path 'preflight.done') -PathType Leaf)) { $skipMeta = $true }
    if ($ResumeMode -and (Test-Stage 'source_frozen')) { $skipFreeze = $true }
    Write-CutoverLog 'Preflight local/build.'; Assert-LocalReadiness
    Write-CutoverLog 'Preflight oraculo Meta managed.'; Assert-ManagedMetaOracleReadiness
    Write-CutoverLog 'Preflight Vercel.'; [void](Get-CurrentProductionDeployment)
    Write-CutoverLog 'Preflight DNS/TLS.'; Assert-DnsAndHttps -AllowBackendUnavailable:$ResumeMode
    Write-CutoverLog 'Preflight VPS/secrets/freeze/rollback/Meta.'
    Assert-RemoteReadiness -ResumeMode:$ResumeMode -SkipMetaProviderCheck:$skipMeta -SkipFreezeProviderCheck:$skipFreeze
    Write-CutoverLog 'PREFLIGHT PASS: nenhum provedor ou dado remoto foi alterado.'
}

function Sync-Release {
    param([string]$CurrentRunId)
    $temporary = Join-Path ([IO.Path]::GetTempPath()) "crm-cutover-$CurrentRunId"
    if (Test-Path -LiteralPath $temporary) { throw 'Diretorio temporario do release ja existe.' }
    [void](New-Item -ItemType Directory $temporary)
    $kitTar = Join-Path $temporary 'kit.tar'
    $functionsTar = Join-Path $temporary 'functions.tar'
    try {
        Invoke-Native 'tar.exe' @(
            '-C', (Join-Path $script:RepoRoot 'infra\hostinger-supabase'),
            '--exclude=./managed-meta-rewrap/supabase/.temp', '-cf', $kitTar, '.'
        )
        Invoke-Native 'tar.exe' @('-C', (Join-Path $script:RepoRoot 'supabase\functions'), '-cf', $functionsTar, '.')
        $kitHash = (Get-FileHash $kitTar -Algorithm SHA256).Hash.ToLowerInvariant()
        $functionsHash = (Get-FileHash $functionsTar -Algorithm SHA256).Hash.ToLowerInvariant()
        $remoteKitTar = "/run/crm-kit-$CurrentRunId.tar"
        $remoteFunctionsTar = "/run/crm-functions-$CurrentRunId.tar"
        $scp = @(Get-ScpArguments)
        Invoke-Native 'scp.exe' ($scp + @($kitTar, "$($script:SshTarget):$remoteKitTar"))
        Invoke-Native 'scp.exe' ($scp + @($functionsTar, "$($script:SshTarget):$remoteFunctionsTar"))
        Invoke-Remote @"
set -Eeuo pipefail
set +x
umask 077
run_id='$CurrentRunId'
fixed='$($script:RemoteKit)'
staging="/opt/crm-migration-kit.staging-`$run_id"
previous="/opt/crm-migration-kit.previous-`$run_id"
kit_tar='$remoteKitTar'
functions_tar='$remoteFunctionsTar'
exec 8>/run/lock/crm-release-sync.lock
flock -n 8
if [[ -f "`$fixed/.crm-release-id" && "`$(tr -d '[:space:]' <"`$fixed/.crm-release-id")" == "`$run_id" ]]; then
  [[ "`$(find "`$fixed/app-functions" -mindepth 2 -maxdepth 2 -type f -name index.ts | wc -l)" == '$($script:FunctionCount)' ]]
  rm -f -- "`$kit_tar" "`$functions_tar"
  exit 0
fi
if [[ ! -e "`$fixed" && -d "`$previous" && ! -L "`$previous" ]]; then
  mv -- "`$previous" "`$fixed"
fi
if [[ -e "`$staging" || -L "`$staging" ]]; then
  [[ -d "`$staging" && ! -L "`$staging" ]]
  interrupted="`$staging.interrupted-`$(date -u +'%Y%m%dT%H%M%SZ')"
  [[ ! -e "`$interrupted" ]]; mv -- "`$staging" "`$interrupted"
fi
[[ ! -e "`$staging" && ! -e "`$previous" ]]
[[ "`$(sha256sum "`$kit_tar" | awk '{print `$1}')" == '$kitHash' ]]
[[ "`$(sha256sum "`$functions_tar" | awk '{print `$1}')" == '$functionsHash' ]]
install -d -m 0750 "`$staging" "`$staging/app-functions"
tar --no-same-owner --no-same-permissions -xf "`$kit_tar" -C "`$staging"
tar --no-same-owner --no-same-permissions -xf "`$functions_tar" -C "`$staging/app-functions"
if find "`$staging" -type l -print -quit | grep -q .; then exit 42; fi
chmod 0750 "`$staging"/scripts/*.sh
[[ "`$(find "`$staging/app-functions" -mindepth 2 -maxdepth 2 -type f -name index.ts | wc -l)" == '$($script:FunctionCount)' ]]
for file in "`$staging"/scripts/*.sh; do bash -n "`$file"; done
printf '%s\n' "`$run_id" >"`$staging/.crm-release-id"; chmod 0600 "`$staging/.crm-release-id"
rollback_release_switch() {
  status=`$?
  trap - EXIT
  if (( status != 0 )) && [[ ! -e "`$fixed" && -d "`$previous" && ! -L "`$previous" ]]; then
    mv -- "`$previous" "`$fixed" || true
  fi
  exit "`$status"
}
trap rollback_release_switch EXIT
if [[ -e "`$fixed" ]]; then mv -- "`$fixed" "`$previous"; fi
if ! mv -- "`$staging" "`$fixed"; then
  [[ ! -e "`$fixed" && -e "`$previous" ]] && mv -- "`$previous" "`$fixed"
  exit 1
fi
trap - EXIT
rm -f -- "`$kit_tar" "`$functions_tar"
printf 'RELEASE_SYNCED\n'
"@
    }
    finally {
        foreach ($file in @($kitTar, $functionsTar)) {
            if (Test-Path -LiteralPath $file -PathType Leaf) { Remove-Item -LiteralPath $file -Force }
        }
        if (Test-Path -LiteralPath $temporary -PathType Container) { Remove-Item -LiteralPath $temporary -Force }
    }
}

function Initialize-RemoteRun {
    $remoteRun = "$($script:RemoteBackup)/orchestrator/$($script:ActiveRunId)"
    Invoke-Remote -Quiet @"
set -Eeuo pipefail
umask 077
root='$($script:RemoteBackup)/orchestrator'
run_dir='$remoteRun'
active="`$root/ACTIVE_RUN"
production='$($script:RemoteInstall)/.crm-production-cutover-complete'
install -d -m 0700 "`$root"
[[ ! -e "`$run_dir/ROLLED_BACK" && ! -L "`$run_dir/ROLLED_BACK" ]]
exec 8>"`$root/.lease.lock"
flock -n 8
if [[ -e "`$active" || -L "`$active" ]]; then
  [[ -f "`$active" && ! -L "`$active" ]]
  [[ "`$(stat -c '%u' "`$active")" == '0' ]] && (( (8#`$(stat -c '%a' "`$active") & 8#077) == 0 ))
  [[ "`$(tr -d '[:space:]' <"`$active")" == '$($script:ActiveRunId)' ]] \
    || { printf 'outro cutover possui o lease remoto\n' >&2; exit 42; }
else
  if [[ -e "`$production" || -L "`$production" ]]; then
    [[ -f "`$production" && ! -L "`$production" ]]
    [[ "`$(stat -c '%u' "`$production")" == '0' ]] && (( (8#`$(stat -c '%a' "`$production") & 8#077) == 0 ))
    grep -Fxq 'status=production' "`$production"
    grep -Fxq 'run_id=$($script:ActiveRunId)' "`$production"
    grep -Fxq 'backup_mode=$($script:BackupMode)' "`$production"
    grep -Fxq 'recurring_backup=disabled' "`$production"
  fi
  temp="`$(mktemp "`$active.XXXXXX")"
  printf '%s\n' '$($script:ActiveRunId)' >"`$temp"; chmod 0600 "`$temp"; mv -- "`$temp" "`$active"
fi
install -d -m 0700 "`$run_dir"
if [[ -e "`$run_dir/RUN_ID" || -L "`$run_dir/RUN_ID" ]]; then
  [[ -f "`$run_dir/RUN_ID" && ! -L "`$run_dir/RUN_ID" ]]
  [[ "`$(stat -c '%u' "`$run_dir/RUN_ID")" == '0' ]] && (( (8#`$(stat -c '%a' "`$run_dir/RUN_ID") & 8#077) == 0 ))
  [[ "`$(tr -d '[:space:]' <"`$run_dir/RUN_ID")" == '$($script:ActiveRunId)' ]]
else
  printf '%s\n' '$($script:ActiveRunId)' >"`$run_dir/RUN_ID"; chmod 0600 "`$run_dir/RUN_ID"
fi
"@
    Set-Artifact 'remote_run' $remoteRun
}

function Get-RemoteRun {
    $value = Get-Artifact 'remote_run'
    if ($null -eq $value -or $value -notmatch '^/var/backups/crm-supabase/orchestrator/[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$') {
        throw 'Diretorio remoto do run ausente/invalido.'
    }
    return $value
}

function Get-TaggedArtifact {
    param([object[]]$Output, [string]$Tag, [string]$Pattern)
    $prefix = "CRM_ARTIFACT_${Tag}="
    $values = @($Output | ForEach-Object { [string]$_ } | Where-Object { $_.StartsWith($prefix) } |
        ForEach-Object { $_.Substring($prefix.Length) })
    if ($values.Count -ne 1 -or $values[0] -notmatch $Pattern) { throw "Artefato $Tag ausente/invalido." }
    return $values[0]
}

function Deploy-Maintenance {
    $candidate = Get-Artifact 'maintenance_candidate'
    if ($null -ne $candidate -and (Get-CurrentProductionDeployment) -eq $candidate) {
        Assert-VercelBundle $candidate $true $false
        return
    }
    [IO.File]::WriteAllText((State-Path 'maintenance_env_mutation.started'), [DateTime]::UtcNow.ToString('o'))
    Set-VercelTextEnv 'VITE_MAINTENANCE_MODE' 'true'
    $candidate = New-VercelCandidate $true $false
    Set-Artifact 'maintenance_candidate' $candidate
    Promote-Vercel $candidate
}

function Freeze-Source {
    $remoteRun = Get-RemoteRun
    $output = @(Invoke-Remote -Capture @"
set -Eeuo pipefail
set +x
umask 077
root='$remoteRun/source-freeze'
pointer='$remoteRun/source-freeze.path'
install -d -m 0700 "`$root"
validate_frozen_state() {
  local state="`$1"
  [[ "`$state" == "`$root/"* && -d "`$state" && ! -L "`$state" ]]
  [[ -f "`$state/FROZEN" && ! -L "`$state/FROZEN" ]]
  [[ ! -e "`$state/RECOVERY_REQUIRED" && ! -L "`$state/RECOVERY_REQUIRED" ]]
  [[ ! -e "`$state/UNFROZEN" && ! -L "`$state/UNFROZEN" ]]
}
if [[ -e "`$pointer" || -L "`$pointer" ]]; then
  [[ -f "`$pointer" && ! -L "`$pointer" ]]
  [[ "`$(stat -c '%u' "`$pointer")" == '0' ]] && (( (8#`$(stat -c '%a' "`$pointer") & 8#077) == 0 ))
  state="`$(cat "`$pointer")"
  validate_frozen_state "`$state"
  printf 'CRM_ARTIFACT_SOURCE_FREEZE=%s\n' "`$state"; exit 0
fi
if find "`$root" -mindepth 2 -maxdepth 2 -name RECOVERY_REQUIRED -print -quit | grep -q .; then exit 42; fi
mapfile -t frozen < <(find "`$root" -mindepth 2 -maxdepth 2 -type f -name FROZEN -printf '%h\n')
if [[ "`${#frozen[@]}" -gt 0 ]]; then
  [[ "`${#frozen[@]}" -eq 1 ]]
  validate_frozen_state "`${frozen[0]}"
  printf '%s\n' "`${frozen[0]}" >"`$pointer"; chmod 0600 "`$pointer"
  printf 'CRM_ARTIFACT_SOURCE_FREEZE=%s\n' "`${frozen[0]}"; exit 0
fi
env CUTOVER_STATE_DIR="`$root" '$($script:RemoteKit)/scripts/11-freeze-source.sh' --confirm-freeze-source
mapfile -t frozen < <(find "`$root" -mindepth 2 -maxdepth 2 -type f -name FROZEN -printf '%h\n')
[[ "`${#frozen[@]}" -eq 1 ]]
validate_frozen_state "`${frozen[0]}"
printf '%s\n' "`${frozen[0]}" >"`$pointer"; chmod 0600 "`$pointer"
printf 'CRM_ARTIFACT_SOURCE_FREEZE=%s\n' "`${frozen[0]}"
"@)
    $path = Get-TaggedArtifact $output 'SOURCE_FREEZE' '^/var/backups/crm-supabase/orchestrator/[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}/source-freeze/[0-9]{8}T[0-9]{6}Z-source-freeze$'
    Set-Artifact 'source_freeze' $path
}

function Export-Final {
    $remoteRun = Get-RemoteRun
    $label = "final-$($script:ActiveRunId)"
    $output = @(Invoke-Remote -Capture @"
set -Eeuo pipefail
set +x
umask 077
root='$remoteRun/exports'
pointer='$remoteRun/final-export.path'
baseline='$remoteRun/final-baseline.env'
install -d -m 0700 "`$root"
find_valid_exports() {
  local candidate
  mapfile -t manifests < <(find "`$root" -mindepth 2 -maxdepth 2 -type f -name SHA256SUMS -printf '%h\n')
  valid=()
  for candidate in "`${manifests[@]}"; do
    if [[ -d "`$candidate" && ! -L "`$candidate" ]] \
       && (cd "`$candidate" && sha256sum --quiet -c SHA256SUMS); then
      valid+=("`$candidate")
    fi
  done
}
finalize_export() {
  local export_dir="`$1" auth_users
  [[ "`$export_dir" == "`$root/"* && -f "`$export_dir/data.sql" && ! -L "`$export_dir/data.sql" ]]
  auth_users="`$(awk '
    BEGIN {inside=0; blocks=0; count=0}
    inside == 0 && (`$0 ~ /^COPY[[:space:]]+auth\.users[[:space:]]/ || `$0 ~ /^COPY[[:space:]]+"auth"\."users"[[:space:]]/) {inside=1; blocks++; next}
    inside == 1 && `$0 == "\\." {inside=0; next}
    inside == 1 {count++}
    END {if (inside != 0 || blocks != 1) exit 42; print count}
  ' "`$export_dir/data.sql")"
  [[ "`$auth_users" =~ ^[0-9]+`$ ]]
  printf 'expected_auth_users=%s\n' "`$auth_users" >"`$baseline"; chmod 0600 "`$baseline"
  printf '%s\n' "`$export_dir" >"`$pointer"; chmod 0600 "`$pointer"
  printf 'CRM_ARTIFACT_FINAL_EXPORT=%s\n' "`$export_dir"
}
if [[ -e "`$pointer" || -L "`$pointer" ]]; then
  [[ -f "`$pointer" && ! -L "`$pointer" ]]
  [[ "`$(stat -c '%u' "`$pointer")" == '0' ]] && (( (8#`$(stat -c '%a' "`$pointer") & 8#077) == 0 ))
  export_dir="`$(cat "`$pointer")"
  [[ "`$export_dir" == "`$root/"* && -d "`$export_dir" && ! -L "`$export_dir" ]]
  (cd "`$export_dir" && sha256sum --quiet -c SHA256SUMS)
  finalize_export "`$export_dir"
  exit 0
fi
find_valid_exports
if [[ "`${#valid[@]}" -gt 0 ]]; then
  [[ "`${#valid[@]}" -eq 1 ]]
  finalize_export "`${valid[0]}"
  exit 0
fi
env MIGRATION_ARTIFACT_DIR="`$root" '$($script:RemoteKit)/scripts/03-export-source.sh' '$label'
find_valid_exports
[[ "`${#valid[@]}" -eq 1 ]]
finalize_export "`${valid[0]}"
"@)
    $path = Get-TaggedArtifact $output 'FINAL_EXPORT' '^/var/backups/crm-supabase/orchestrator/[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}/exports/[0-9]{8}T[0-9]{6}Z-final-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$'
    Set-Artifact 'final_export' $path
}

function Reset-Target {
    Invoke-Remote @"
set -Eeuo pipefail
if [[ -f '$($script:RemoteInstall)/.crm-clean-target-ready' && ! -f '$($script:RemoteInstall)/.crm-last-restore' ]]; then
  grep -Fxq 'status=clean-target-ready' '$($script:RemoteInstall)/.crm-clean-target-ready'; exit 0
fi
env CONFIRM_RESET_REHEARSAL_TARGET=YES_ARCHIVE_REHEARSAL_AND_INITIALIZE_CLEAN_TARGET \
  '$($script:RemoteKit)/scripts/14-reset-rehearsal-target.sh'
"@
}

function Restore-Target {
    $export = Get-Artifact 'final_export'
    if ($null -eq $export -or $export -notmatch '^/var/backups/crm-supabase/orchestrator/[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}/exports/[0-9]{8}T[0-9]{6}Z-final-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}$') { throw 'Export final ausente.' }
    Invoke-Remote @"
set -Eeuo pipefail
marker='$($script:RemoteInstall)/.crm-last-restore'
if [[ -e "`$marker" || -L "`$marker" ]]; then
  [[ -f "`$marker" && ! -L "`$marker" ]]
  grep -Fxq 'status=restored' "`$marker"
  [[ "`$(awk -F= '`$1 == "export_dir" {print substr(`$0,index(`$0,"=")+1); exit}' "`$marker")" == '$export' ]]
  exit 0
fi
'$($script:RemoteKit)/scripts/04-restore-target.sh' '$export'
"@
}

function Discard-ChatMedia {
    Invoke-Remote "set -Eeuo pipefail; env CONFIRM_DISCARD_CHAT_MEDIA=YES_DISCARD_ALL_HISTORICAL_CHAT_MEDIA_ON_TARGET '$($script:RemoteKit)/scripts/06-discard-chat-media-target.sh'"
}

function Start-Infrastructure {
    Invoke-Remote "set -Eeuo pipefail; '$($script:RemoteKit)/scripts/05-deploy-functions.sh' --start-infrastructure"
}

function Get-StorageApiHandoff {
    $output = @(Invoke-Remote -Capture -Quiet @'
set -Eeuo pipefail
set +x
umask 077
file=/etc/crm-supabase/migration.env
stack=/opt/crm-supabase/.env
[[ -f "$file" && ! -L "$file" && "$(stat -c '%u' "$file")" == '0' ]]
(( (8#$(stat -c '%a' "$file") & 8#077) == 0 ))
[[ -f "$stack" && ! -L "$stack" && "$(stat -c '%u' "$stack")" == '0' ]]
(( (8#$(stat -c '%a' "$stack") & 8#077) == 0 ))
get_unique() {
  local source="$1" key="$2" count value
  count="$(grep -c "^${key}=" "$source" || true)"
  [[ "$count" == '1' ]]
  value="$(awk -F= -v wanted="$key" '$1 == wanted {print substr($0,index($0,"=")+1); exit}' "$source")"
  [[ -n "$value" && "$value" != REPLACE* && ! "$value" =~ [[:space:]] ]]
  printf '%s' "$value"
}
source_url="$(get_unique "$file" SOURCE_SUPABASE_URL)"
source_key="$(get_unique "$file" SOURCE_SERVICE_ROLE_KEY)"
target_url="$(get_unique "$file" TARGET_SUPABASE_URL)"
target_key="$(get_unique "$file" TARGET_SERVICE_ROLE_KEY)"
stack_key="$(get_unique "$stack" SERVICE_ROLE_KEY)"
buckets="$(get_unique "$file" STORAGE_BUCKETS)"
[[ "$source_url" == 'https://uxttihjsxfowursjyult.supabase.co' ]]
[[ "$target_url" == 'https://api.kairozcrm.com.br' ]]
[[ "$buckets" == 'activity-attachments,avatars,team-avatars' ]]
[[ ${#source_key} -ge 20 && ${#target_key} -ge 20 ]]
[[ "$source_key" != "$target_key" && "$target_key" == "$stack_key" ]]
for name in SOURCE_SUPABASE_URL SOURCE_SERVICE_ROLE_KEY TARGET_SUPABASE_URL TARGET_SERVICE_ROLE_KEY; do
  case "$name" in
    SOURCE_SUPABASE_URL) value="$source_url" ;;
    SOURCE_SERVICE_ROLE_KEY) value="$source_key" ;;
    TARGET_SUPABASE_URL) value="$target_url" ;;
    TARGET_SERVICE_ROLE_KEY) value="$target_key" ;;
  esac
  printf 'STORAGE_HANDOFF:%s:' "$name"
  printf '%s' "$value" | base64 -w0
  printf '\n'
done
unset source_url source_key target_url target_key stack_key buckets value
'@)

    $expected = @(
        'SOURCE_SUPABASE_URL', 'SOURCE_SERVICE_ROLE_KEY',
        'TARGET_SUPABASE_URL', 'TARGET_SERVICE_ROLE_KEY'
    )
    $values = @{}
    foreach ($line in $output) {
        if ([string]$line -notmatch '^STORAGE_HANDOFF:([A-Z_]+):([A-Za-z0-9+/]+={0,2})$') {
            throw 'Handoff do Storage retornou uma linha inesperada.'
        }
        $name = $Matches[1]
        if ($name -notin $expected -or $values.ContainsKey($name)) {
            throw 'Handoff do Storage retornou chave inesperada ou duplicada.'
        }
        $bytes = [Convert]::FromBase64String($Matches[2])
        try { $values[$name] = [Text.Encoding]::UTF8.GetString($bytes) }
        finally { [Array]::Clear($bytes, 0, $bytes.Length) }
    }
    foreach ($name in $expected) {
        if (-not $values.ContainsKey($name)) { throw "Handoff do Storage incompleto: $name." }
    }
    if ($values.SOURCE_SUPABASE_URL -ne $script:SourceOrigin -or
        $values.TARGET_SUPABASE_URL -ne $script:ApiOrigin -or
        $values.SOURCE_SERVICE_ROLE_KEY.Length -lt 20 -or
        $values.TARGET_SERVICE_ROLE_KEY.Length -lt 20 -or
        $values.SOURCE_SERVICE_ROLE_KEY -eq $values.TARGET_SERVICE_ROLE_KEY) {
        throw 'Handoff do Storage falhou na validacao local.'
    }
    return [pscustomobject]@{
        SourceUrl = $values.SOURCE_SUPABASE_URL
        SourceServiceRoleKey = $values.SOURCE_SERVICE_ROLE_KEY
        TargetUrl = $values.TARGET_SUPABASE_URL
        TargetServiceRoleKey = $values.TARGET_SERVICE_ROLE_KEY
    }
}

function Copy-Storage {
    $handoff = Get-StorageApiHandoff
    $sensitive = @(
        $handoff.SourceUrl, $handoff.SourceServiceRoleKey,
        $handoff.TargetUrl, $handoff.TargetServiceRoleKey
    )
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName = (Get-Command node.exe -ErrorAction Stop).Source
    $info.Arguments = Join-WindowsArguments @(
        (Join-Path $script:RepoRoot 'infra\hostinger-supabase\scripts\copy-storage.mjs'), '--verify'
    )
    $info.WorkingDirectory = $script:RepoRoot
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.EnvironmentVariables['SOURCE_SUPABASE_URL'] = $handoff.SourceUrl
    $info.EnvironmentVariables['SOURCE_SERVICE_ROLE_KEY'] = $handoff.SourceServiceRoleKey
    $info.EnvironmentVariables['TARGET_SUPABASE_URL'] = $handoff.TargetUrl
    $info.EnvironmentVariables['TARGET_SERVICE_ROLE_KEY'] = $handoff.TargetServiceRoleKey
    $info.EnvironmentVariables['STORAGE_BUCKETS'] = 'activity-attachments,avatars,team-avatars'
    $info.EnvironmentVariables['STORAGE_CONCURRENCY'] = '3'
    $info.EnvironmentVariables['STORAGE_VERIFY'] = 'true'
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $info
    try {
        if (-not $process.Start()) { throw 'Nao foi possivel iniciar o copiador de Storage.' }
        foreach ($name in @(
            'SOURCE_SUPABASE_URL', 'SOURCE_SERVICE_ROLE_KEY',
            'TARGET_SUPABASE_URL', 'TARGET_SERVICE_ROLE_KEY'
        )) { [void]$info.EnvironmentVariables.Remove($name) }
        $handoff.SourceUrl = $null
        $handoff.SourceServiceRoleKey = $null
        $handoff.TargetUrl = $null
        $handoff.TargetServiceRoleKey = $null
        $handoff = $null

        $outTask = $process.StandardOutput.ReadToEndAsync()
        $errTask = $process.StandardError.ReadToEndAsync()
        $process.WaitForExit()
        $outTask.Wait(); $errTask.Wait()
        $lines = @()
        if ($outTask.Result) { $lines += ($outTask.Result -split "`r?`n" | Where-Object { $_ }) }
        if ($errTask.Result) { $lines += ($errTask.Result -split "`r?`n" | Where-Object { $_ }) }
        $safeLines = foreach ($line in $lines) {
            $safe = [string]$line
            foreach ($value in $sensitive) {
                if (-not [string]::IsNullOrEmpty($value)) { $safe = $safe.Replace($value, '[REDACTED]') }
            }
            $safe
        }
        Write-SafeOutput $safeLines
        Assert-ExitCode $process.ExitCode 'Copia/verificacao do Storage via API'
        $chatProof = @($lines | Where-Object {
            $_ -like 'Bucket chat-media: configuracao preservada, vazio no destino e excluido da copia*'
        })
        $totalProof = @($lines | Where-Object {
            $_ -match '^Total: 3 buckets, [0-9]+ objetos, .+ conhecidos, [0-9]+ copiados, 0 falhas\.$'
        })
        if ($chatProof.Count -ne 1 -or $totalProof.Count -ne 1) {
            throw 'Resumo conclusivo do Storage ficou ausente ou ambiguo.'
        }
        Write-CutoverLog 'Storage preservado foi copiado e verificado; chat-media permaneceu vazio.'
    }
    finally {
        $handoff = $null
        $sensitive = @()
        $process.Dispose()
    }
}

function Post-Restore {
    Invoke-Remote "set -Eeuo pipefail; '$($script:RemoteKit)/scripts/07-post-restore.sh'"
}

function Start-Functions {
    Assert-MetaRewrapPostFallback
    Invoke-Remote "set -Eeuo pipefail; '$($script:RemoteKit)/scripts/05-deploy-functions.sh' --start"
}

function Validate-ClosedTarget {
    $remoteRun = Get-RemoteRun
    Invoke-Remote @"
set -Eeuo pipefail
set +x
umask 077
baseline='$remoteRun/final-baseline.env'
expected="`$(awk -F= '`$1 == "expected_auth_users" {print `$2; exit}' "`$baseline")"
[[ "`$expected" =~ ^[0-9]+`$ ]]
actual="`$(docker exec supabase-db psql -XAtq -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM auth.users;')"
[[ "`$actual" == "`$expected" ]]
cat '$($script:RemoteKit)/sql/target-validation.sql' | docker exec -i \
  --env EXPECTED_AUTH_USERS="`$expected" supabase-db sh -ceu '
    export PGPASSWORD="`$POSTGRES_PASSWORD"
    exec psql -h 127.0.0.1 -X -U supabase_admin -d postgres \
      --set=ON_ERROR_STOP=1 \
      --set=old_public_url="$($script:SourceOrigin)" \
      --set=expected_auth_users="`$EXPECTED_AUTH_USERS" \
      --set=expected_cron_launch=off \
      --set=expected_active_cron_jobs=0
  ' >'$remoteRun/target-validation.log'
chmod 0600 '$remoteRun/target-validation.log'
'$($script:RemoteKit)/scripts/install-systemd.sh'
env EXPECTED_CRON_LAUNCH_STATE=off EXPECTED_ACTIVE_CRON_JOBS='' \
  '$($script:RemoteKit)/scripts/10-healthcheck.sh'
'$($script:RemoteKit)/scripts/08-smoke-test.sh'
printf 'TARGET_VALIDATION_PASS expected_auth_users=%s\n' "`$expected"
"@
}

function Get-MetaRewrapCounts {
    $counts = [ordered]@{}
    foreach ($name in @('meta_rewrap_nonempty', 'meta_rewrap_meta', 'meta_rewrap_fallback')) {
        $value = Get-Artifact $name
        if ($null -eq $value -or $value -notmatch '^[0-9]+$') { throw "Contagem rewrap ausente/invalida: $name." }
        $counts[$name] = [int64]$value
    }
    if ($counts.meta_rewrap_meta + $counts.meta_rewrap_fallback -ne $counts.meta_rewrap_nonempty) {
        throw 'Contagens rewrap Meta/fallback nao totalizam nonempty.'
    }
    return [pscustomobject]@{
        Nonempty = $counts.meta_rewrap_nonempty
        Meta = $counts.meta_rewrap_meta
        Fallback = $counts.meta_rewrap_fallback
    }
}

function Inventory-MetaRewrap {
    $remoteRun = Get-RemoteRun
    $output = @(Invoke-Remote -Capture @"
set -Eeuo pipefail
set +x
umask 077
counts='$remoteRun/meta-rewrap-counts.env'
restore='$($script:RemoteInstall)/.crm-last-restore'
restore_sha="`$(sha256sum "`$restore" | awk '{print `$1}')"
emit_counts() {
  local nonempty meta fallback invalid
  nonempty="`$(awk -F= '`$1 == "nonempty" {print `$2; exit}' "`$counts")"
  meta="`$(awk -F= '`$1 == "meta_readable" {print `$2; exit}' "`$counts")"
  fallback="`$(awk -F= '`$1 == "fallback_readable" {print `$2; exit}' "`$counts")"
  invalid="`$(awk -F= '`$1 == "invalid" {print `$2; exit}' "`$counts")"
  [[ "`$nonempty" =~ ^[0-9]+`$ && "`$meta" =~ ^[0-9]+`$ && "`$fallback" =~ ^[0-9]+`$ && "`$invalid" == '0' ]]
  (( meta + fallback == nonempty ))
  printf 'CRM_META_REWRAP_METRICS={"nonempty":%s,"meta_readable":%s,"fallback_readable":%s,"invalid":0}\n' \
    "`$nonempty" "`$meta" "`$fallback"
}
if [[ -e "`$counts" || -L "`$counts" ]]; then
  [[ -f "`$counts" && ! -L "`$counts" ]]
  [[ "`$(stat -c '%u' "`$counts")" == '0' ]] && (( (8#`$(stat -c '%a' "`$counts") & 8#077) == 0 ))
  grep -Fxq "restore_marker_sha256=`$restore_sha" "`$counts"
  emit_counts
  exit 0
fi
raw="`$('$($script:RemoteKit)/scripts/17-rewrap-meta-tokens.sh' --inventory)"
tag="`$(grep '^CRM_META_REWRAP_METRICS=' <<<"`$raw")"
[[ "`$(grep -c '^CRM_META_REWRAP_METRICS=' <<<"`$raw")" == '1' ]]
json="`${tag#CRM_META_REWRAP_METRICS=}"
nonempty="`$(jq -er '.nonempty | select(type == "number" and . >= 0 and floor == .)' <<<"`$json")"
meta="`$(jq -er '.meta_readable | select(type == "number" and . >= 0 and floor == .)' <<<"`$json")"
fallback="`$(jq -er '.fallback_readable | select(type == "number" and . >= 0 and floor == .)' <<<"`$json")"
invalid="`$(jq -er '.invalid | select(type == "number" and . >= 0 and floor == .)' <<<"`$json")"
[[ "`$invalid" == '0' ]]; (( meta + fallback == nonempty ))
temp="`$(mktemp "`$counts.XXXXXX")"
printf '%s\n' \
  "restore_marker_sha256=`$restore_sha" \
  "nonempty=`$nonempty" \
  "meta_readable=`$meta" \
  "fallback_readable=`$fallback" \
  'invalid=0' >"`$temp"
chmod 0600 "`$temp"; mv -- "`$temp" "`$counts"
emit_counts
"@)
    $tagged = @($output | ForEach-Object { [string]$_ } | Where-Object { $_.StartsWith('CRM_META_REWRAP_METRICS=') })
    if ($tagged.Count -ne 1) { throw 'Inventario Meta rewrap nao retornou uma metrica unica.' }
    try { $metrics = $tagged[0].Substring('CRM_META_REWRAP_METRICS='.Length) | ConvertFrom-Json }
    catch { throw 'Inventario Meta rewrap retornou JSON invalido.' }
    foreach ($property in @('nonempty', 'meta_readable', 'fallback_readable', 'invalid')) {
        $raw = $metrics.$property
        if ($null -eq $raw -or [string]$raw -notmatch '^[0-9]+$') { throw "Metrica rewrap invalida: $property." }
    }
    $nonempty = [int64]$metrics.nonempty
    $meta = [int64]$metrics.meta_readable
    $fallback = [int64]$metrics.fallback_readable
    if ([int64]$metrics.invalid -ne 0 -or $meta + $fallback -ne $nonempty) {
        throw 'Inventario rewrap contem ciphertext invalido ou totais divergentes.'
    }
    Set-Artifact 'meta_rewrap_nonempty' ([string]$nonempty)
    Set-Artifact 'meta_rewrap_meta' ([string]$meta)
    Set-Artifact 'meta_rewrap_fallback' ([string]$fallback)
    Write-CutoverLog "Inventario rewrap aprovado: nonempty=$nonempty meta=$meta fallback=$fallback invalid=0."
}

function Invoke-MetaRewrapDryRun {
    $counts = Get-MetaRewrapCounts
    Invoke-Remote @"
set -Eeuo pipefail
'$($script:RemoteKit)/scripts/17-rewrap-meta-tokens.sh' --dry-run \
  --expected-nonempty '$($counts.Nonempty)' \
  --expected-meta-readable '$($counts.Meta)' \
  --expected-fallback-readable '$($counts.Fallback)'
"@
}

function Invoke-MetaRewrapExecute {
    $counts = Get-MetaRewrapCounts
    $remoteRun = Get-RemoteRun
    Invoke-Remote @"
set -Eeuo pipefail
set +x
marker=/var/lib/crm-migration/meta-token-rewrap-last-success
restore='$($script:RemoteInstall)/.crm-last-restore'
restore_sha="`$(sha256sum "`$restore" | awk '{print `$1}')"
marker_value() {
  local key="`$1"
  awk -F= -v wanted="`$key" '
    `$1 == wanted {value=substr(`$0,index(`$0,"=")+1); found++}
    END {if (found != 1) exit 42; printf "%s", value}
  ' "`$marker"
}
validate_marker() {
  [[ -f "`$marker" && ! -L "`$marker" ]]
  [[ "`$(stat -c '%u:%g:%a' "`$marker")" == '0:0:600' ]]
  [[ "`$(marker_value project_ref)" == '$($script:ProjectRef)' ]]
  [[ "`$(marker_value restore_marker_sha256)" == "`$restore_sha" ]]
  [[ "`$(marker_value nonempty)" == '$($counts.Nonempty)' ]]
  [[ "`$(marker_value source_meta_readable)" == '$($counts.Meta)' ]]
  [[ "`$(marker_value source_fallback_readable)" == '$($counts.Fallback)' ]]
  [[ "`$(marker_value fallback_rewrapped)" == '$($counts.Fallback)' ]]
  [[ "`$(marker_value meta_valid)" == '$($counts.Nonempty)' ]]
  [[ "`$(marker_value fallback_valid)" == '0' ]]
  [[ "`$(marker_value invalid)" == '0' ]]
  rewrapped="`$(marker_value rewrapped)"
  already_current="`$(marker_value already_current)"
  changed="`$(marker_value changed)"
  slots_total="`$(marker_value slots_total)"
  [[ "`$rewrapped" =~ ^(0|[1-9][0-9]*)`$ && "`$already_current" =~ ^(0|[1-9][0-9]*)`$ ]]
  [[ "`$changed" =~ ^(0|[1-9][0-9]*)`$ && "`$slots_total" =~ ^(0|[1-9][0-9]*)`$ ]]
  (( rewrapped + already_current == $($counts.Meta) ))
  (( changed == rewrapped + $($counts.Fallback) ))
  [[ "`$(marker_value meta_key_sha256)" =~ ^[0-9a-f]{64}`$ ]]
  [[ "`$(marker_value fallback_key_sha256)" =~ ^[0-9a-f]{64}`$ ]]
  unset rewrapped already_current changed slots_total
}
if [[ -e "`$marker" || -L "`$marker" ]]; then
  [[ -f "`$marker" && ! -L "`$marker" ]]
  [[ "`$(stat -c '%u:%g:%a' "`$marker")" == '0:0:600' ]]
  marker_restore_sha="`$(marker_value restore_marker_sha256)"
  [[ "`$marker_restore_sha" =~ ^[0-9a-f]{64}`$ ]]
  if [[ "`$marker_restore_sha" == "`$restore_sha" ]]; then
    validate_marker
    exit 0
  fi
  [[ "`$(marker_value project_ref)" == '$($script:ProjectRef)' ]]
  prior_marker='$remoteRun/meta-token-rewrap-prior-success'
  if [[ -e "`$prior_marker" || -L "`$prior_marker" ]]; then
    [[ -f "`$prior_marker" && ! -L "`$prior_marker" ]]
    [[ "`$(stat -c '%u:%g:%a' "`$prior_marker")" == '0:0:600' ]]
    cmp -s -- "`$marker" "`$prior_marker"
  else
    install -o root -g root -m 0600 "`$marker" "`$prior_marker"
  fi
  unset marker_restore_sha prior_marker
fi
'$($script:RemoteKit)/scripts/17-rewrap-meta-tokens.sh' --execute \
  --expected-nonempty '$($counts.Nonempty)' \
  --expected-meta-readable '$($counts.Meta)' \
  --expected-fallback-readable '$($counts.Fallback)'
validate_marker
"@
    Assert-MetaRewrapBinding
}

function Assert-MetaRewrapBinding {
    $counts = Get-MetaRewrapCounts
    Invoke-Remote -Quiet @"
set -Eeuo pipefail
set +x
umask 077
ulimit -c 0
marker=/var/lib/crm-migration/meta-token-rewrap-last-success
restore='$($script:RemoteInstall)/.crm-last-restore'
functions_env='$($script:RemoteInstall)/functions.env'
[[ -f "`$marker" && ! -L "`$marker" && -f "`$restore" && ! -L "`$restore" ]]
[[ -f "`$functions_env" && ! -L "`$functions_env" ]]
[[ "`$(stat -c '%u:%g:%a' "`$marker")" == '0:0:600' ]]
[[ "`$(stat -c '%u:%g:%a' "`$functions_env")" == '0:0:600' ]]
env_value() {
  local key="`$1"
  awk -F= -v wanted="`$key" '
    `$1 == wanted {value=substr(`$0,index(`$0,"=")+1); found++}
    END {if (found != 1 || length(value) == 0) exit 42; printf "%s", value}
  ' "`$functions_env"
}
marker_value() {
  local key="`$1"
  awk -F= -v wanted="`$key" '
    `$1 == wanted {value=substr(`$0,index(`$0,"=")+1); found++}
    END {if (found != 1) exit 42; printf "%s", value}
  ' "`$marker"
}
meta_key="`$(env_value META_TOKEN_ENCRYPTION_KEY)"
fallback_key="`$(env_value GOOGLE_CALENDAR_ENCRYPTION_KEY)"
meta_sha="`$(printf '%s' "`$meta_key" | sha256sum | awk '{print `$1}')"
fallback_sha="`$(printf '%s' "`$fallback_key" | sha256sum | awk '{print `$1}')"
unset meta_key fallback_key
restore_sha="`$(sha256sum "`$restore" | awk '{print `$1}')"
[[ "`$(marker_value project_ref)" == '$($script:ProjectRef)' ]]
[[ "`$(marker_value restore_marker_sha256)" == "`$restore_sha" ]]
[[ "`$(marker_value meta_key_sha256)" == "`$meta_sha" ]]
[[ "`$(marker_value fallback_key_sha256)" == "`$fallback_sha" ]]
[[ "`$(marker_value nonempty)" == '$($counts.Nonempty)' ]]
[[ "`$(marker_value source_meta_readable)" == '$($counts.Meta)' ]]
[[ "`$(marker_value source_fallback_readable)" == '$($counts.Fallback)' ]]
[[ "`$(marker_value fallback_rewrapped)" == '$($counts.Fallback)' ]]
[[ "`$(marker_value meta_valid)" == '$($counts.Nonempty)' ]]
[[ "`$(marker_value fallback_valid)" == '0' && "`$(marker_value invalid)" == '0' ]]
rewrapped="`$(marker_value rewrapped)"
already_current="`$(marker_value already_current)"
changed="`$(marker_value changed)"
[[ "`$rewrapped" =~ ^(0|[1-9][0-9]*)`$ && "`$already_current" =~ ^(0|[1-9][0-9]*)`$ ]]
[[ "`$changed" =~ ^(0|[1-9][0-9]*)`$ ]]
(( rewrapped + already_current == $($counts.Meta) ))
(( changed == rewrapped + $($counts.Fallback) ))
unset meta_sha fallback_sha restore_sha rewrapped already_current changed
"@
}

function Remove-LegacyMetaFallback {
    $counts = Get-MetaRewrapCounts
    $remoteRun = Get-RemoteRun
    # On the first attempt this proves both keys against the post-transaction
    # marker. On resume the remote authorization marker below safely recovers
    # the narrow crash window after deletion.
    $removalState = "$remoteRun/meta-fallback-removal.env"
    Invoke-Remote -Quiet @"
set -Eeuo pipefail
set +x
umask 077
ulimit -c 0
marker=/var/lib/crm-migration/meta-token-rewrap-last-success
restore='$($script:RemoteInstall)/.crm-last-restore'
functions_env='$($script:RemoteInstall)/functions.env'
state='$removalState'
temp=''
cleanup() {
  if [[ -n "`$temp" && "`$temp" == "`$functions_env."* && -f "`$temp" && ! -L "`$temp" ]]; then
    shred -u -- "`$temp"
  fi
}
trap cleanup EXIT
[[ -f "`$marker" && ! -L "`$marker" && -f "`$restore" && ! -L "`$restore" ]]
[[ -f "`$functions_env" && ! -L "`$functions_env" ]]
[[ "`$(stat -c '%u:%g:%a' "`$marker")" == '0:0:600' ]]
[[ "`$(stat -c '%u:%g:%a' "`$functions_env")" == '0:0:600' ]]
marker_value() {
  local key="`$1"
  awk -F= -v wanted="`$key" '
    `$1 == wanted {value=substr(`$0,index(`$0,"=")+1); found++}
    END {if (found != 1) exit 42; printf "%s", value}
  ' "`$marker"
}
state_value() {
  local key="`$1"
  awk -F= -v wanted="`$key" '
    `$1 == wanted {value=substr(`$0,index(`$0,"=")+1); found++}
    END {if (found != 1) exit 42; printf "%s", value}
  ' "`$state"
}
restore_sha="`$(sha256sum "`$restore" | awk '{print `$1}')"
marker_sha="`$(sha256sum "`$marker" | awk '{print `$1}')"
expected_fallback_sha="`$(marker_value fallback_key_sha256)"
[[ "`$(marker_value project_ref)" == '$($script:ProjectRef)' ]]
[[ "`$(marker_value restore_marker_sha256)" == "`$restore_sha" ]]
[[ "`$(marker_value nonempty)" == '$($counts.Nonempty)' ]]
[[ "`$(marker_value source_meta_readable)" == '$($counts.Meta)' ]]
[[ "`$(marker_value source_fallback_readable)" == '$($counts.Fallback)' ]]
[[ "`$(marker_value fallback_rewrapped)" == '$($counts.Fallback)' ]]
[[ "`$(marker_value meta_valid)" == '$($counts.Nonempty)' ]]
[[ "`$(marker_value fallback_valid)" == '0' && "`$(marker_value invalid)" == '0' ]]
[[ "`$expected_fallback_sha" =~ ^[0-9a-f]{64}`$ ]]
rewrapped="`$(marker_value rewrapped)"
already_current="`$(marker_value already_current)"
changed="`$(marker_value changed)"
[[ "`$rewrapped" =~ ^(0|[1-9][0-9]*)`$ && "`$already_current" =~ ^(0|[1-9][0-9]*)`$ ]]
[[ "`$changed" =~ ^(0|[1-9][0-9]*)`$ ]]
(( rewrapped + already_current == $($counts.Meta) ))
(( changed == rewrapped + $($counts.Fallback) ))
meta_key="`$(awk -F= '`$1 == "META_TOKEN_ENCRYPTION_KEY" {value=substr(`$0,index(`$0,"=")+1); found++} END {if(found != 1) exit 42; printf "%s",value}' "`$functions_env")"
meta_sha="`$(printf '%s' "`$meta_key" | sha256sum | awk '{print `$1}')"
unset meta_key
[[ "`$meta_sha" == "`$(marker_value meta_key_sha256)" ]]
unset meta_sha rewrapped already_current changed
write_state() {
  local status="`$1" state_temp
  state_temp="`$(mktemp "`$state.XXXXXX")"
  printf '%s\n' \
    "status=`$status" \
    'run_id=$($script:ActiveRunId)' \
    "restore_marker_sha256=`$restore_sha" \
    "rewrap_marker_sha256=`$marker_sha" \
    "fallback_key_sha256=`$expected_fallback_sha" >"`$state_temp"
  chmod 0600 "`$state_temp"; chown root:root "`$state_temp"; mv -f -- "`$state_temp" "`$state"
}
if [[ -e "`$state" || -L "`$state" ]]; then
  [[ -f "`$state" && ! -L "`$state" && "`$(stat -c '%u:%g:%a' "`$state")" == '0:0:600' ]]
  status="`$(state_value status)"
  [[ "`$status" == 'authorized' || "`$status" == 'removed' ]]
  [[ "`$(state_value run_id)" == '$($script:ActiveRunId)' ]]
  [[ "`$(state_value restore_marker_sha256)" == "`$restore_sha" ]]
  [[ "`$(state_value rewrap_marker_sha256)" == "`$marker_sha" ]]
  [[ "`$(state_value fallback_key_sha256)" == "`$expected_fallback_sha" ]]
else
  fallback_count="`$(grep -c '^GOOGLE_CALENDAR_ENCRYPTION_KEY=' "`$functions_env" || true)"
  [[ "`$fallback_count" == '1' ]]
  fallback_key="`$(awk -F= '`$1 == "GOOGLE_CALENDAR_ENCRYPTION_KEY" {print substr(`$0,index(`$0,"=")+1)}' "`$functions_env")"
  fallback_sha="`$(printf '%s' "`$fallback_key" | sha256sum | awk '{print `$1}')"
  unset fallback_key
  [[ "`$fallback_sha" == "`$expected_fallback_sha" ]]
  unset fallback_sha fallback_count
  status=authorized
  write_state "`$status"
fi
fallback_count="`$(grep -c '^GOOGLE_CALENDAR_ENCRYPTION_KEY=' "`$functions_env" || true)"
if [[ "`$status" == 'authorized' ]]; then
  if [[ "`$fallback_count" == '1' ]]; then
    fallback_key="`$(awk -F= '`$1 == "GOOGLE_CALENDAR_ENCRYPTION_KEY" {print substr(`$0,index(`$0,"=")+1)}' "`$functions_env")"
    fallback_sha="`$(printf '%s' "`$fallback_key" | sha256sum | awk '{print `$1}')"
    unset fallback_key
    [[ "`$fallback_sha" == "`$expected_fallback_sha" ]]
    unset fallback_sha
    temp="`$(mktemp "`$functions_env.XXXXXX")"
    awk -F= '`$1 != "GOOGLE_CALENDAR_ENCRYPTION_KEY" {print}' "`$functions_env" >"`$temp"
    chmod 0600 "`$temp"; chown root:root "`$temp"; mv -f -- "`$temp" "`$functions_env"
    temp=''
  else
    [[ "`$fallback_count" == '0' ]]
  fi
  [[ "`$(grep -c '^GOOGLE_CALENDAR_ENCRYPTION_KEY=' "`$functions_env" || true)" == '0' ]]
  status=removed
  write_state "`$status"
else
  [[ "`$fallback_count" == '0' ]]
fi
[[ "`$(state_value status)" == 'removed' ]]
[[ "`$(grep -c '^GOOGLE_CALENDAR_ENCRYPTION_KEY=' "`$functions_env" || true)" == '0' ]]
meta_key="`$(awk -F= '`$1 == "META_TOKEN_ENCRYPTION_KEY" {value=substr(`$0,index(`$0,"=")+1); found++} END {if(found != 1) exit 42; printf "%s",value}' "`$functions_env")"
meta_sha="`$(printf '%s' "`$meta_key" | sha256sum | awk '{print `$1}')"
unset meta_key
[[ "`$meta_sha" == "`$(marker_value meta_key_sha256)" ]]
unset meta_sha expected_fallback_sha restore_sha marker_sha fallback_count status
trap - EXIT
"@
}

function Assert-MetaRewrapPostFallback {
    $counts = Get-MetaRewrapCounts
    $remoteRun = Get-RemoteRun
    Invoke-Remote -Quiet @"
set -Eeuo pipefail
set +x
umask 077
ulimit -c 0
marker=/var/lib/crm-migration/meta-token-rewrap-last-success
restore='$($script:RemoteInstall)/.crm-last-restore'
functions_env='$($script:RemoteInstall)/functions.env'
state='$remoteRun/meta-fallback-removal.env'
for file in "`$marker" "`$functions_env" "`$state"; do
  [[ -f "`$file" && ! -L "`$file" && "`$(stat -c '%u:%g:%a' "`$file")" == '0:0:600' ]]
done
value() {
  local file="`$1" key="`$2"
  awk -F= -v wanted="`$key" '
    `$1 == wanted {value=substr(`$0,index(`$0,"=")+1); found++}
    END {if (found != 1) exit 42; printf "%s", value}
  ' "`$file"
}
restore_sha="`$(sha256sum "`$restore" | awk '{print `$1}')"
marker_sha="`$(sha256sum "`$marker" | awk '{print `$1}')"
[[ "`$(value "`$marker" project_ref)" == '$($script:ProjectRef)' ]]
[[ "`$(value "`$marker" restore_marker_sha256)" == "`$restore_sha" ]]
[[ "`$(value "`$marker" nonempty)" == '$($counts.Nonempty)' ]]
[[ "`$(value "`$marker" source_meta_readable)" == '$($counts.Meta)' ]]
[[ "`$(value "`$marker" source_fallback_readable)" == '$($counts.Fallback)' ]]
[[ "`$(value "`$marker" fallback_rewrapped)" == '$($counts.Fallback)' ]]
[[ "`$(value "`$marker" meta_valid)" == '$($counts.Nonempty)' ]]
[[ "`$(value "`$marker" fallback_valid)" == '0' && "`$(value "`$marker" invalid)" == '0' ]]
[[ "`$(value "`$state" status)" == 'removed' ]]
[[ "`$(value "`$state" run_id)" == '$($script:ActiveRunId)' ]]
[[ "`$(value "`$state" restore_marker_sha256)" == "`$restore_sha" ]]
[[ "`$(value "`$state" rewrap_marker_sha256)" == "`$marker_sha" ]]
[[ "`$(value "`$state" fallback_key_sha256)" == "`$(value "`$marker" fallback_key_sha256)" ]]
[[ "`$(grep -c '^GOOGLE_CALENDAR_ENCRYPTION_KEY=' "`$functions_env" || true)" == '0' ]]
meta_key="`$(value "`$functions_env" META_TOKEN_ENCRYPTION_KEY)"
meta_sha="`$(printf '%s' "`$meta_key" | sha256sum | awk '{print `$1}')"
unset meta_key
[[ "`$meta_sha" == "`$(value "`$marker" meta_key_sha256)" ]]
rewrapped="`$(value "`$marker" rewrapped)"
already_current="`$(value "`$marker" already_current)"
changed="`$(value "`$marker" changed)"
[[ "`$rewrapped" =~ ^(0|[1-9][0-9]*)`$ && "`$already_current" =~ ^(0|[1-9][0-9]*)`$ ]]
[[ "`$changed" =~ ^(0|[1-9][0-9]*)`$ ]]
(( rewrapped + already_current == $($counts.Meta) ))
(( changed == rewrapped + $($counts.Fallback) ))
unset restore_sha marker_sha meta_sha rewrapped already_current changed
"@
}

function Capture-GreenWriteBoundary {
    $remoteRun = Get-RemoteRun
    Invoke-Remote -Quiet @"
set -Eeuo pipefail
set +x
umask 077
marker='$remoteRun/green-write-boundary.env'
restore='$($script:RemoteInstall)/.crm-last-restore'
restore_sha="`$(sha256sum "`$restore" | awk '{print `$1}')"
validate_marker() {
  [[ -f "`$marker" && ! -L "`$marker" ]]
  [[ "`$(stat -c '%u' "`$marker")" == '0' ]] && (( (8#`$(stat -c '%a' "`$marker") & 8#077) == 0 ))
  grep -Fxq 'run_id=$($script:ActiveRunId)' "`$marker"
  grep -Fxq "restore_marker_sha256=`$restore_sha" "`$marker"
  lsn="`$(awk -F= '`$1 == "wal_lsn" {print `$2; exit}' "`$marker")"
  [[ "`$lsn" =~ ^[0-9A-F]+/[0-9A-F]+`$ ]]
}
if [[ -e "`$marker" || -L "`$marker" ]]; then validate_marker; exit 0; fi
lsn="`$(docker exec supabase-db psql -XAtq -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'SELECT pg_current_wal_lsn();')"
[[ "`$lsn" =~ ^[0-9A-F]+/[0-9A-F]+`$ ]]
temp="`$(mktemp "`$marker.XXXXXX")"
printf '%s\n' \
  'run_id=$($script:ActiveRunId)' \
  "restore_marker_sha256=`$restore_sha" \
  "wal_lsn=`$lsn" >"`$temp"
chmod 0600 "`$temp"; mv -- "`$temp" "`$marker"
validate_marker
"@
}

function Assert-GreenUnchangedForRollback {
    $remoteRun = Get-RemoteRun
    Invoke-Remote -Quiet @"
set -Eeuo pipefail
set +x
marker='$remoteRun/green-write-boundary.env'
restore='$($script:RemoteInstall)/.crm-last-restore'
[[ -f "`$marker" && ! -L "`$marker" ]]
[[ "`$(stat -c '%u' "`$marker")" == '0' ]] && (( (8#`$(stat -c '%a' "`$marker") & 8#077) == 0 ))
grep -Fxq 'run_id=$($script:ActiveRunId)' "`$marker"
grep -Fxq "restore_marker_sha256=`$(sha256sum "`$restore" | awk '{print `$1}')" "`$marker"
expected="`$(awk -F= '`$1 == "wal_lsn" {print `$2; exit}' "`$marker")"
current="`$(docker exec supabase-db psql -XAtq -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'SELECT pg_current_wal_lsn();')"
[[ "`$expected" =~ ^[0-9A-F]+/[0-9A-F]+`$ && "`$current" == "`$expected" ]] || {
  printf 'green WAL avancou; rollback automatico perderia dados/efeitos e foi recusado\n' >&2
  exit 42
}
"@
    Write-CutoverLog 'Rollback: WAL green nao avancou desde a fronteira de callbacks/crons.'
}

function Cutover-Evolution {
    $remoteRun = Get-RemoteRun
    $recovered = Get-RemoteProviderArtifact 'Evolution'
    if ($null -ne $recovered) {
        Set-Artifact 'evolution_snapshot' $recovered
        return
    }
    $output = @(Invoke-Remote -Capture @"
set -Eeuo pipefail
set +x
umask 077
pointer='$remoteRun/evolution-snapshot.path'
if [[ -f "`$pointer" ]]; then
  snapshot="`$(cat "`$pointer")"
  [[ "`$snapshot" == '$($script:RemoteBackup)/evolution-webhooks/'* && -f "`$snapshot/APPLIED" ]]
  printf 'CRM_ARTIFACT_EVOLUTION=%s\n' "`$snapshot"; exit 0
fi
marker="`$(mktemp '$remoteRun/.evolution-start.XXXXXX')"; chmod 0600 "`$marker"
env CONFIRM_EVOLUTION_WEBHOOK_CUTOVER=YES_POINT_CRM_EVOLUTION_TO_VPS \
  '$($script:RemoteKit)/scripts/15-cutover-evolution-webhooks.sh' apply
mapfile -t applied < <(find '$($script:RemoteBackup)/evolution-webhooks' -mindepth 2 -maxdepth 2 -type f -name APPLIED -newer "`$marker" -printf '%h\n')
[[ "`${#applied[@]}" -eq 1 ]]
printf '%s\n' "`${applied[0]}" >"`$pointer"; chmod 0600 "`$pointer"; rm -f -- "`$marker"
printf 'CRM_ARTIFACT_EVOLUTION=%s\n' "`${applied[0]}"
"@)
    $path = Get-TaggedArtifact $output 'EVOLUTION' '^/var/backups/crm-supabase/evolution-webhooks/[0-9]{8}T[0-9]{6}Z-apply$'
    Set-Artifact 'evolution_snapshot' $path
}

function Cutover-Meta {
    $remoteRun = Get-RemoteRun
    $recovered = Get-RemoteProviderArtifact 'Meta'
    if ($null -ne $recovered) {
        Set-Artifact 'meta_snapshot' $recovered
        return
    }
    $output = @(Invoke-Remote -Capture @"
set -Eeuo pipefail
set +x
umask 077
pointer='$remoteRun/meta-snapshot.path'
if [[ -f "`$pointer" ]]; then
  snapshot="`$(cat "`$pointer")"
  [[ "`$snapshot" == '$($script:RemoteBackup)/meta-webhook/'* && -f "`$snapshot/APPLIED" ]]
  printf 'CRM_ARTIFACT_META=%s\n' "`$snapshot"; exit 0
fi
marker="`$(mktemp '$remoteRun/.meta-start.XXXXXX')"; chmod 0600 "`$marker"
env CONFIRM_META_WEBHOOK_CUTOVER=YES_POINT_CRM_META_TO_VPS \
  '$($script:RemoteKit)/scripts/16-cutover-meta-webhook.sh' apply
mapfile -t applied < <(find '$($script:RemoteBackup)/meta-webhook' -mindepth 2 -maxdepth 2 -type f -name APPLIED -newer "`$marker" -printf '%h\n')
[[ "`${#applied[@]}" -eq 1 ]]
printf '%s\n' "`${applied[0]}" >"`$pointer"; chmod 0600 "`$pointer"; rm -f -- "`$marker"
printf 'CRM_ARTIFACT_META=%s\n' "`${applied[0]}"
"@)
    $path = Get-TaggedArtifact $output 'META' '^/var/backups/crm-supabase/meta-webhook/[0-9]{8}T[0-9]{6}Z-apply$'
    Set-Artifact 'meta_snapshot' $path
}

function Deploy-TargetFrontend {
    Assert-MetaRewrapPostFallback
    $candidate = Get-Artifact 'target_candidate'
    if ($null -ne $candidate -and (Get-CurrentProductionDeployment) -eq $candidate) {
        Assert-VercelBundle $candidate $false $true
        return
    }
    [IO.File]::WriteAllText((State-Path 'target_env_mutation.started'), [DateTime]::UtcNow.ToString('o'))
    Set-VercelTextEnv 'VITE_SUPABASE_URL' $script:ApiOrigin
    Set-VercelTargetAnonKey
    Set-VercelTextEnv 'VITE_MAINTENANCE_MODE' 'false'
    $candidate = New-VercelCandidate $false $true
    Set-Artifact 'target_candidate' $candidate
    [IO.File]::WriteAllText((State-Path 'green_promotion.started'), [DateTime]::UtcNow.ToString('o'))
    Promote-Vercel $candidate
    [IO.File]::WriteAllText((State-Path 'green_exposed.marker'), [DateTime]::UtcNow.ToString('o'))
}

function Enable-AndObserveCron {
    param(
        [ValidateSet('send-scheduled-reminders', 'auto-redistribute-leads')][string]$Job,
        [int]$TimeoutSeconds,
        [string]$ExpectedJobs
    )
    Invoke-Remote @"
set -Eeuo pipefail
enabled_epoch="`$(date +%s)"
env CONFIRM_ENABLE_CRON=YES '$($script:RemoteKit)/scripts/07-post-restore.sh' --enable-cron '$Job'
deadline=`$((SECONDS + $TimeoutSeconds)); successes=0
while (( SECONDS < deadline )); do
  successes="`$(printf '%s\n' "SELECT count(*) FROM cron.job_run_details AS run JOIN cron.job AS job USING (jobid) WHERE job.jobname = :'job_name' AND run.status = 'succeeded' AND run.start_time >= to_timestamp(:'enabled_epoch');" | \
    docker exec -i supabase-db psql -XAtq -U postgres -d postgres -v ON_ERROR_STOP=1 \
      -v job_name='$Job' -v enabled_epoch="`$enabled_epoch")"
  [[ "`$successes" =~ ^[0-9]+`$ && "`$successes" -ge 1 ]] && break
  sleep 5
done
[[ "`$successes" =~ ^[0-9]+`$ && "`$successes" -ge 1 ]]
env EXPECTED_CRON_LAUNCH_STATE=on EXPECTED_ACTIVE_CRON_JOBS='$ExpectedJobs' \
  '$($script:RemoteKit)/scripts/10-healthcheck.sh'
"@
}

function Enable-Retention {
    Invoke-Remote @"
set -Eeuo pipefail
env CONFIRM_ENABLE_CHAT_MEDIA_RETENTION=YES_ENABLE_7_DAY_CHAT_MEDIA_RETENTION_ON_TARGET \
  '$($script:RemoteKit)/scripts/install-systemd.sh' --enable-chat-media-retention
env EXPECTED_CRON_LAUNCH_STATE=on EXPECTED_ACTIVE_CRON_JOBS='send-scheduled-reminders,auto-redistribute-leads' \
  '$($script:RemoteKit)/scripts/10-healthcheck.sh'
"@
}

function Mark-Production {
    Assert-MetaRewrapPostFallback
    $deployment = Get-Artifact 'target_candidate'
    $remoteRun = Get-RemoteRun
    if ($deployment -notmatch '^https://crm-definitivo-[a-z0-9-]+\.vercel\.app$') { throw 'Deploy final ausente.' }
    if ((Get-CurrentProductionDeployment) -ne $deployment) { throw 'Alias frontend saiu do deploy green validado.' }
    Assert-VercelBundle -Url $deployment -Maintenance $false -TargetApi $true
    Invoke-Remote @"
set -Eeuo pipefail
set +x
umask 077
marker='$($script:RemoteInstall)/.crm-production-cutover-complete'
restore='$($script:RemoteInstall)/.crm-last-restore'
discard='$($script:RemoteInstall)/.crm-chat-media-discarded'
retention='$($script:RemoteInstall)/.crm-chat-media-retention-enabled'
write_boundary='$remoteRun/green-write-boundary.env'
active='$($script:RemoteBackup)/orchestrator/ACTIVE_RUN'
[[ -f "`$active" && ! -L "`$active" && "`$(tr -d '[:space:]' <"`$active")" == '$($script:ActiveRunId)' ]]
[[ "`$(stat -c '%u' "`$active")" == '0' ]] && (( (8#`$(stat -c '%a' "`$active") & 8#077) == 0 ))
for state_file in "`$restore" "`$discard" "`$retention"; do
  [[ -f "`$state_file" && ! -L "`$state_file" ]]
  owner="`$(stat -c '%u' "`$state_file")"; mode="`$(stat -c '%a' "`$state_file")"
  [[ "`$owner" == '0' ]] && (( (8#`$mode & 8#077) == 0 ))
done
[[ -f "`$write_boundary" && ! -L "`$write_boundary" ]]
[[ "`$(stat -c '%u' "`$write_boundary")" == '0' ]] && (( (8#`$(stat -c '%a' "`$write_boundary") & 8#077) == 0 ))
grep -Fxq 'run_id=$($script:ActiveRunId)' "`$write_boundary"
sha="`$(awk -F= '`$1 == "manifest_sha256" {print `$2; exit}' "`$restore")"
[[ "`$sha" =~ ^[0-9a-f]{64}`$ ]]
grep -Fxq "restore_marker_sha256=`$(sha256sum "`$restore" | awk '{print `$1}')" "`$write_boundary"
[[ "`$(awk -F= '`$1 == "restore_manifest_sha256" {print `$2; exit}' "`$discard")" == "`$sha" ]]
[[ "`$(awk -F= '`$1 == "restore_manifest_sha256" {print `$2; exit}' "`$retention")" == "`$sha" ]]
cron="`$(docker exec supabase-db psql -XAtq -U postgres -d postgres -v ON_ERROR_STOP=1 -c "SELECT current_setting('cron.launch_active_jobs'), count(*) FILTER (WHERE active AND jobname IN ('send-scheduled-reminders','auto-redistribute-leads')), count(*) FILTER (WHERE active AND jobname = 'sync-google-sheets') FROM cron.job;")"
[[ "`$cron" == 'on|2|0' ]]
if [[ -e "`$marker" || -L "`$marker" ]]; then
  [[ -f "`$marker" && ! -L "`$marker" ]]
  owner="`$(stat -c '%u' "`$marker")"; mode="`$(stat -c '%a' "`$marker")"
  [[ "`$owner" == '0' ]] && (( (8#`$mode & 8#077) == 0 ))
  grep -Fxq 'status=production' "`$marker"
  grep -Fxq 'run_id=$($script:ActiveRunId)' "`$marker"
  grep -Fxq 'restore_manifest_sha256='"`$sha" "`$marker"
  grep -Fxq 'source_state=frozen-cold-rollback' "`$marker"
  grep -Fxq 'backup_mode=$($script:BackupMode)' "`$marker"
  grep -Fxq 'recurring_backup=disabled' "`$marker"
  grep -Fxq 'frontend_deployment=$deployment' "`$marker"
  grep -Fxq 'active_cron_jobs=send-scheduled-reminders,auto-redistribute-leads' "`$marker"
  grep -Fxq 'chat_media_retention_days=7' "`$marker"
  grep -Fxq 'legacy_meta_fallback=removed' "`$marker"
  grep -Fxq 'green_write_boundary=wal-audited' "`$marker"
  exit 0
fi
temp="`$(mktemp "`$marker.XXXXXX")"
printf '%s\n' \
  'status=production' \
  "completed_at_utc=`$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  'run_id=$($script:ActiveRunId)' \
  "restore_manifest_sha256=`$sha" \
  'source_state=frozen-cold-rollback' \
  'backup_mode=$($script:BackupMode)' \
  'recurring_backup=disabled' \
  'frontend_deployment=$deployment' \
  'active_cron_jobs=send-scheduled-reminders,auto-redistribute-leads' \
  'chat_media_retention_days=7' \
  'legacy_meta_fallback=removed' \
  'green_write_boundary=wal-audited' >"`$temp"
chmod 0600 "`$temp"; mv -f -- "`$temp" "`$marker"
printf 'PRODUCTION_MARKER_WRITTEN\n'
"@
}

function Disable-TargetWorkersForRollback {
    $remoteRun = Get-RemoteRun
    Invoke-Remote @"
set -Eeuo pipefail
set +x
umask 077
archive='$remoteRun/rollback-target-workers'
install -d -m 0700 "`$archive"

for timer in crm-supabase-chat-media-retention.timer crm-supabase-health.timer; do
  if systemctl cat "`$timer" >/dev/null 2>&1; then
    systemctl disable --now "`$timer"
  fi
done
deadline=`$((SECONDS + 120))
while systemctl is-active --quiet crm-supabase-chat-media-retention.service 2>/dev/null; do
  (( SECONDS < deadline )) || { printf 'retention service did not drain\n' >&2; exit 42; }
  sleep 2
done

docker exec supabase-db sh -ceu '
  export PGPASSWORD="`$POSTGRES_PASSWORD"
  exec psql -h 127.0.0.1 -X -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
    -c "ALTER SYSTEM SET cron.launch_active_jobs = '\''off'\'';" \
    -c "SELECT pg_reload_conf();" \
    -c "UPDATE cron.job SET active = false WHERE jobname IN ('\''send-scheduled-reminders'\'', '\''auto-redistribute-leads'\'', '\''sync-google-sheets'\'');"
' >/dev/null

deadline=`$((SECONDS + 120))
while :; do
  drain="`$(docker exec supabase-db psql -XAtq -F '|' -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -c "SELECT count(*) FROM cron.job_run_details WHERE status = 'running'; SELECT count(*) FROM net.http_request_queue;")"
  mapfile -t counts <<<"`$drain"
  [[ "`${#counts[@]}" -eq 2 && "`${counts[0]}" =~ ^[0-9]+`$ && "`${counts[1]}" =~ ^[0-9]+`$ ]]
  if [[ "`${counts[0]}" == '0' && "`${counts[1]}" == '0' ]]; then break; fi
  (( SECONDS < deadline )) || { printf 'target cron/pg_net did not drain\n' >&2; exit 42; }
  sleep 2
done

marker='$($script:RemoteInstall)/.crm-chat-media-retention-enabled'
saved="`$archive/retention-enabled.marker"
if [[ -e "`$marker" || -L "`$marker" ]]; then
  [[ -f "`$marker" && ! -L "`$marker" && ! -e "`$saved" ]]
  owner="`$(stat -c '%u' "`$marker")"; mode="`$(stat -c '%a' "`$marker")"
  [[ "`$owner" == '0' ]] && (( (8#`$mode & 8#077) == 0 ))
  mv -- "`$marker" "`$saved"
fi
[[ ! -e "`$marker" && ! -L "`$marker" ]]
state="`$(docker exec supabase-db psql -XAtq -F '|' -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT current_setting('cron.launch_active_jobs'), count(*) FILTER (WHERE active AND jobname IN ('send-scheduled-reminders','auto-redistribute-leads','sync-google-sheets')) FROM cron.job;")"
[[ "`$state" == 'off|0' ]]

# Close every public target write path before the final WAL comparison and
# source unfreeze. A new cutover restarts api-gw during infrastructure setup
# and starts Functions only after the post-restore gates pass again.
cd '$($script:RemoteInstall)'
mapfile -t close_services < <(docker compose config --services | grep -E '^(functions|api-gw)`$')
[[ "`${#close_services[@]}" -eq 2 ]]
docker compose stop --timeout 30 "`${close_services[@]}" >/dev/null
for service in "`${close_services[@]}"; do
  container_id="`$(docker compose ps -a -q "`$service")"
  [[ -n "`$container_id" ]]
  [[ "`$(docker inspect --format '{{.State.Running}}' "`$container_id")" == 'false' ]]
done
"@
}

function Get-RemotePointerArtifact {
    param([string]$PointerName, [string]$Tag, [string]$PathPattern, [string]$RequiredFile)
    $remoteRun = Get-RemoteRun
    $output = @(Invoke-Remote -Quiet -Capture @"
set -Eeuo pipefail
pointer='$remoteRun/$PointerName'
[[ ! -f "`$pointer" ]] && exit 0
value="`$(cat "`$pointer")"
[[ "`$value" =~ $PathPattern && -f "`$value/$RequiredFile" ]]
printf 'CRM_ARTIFACT_${Tag}=%s\n' "`$value"
"@)
    if ($output.Count -eq 0) { return $null }
    return Get-TaggedArtifact $output $Tag $PathPattern
}

function Get-RemoteProviderArtifact {
    param([Parameter(Mandatory = $true)][ValidateSet('Meta', 'Evolution')][string]$Provider)
    $remoteRun = Get-RemoteRun
    if ($Provider -eq 'Meta') {
        $pointerName = 'meta-snapshot.path'
        $startPattern = '.meta-start.*'
        $providerRoot = "$($script:RemoteBackup)/meta-webhook"
        $tag = 'META'
        $pathPattern = '^/var/backups/crm-supabase/meta-webhook/[0-9]{8}T[0-9]{6}Z-apply$'
    }
    else {
        $pointerName = 'evolution-snapshot.path'
        $startPattern = '.evolution-start.*'
        $providerRoot = "$($script:RemoteBackup)/evolution-webhooks"
        $tag = 'EVOLUTION'
        $pathPattern = '^/var/backups/crm-supabase/evolution-webhooks/[0-9]{8}T[0-9]{6}Z-apply$'
    }
    $output = @(Invoke-Remote -Quiet -Capture @"
set -Eeuo pipefail
set +x
umask 077
pointer='$remoteRun/$pointerName'
provider_root='$providerRoot'
emit_snapshot() {
  local value="`$1"
  [[ "`$value" == "`$provider_root/"* && -d "`$value" && ! -L "`$value" ]]
  for file in "`$value/APPLIED" "`$value/SHA256SUMS"; do
    [[ -f "`$file" && ! -L "`$file" ]]
    [[ "`$(stat -c '%u' "`$file")" == '0' ]] && (( (8#`$(stat -c '%a' "`$file") & 8#077) == 0 ))
  done
  (cd "`$value" && sha256sum --quiet -c SHA256SUMS)
  printf 'CRM_ARTIFACT_${tag}=%s\n' "`$value"
}
if [[ -e "`$pointer" || -L "`$pointer" ]]; then
  [[ -f "`$pointer" && ! -L "`$pointer" ]]
  [[ "`$(stat -c '%u' "`$pointer")" == '0' ]] && (( (8#`$(stat -c '%a' "`$pointer") & 8#077) == 0 ))
  emit_snapshot "`$(cat "`$pointer")"
  exit 0
fi
mapfile -t starts < <(find '$remoteRun' -mindepth 1 -maxdepth 1 -type f -name '$startPattern' -print)
if [[ "`${#starts[@]}" -eq 0 ]]; then exit 0; fi
[[ "`${#starts[@]}" -eq 1 ]]
started="`${starts[0]}"
[[ "`$(stat -c '%u' "`$started")" == '0' ]] && (( (8#`$(stat -c '%a' "`$started") & 8#077) == 0 ))
mapfile -t applied < <(find "`$provider_root" -mindepth 2 -maxdepth 2 -type f -name APPLIED -newer "`$started" -printf '%h\n')
if [[ "`${#applied[@]}" -ne 1 ]]; then
  printf 'provider cutover incompleto/ambiguo: $Provider\n' >&2
  exit 42
fi
snapshot="`${applied[0]}"
emit_snapshot "`$snapshot" >/dev/null
printf '%s\n' "`$snapshot" >"`$pointer"
chmod 0600 "`$pointer"
rm -f -- "`$started"
emit_snapshot "`$snapshot"
"@)
    if ($output.Count -eq 0) { return $null }
    return Get-TaggedArtifact $output $tag $pathPattern
}

function Complete-RemoteRollbackLease {
    $remoteRun = Get-RemoteRun
    Invoke-Remote -Quiet @"
set -Eeuo pipefail
set +x
umask 077
root='$($script:RemoteBackup)/orchestrator'
active="`$root/ACTIVE_RUN"
marker='$remoteRun/ROLLED_BACK'
exec 8>"`$root/.lease.lock"
flock -n 8
if [[ -e "`$active" || -L "`$active" ]]; then
  [[ -f "`$active" && ! -L "`$active" ]]
  [[ "`$(stat -c '%u' "`$active")" == '0' ]] && (( (8#`$(stat -c '%a' "`$active") & 8#077) == 0 ))
fi
if [[ -e "`$marker" || -L "`$marker" ]]; then
  [[ -f "`$marker" && ! -L "`$marker" ]]
  grep -Fxq 'status=rolled-back' "`$marker"
  grep -Fxq 'run_id=$($script:ActiveRunId)' "`$marker"
  if [[ -f "`$active" && ! -L "`$active" && "`$(tr -d '[:space:]' <"`$active")" == '$($script:ActiveRunId)' ]]; then
    rm -f -- "`$active"
  fi
  exit 0
fi
[[ -f "`$active" && ! -L "`$active" && "`$(tr -d '[:space:]' <"`$active")" == '$($script:ActiveRunId)' ]]
temp="`$(mktemp "`$marker.XXXXXX")"
printf '%s\n' \
  'status=rolled-back' \
  'run_id=$($script:ActiveRunId)' \
  "completed_at_utc=`$(date -u +'%Y-%m-%dT%H:%M:%SZ')" >"`$temp"
chmod 0600 "`$temp"; mv -- "`$temp" "`$marker"
rm -f -- "`$active"
"@
}

function Complete-RemoteProductionLease {
    Invoke-Remote -Quiet @"
set -Eeuo pipefail
set +x
root='$($script:RemoteBackup)/orchestrator'
active="`$root/ACTIVE_RUN"
marker='$($script:RemoteInstall)/.crm-production-cutover-complete'
[[ -f "`$marker" && ! -L "`$marker" ]]
[[ "`$(stat -c '%u' "`$marker")" == '0' ]] && (( (8#`$(stat -c '%a' "`$marker") & 8#077) == 0 ))
grep -Fxq 'status=production' "`$marker"
grep -Fxq 'run_id=$($script:ActiveRunId)' "`$marker"
grep -Fxq 'backup_mode=$($script:BackupMode)' "`$marker"
grep -Fxq 'recurring_backup=disabled' "`$marker"
exec 8>"`$root/.lease.lock"
flock -n 8
if [[ -e "`$active" || -L "`$active" ]]; then
  [[ -f "`$active" && ! -L "`$active" ]]
  [[ "`$(stat -c '%u' "`$active")" == '0' ]] && (( (8#`$(stat -c '%a' "`$active") & 8#077) == 0 ))
  [[ "`$(tr -d '[:space:]' <"`$active")" == '$($script:ActiveRunId)' ]]
  rm -f -- "`$active"
fi
"@
}

function Invoke-SafeRollback {
    if (Test-Path -LiteralPath (State-Path 'rolled_back.done') -PathType Leaf) {
        Write-CutoverLog 'Rollback ja concluido para este run.'
        return
    }
    if (Test-Stage 'frontend_live') {
        throw 'Rollback automatico recusado: green ja foi liberado e pode conter escritas. Reconciliacao e obrigatoria.'
    }
    if (Test-Path -LiteralPath (State-Path 'green_promotion.started') -PathType Leaf) {
        throw 'Rollback automatico recusado: a promocao green foi iniciada e pode ter aceitado escrita. Reconciliacao e obrigatoria.'
    }
    $greenBoundaryStarted = ((Test-Stage 'green_write_boundary') -or
        (Test-Path -LiteralPath (State-Path 'green_write_boundary.running') -PathType Leaf))
    if ($greenBoundaryStarted) {
        Assert-GreenUnchangedForRollback
    }
    # From this point onward rollback actions may mutate providers, workers or
    # routing. Persist the direction before the first action so a partial
    # rollback can never be resumed forward by mistake.
    Set-RollbackStarted

    $failures = New-Object 'System.Collections.Generic.List[string]'
    $oracleReady = Invoke-RollbackAction 'meta_oracle' 'revogar integralmente o oraculo Meta temporario' {
        Remove-ManagedMetaOracle
    } $failures

    $metaReady = Invoke-RollbackAction 'meta' 'restaurar o callback Meta blue quando aplicavel' {
        $meta = Get-Artifact 'meta_snapshot'
        if ($null -eq $meta) {
            $meta = Get-RemoteProviderArtifact 'Meta'
        }
        if ($null -ne $meta) {
            Set-Artifact 'meta_snapshot' $meta
            Write-CutoverLog 'Rollback: callback Meta -> blue.'
            Invoke-Remote "set -Eeuo pipefail; env CONFIRM_META_WEBHOOK_ROLLBACK=YES_RESTORE_PREVIOUS_META_WEBHOOK '$($script:RemoteKit)/scripts/16-cutover-meta-webhook.sh' rollback '$meta'"
        }
    } $failures

    $evolutionReady = Invoke-RollbackAction 'evolution' 'restaurar os webhooks Evolution blue quando aplicavel' {
        $evolution = Get-Artifact 'evolution_snapshot'
        if ($null -eq $evolution) {
            $evolution = Get-RemoteProviderArtifact 'Evolution'
        }
        if ($null -ne $evolution) {
            Set-Artifact 'evolution_snapshot' $evolution
            Write-CutoverLog 'Rollback: webhooks Evolution -> blue.'
            Invoke-Remote "set -Eeuo pipefail; env CONFIRM_EVOLUTION_WEBHOOK_ROLLBACK=YES_RESTORE_PREVIOUS_EVOLUTION_WEBHOOKS '$($script:RemoteKit)/scripts/15-cutover-evolution-webhooks.sh' rollback '$evolution'"
        }
    } $failures

    $workersReady = Invoke-RollbackAction 'target_workers' 'fechar e drenar workers do target quando aplicavel' {
        $targetWorkersMayHaveStarted = $false
        foreach ($stage in @('functions_started', 'cron_reminders', 'cron_redistribution', 'retention_enabled')) {
            if ((Test-Stage $stage) -or
                (Test-Path -LiteralPath (State-Path "$stage.running") -PathType Leaf)) {
                $targetWorkersMayHaveStarted = $true
            }
        }
        if ($targetWorkersMayHaveStarted) {
            Write-CutoverLog 'Rollback: fechando e drenando API/Functions/crons/retencao do target.'
            Disable-TargetWorkersForRollback
        }
    } $failures

    $routingReady = $oracleReady -and $metaReady -and $evolutionReady -and $workersReady
    $sourceReady = $false
    if ($routingReady) {
        $sourceReady = Invoke-RollbackAction 'source' 'restaurar escrita/cron exatos da origem quando congelada' {
            if ($greenBoundaryStarted) {
                Assert-GreenUnchangedForRollback
            }
            $freeze = Get-Artifact 'source_freeze'
            if ($null -eq $freeze) {
                $freeze = Get-RemotePointerArtifact 'source-freeze.path' 'SOURCE_FREEZE' '^/var/backups/crm-supabase/orchestrator/[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}/source-freeze/[0-9]{8}T[0-9]{6}Z-source-freeze$' 'FROZEN'
            }
            if ($null -ne $freeze) {
                Set-Artifact 'source_freeze' $freeze
                Write-CutoverLog 'Rollback: restaurando escrita/cron exatos da origem.'
                Invoke-Remote @"
set -Eeuo pipefail
state='$freeze'
if [[ -f "`$state/UNFROZEN" && ! -L "`$state/UNFROZEN" ]]; then
  grep -Eq '^unfrozen_at_utc=[0-9]{4}-[0-9]{2}-[0-9]{2}T' "`$state/UNFROZEN"
  exit 0
fi
state_root="`$(dirname -- "`$state")"
env CUTOVER_STATE_DIR="`$state_root" '$($script:RemoteKit)/scripts/12-unfreeze-source.sh' --confirm-unfreeze-source "`$state"
[[ -f "`$state/UNFROZEN" && ! -L "`$state/UNFROZEN" ]]
"@
            }
        } $failures
    }
    else {
        Write-CutoverLog 'Rollback: origem continua congelada porque oraculo/provedores/workers ainda nao foram provados seguros.'
    }

    $environmentReady = Invoke-RollbackAction 'vercel_env' 'restaurar o conjunto de envs Vercel blue' {
        if (Test-Path -LiteralPath (State-Path 'target_env_mutation.started') -PathType Leaf) {
            Restore-VercelBlueEnvironment
        }
        elseif ((Test-Stage 'maintenance_live') -or
                $null -ne (Get-Artifact 'maintenance_candidate') -or
                (Test-Path -LiteralPath (State-Path 'maintenance_env_mutation.started') -PathType Leaf)) {
            Set-VercelTextEnv 'VITE_SUPABASE_URL' $script:SourceOrigin
            Set-VercelTextEnv 'VITE_MAINTENANCE_MODE' 'false'
        }
        else {
            Write-CutoverLog 'Rollback: nenhum env Vercel chegou a ser alterado.'
        }
    } $failures

    $blueReady = $false
    if ($routingReady -and $sourceReady -and $environmentReady) {
        $blue = Get-Artifact 'blue_deployment'
        if ($blue -notmatch '^https://crm-definitivo-[a-z0-9-]+\.vercel\.app$') {
            [void]$failures.Add('blue_promotion: deploy blue capturado esta ausente ou invalido')
            Write-CutoverLog 'Rollback FALHA FECHADA: deploy blue capturado esta ausente ou invalido.'
        }
        else {
            $blueReady = Invoke-RollbackAction 'blue_promotion' 'promover o deploy blue capturado' {
                Promote-Vercel $blue
            } $failures
        }
    }
    else {
        Write-CutoverLog 'Rollback: alias atual foi preservado; blue nao sera promovido ate todos os gates estarem seguros.'
    }

    $leaseReady = $false
    if ($failures.Count -eq 0 -and $blueReady) {
        $leaseReady = Invoke-RollbackAction 'lease' 'fechar o lease remoto do run' {
            Complete-RemoteRollbackLease
        } $failures
    }
    if ($failures.Count -gt 0 -or -not $blueReady -or -not $leaseReady) {
        $summary = ($failures | Select-Object -Unique) -join '; '
        if ([string]::IsNullOrWhiteSpace($summary)) { $summary = 'gates de seguranca do rollback ainda nao convergiram' }
        throw "Rollback incompleto; manutencao/lease preservados: $summary"
    }
    [IO.File]::WriteAllText((State-Path 'rolled_back.done'), [DateTime]::UtcNow.ToString('o'))
    $protectedBlue = State-Path 'blue-anon.dpapi'
    if (Test-Path -LiteralPath $protectedBlue -PathType Leaf) {
        try { Remove-Item -LiteralPath $protectedBlue -Force }
        catch { Write-CutoverLog 'Aviso: captura DPAPI blue permaneceu no checkpoint local protegido.' }
    }
    Write-CutoverLog 'ROLLBACK CONCLUIDO antes da liberacao do green.'
}

if ($PSCmdlet.ParameterSetName -eq 'Preflight') {
    Invoke-FullPreflight
    exit 0
}

if ($PSCmdlet.ParameterSetName -eq 'Rollback') {
    if (-not [string]::Equals($ConfirmRollback, $script:RollbackPhrase, [StringComparison]::Ordinal)) {
        throw "Rollback exige a frase exata $($script:RollbackPhrase)."
    }
    Enter-CutoverLock
    try {
        $script:ActiveRunId = $RunId
        $existingRunState = Join-Path $script:StateRoot $script:ActiveRunId
        if (-not (Test-Path -LiteralPath $existingRunState -PathType Container)) {
            throw 'Rollback recusado: RunId local inexistente; nenhum estado remoto sera alterado.'
        }
        Initialize-State $script:ActiveRunId
        Invoke-SafeRollback
    }
    finally { Exit-CutoverLock }
    exit 0
}

if (-not [string]::Equals($Confirm, $script:GoPhrase, [StringComparison]::Ordinal)) {
    throw "Corte recusado. Use a frase exata: $($script:GoPhrase)"
}

Enter-CutoverLock
try {
if ($ResumeRunId) {
    $script:ActiveRunId = $ResumeRunId
    if (-not (Test-Path -LiteralPath (Join-Path $script:StateRoot $script:ActiveRunId) -PathType Container)) {
        throw 'ResumeRunId nao existe; iniciar outro corte seria inseguro.'
    }
}
else {
    $script:ActiveRunId = "$([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ'))-$([Guid]::NewGuid().ToString('N').Substring(0,8))"
}

Initialize-State $script:ActiveRunId
Assert-RunCanResumeForward
Write-CutoverLog "RUN_ID=$($script:ActiveRunId)"
Write-CutoverLog "Retomada: .\infra\hostinger-supabase\Invoke-CrmProductionCutover.ps1 -Confirm $($script:GoPhrase) -ResumeRunId $($script:ActiveRunId)"

try {
    Write-CutoverLog 'Preflight local/build.'
    Assert-LocalReadiness
    Assert-OrCaptureReleaseFingerprints
    Write-CutoverLog 'Preflight Vercel.'
    $observedProduction = Get-CurrentProductionDeployment
    if ($null -eq (Get-Artifact 'blue_deployment')) {
        if ($ResumeRunId -and ((Test-Stage 'maintenance_live') -or $null -ne (Get-Artifact 'maintenance_candidate'))) {
            throw 'Artefato blue ausente em retomada posterior a manutencao; rollback automatico recusado.'
        }
        Set-Artifact 'blue_deployment' $observedProduction
    }
    Write-CutoverLog 'Preflight DNS/TLS.'
    Assert-DnsAndHttps -AllowBackendUnavailable:([bool]$ResumeRunId)
    if (-not ($ResumeRunId -and (Test-Stage 'meta_rewrap_executed'))) {
        Write-CutoverLog 'Preflight oraculo Meta managed.'
        Assert-ManagedMetaOracleReadiness
    }
    else {
        Write-CutoverLog 'Oraculo Meta nao e mais requerido: rewrap transacional ja possui checkpoint.'
    }

    Invoke-Stage 'blue_env_captured' 'capturar env blue protegida para rollback Vercel' { Capture-BlueAnonKey }
    Initialize-RemoteRun
    Invoke-Stage 'release_synced' 'sincronizar release auditada na VPS' { Sync-Release $script:ActiveRunId }
    Assert-OrCaptureReleaseFingerprints
    $skipMeta = [bool]$ResumeRunId -and (Test-Path -LiteralPath (State-Path 'preflight.done') -PathType Leaf)
    $skipFreeze = [bool]$ResumeRunId -and (Test-Stage 'source_frozen')
    $skipRewrapSecret = [bool]$ResumeRunId -and (Test-Stage 'meta_rewrap_executed')
    Write-CutoverLog 'Preflight VPS/secrets/freeze/rollback/Meta.'
    Assert-RemoteReadiness -ResumeMode:([bool]$ResumeRunId) -SkipMetaProviderCheck:$skipMeta `
        -SkipFreezeProviderCheck:$skipFreeze -SkipMetaRewrapSecretCheck:$skipRewrapSecret
    [IO.File]::WriteAllText((State-Path 'preflight.done'), [DateTime]::UtcNow.ToString('o'))
    Write-CutoverLog 'PREFLIGHT PASS: nenhuma alteracao de dado/provedor foi realizada.'

    Invoke-Stage 'maintenance_live' 'publicar e verificar manutencao Vercel' { Deploy-Maintenance }
    Invoke-Stage 'source_frozen' 'congelar Supabase blue e capturar rollback' { Freeze-Source }
    Invoke-Stage 'final_export' 'exportar snapshot e baseline Auth dinamico' { Export-Final }
    Invoke-Stage 'target_clean' 'arquivar ensaio e inicializar green limpo' { Reset-Target }
    Invoke-Stage 'target_restored' 'restaurar snapshot final no green' { Restore-Target }
    Invoke-Stage 'chat_media_discarded' 'descartar historico chat-media so no destino' { Discard-ChatMedia }
    Invoke-Stage 'infrastructure_started' 'subir infraestrutura sem Edge Functions' { Start-Infrastructure }
    Invoke-Stage 'storage_copied' 'copiar/verificar buckets preservados' { Copy-Storage }
    Invoke-Stage 'post_restore' 'aplicar pos-restore com crons inativos' { Post-Restore }
    Invoke-Stage 'meta_rewrap_inventoried' 'recapturar cobertura criptografica Meta/fallback' { Inventory-MetaRewrap }
    Invoke-Stage 'meta_rewrap_dry_run' 'validar rewrap Meta sem alterar o target' { Invoke-MetaRewrapDryRun }
    Invoke-Stage 'meta_rewrap_executed' 'aplicar e auditar rewrap Meta transacional' { Invoke-MetaRewrapExecute }
    Invoke-Stage 'meta_oracle_revoked' 'revogar bearer/Function/chave temporaria com proveniencia e provar ausencia' {
        Remove-ManagedMetaOracle
    }
    Assert-ManagedMetaOracleRevoked
    Invoke-Stage 'meta_fallback_removed' 'remover fallback Google legado com marker retomavel' {
        Remove-LegacyMetaFallback
    }
    Invoke-Stage 'functions_started' 'iniciar Edge Functions com secrets validados' { Start-Functions }
    Invoke-Stage 'target_validated' 'validar banco/Auth/Storage/API/Functions fechado' { Validate-ClosedTarget }
    Invoke-Stage 'green_write_boundary' 'capturar WAL antes de callbacks e crons com efeitos' { Capture-GreenWriteBoundary }
    Invoke-Stage 'evolution_cutover' 'capturar e virar webhooks Evolution' { Cutover-Evolution }
    Invoke-Stage 'meta_cutover' 'validar token historico, capturar e virar Meta leadgen' { Cutover-Meta }
    Invoke-Stage 'cron_reminders' 'habilitar/observar send-scheduled-reminders' {
        Enable-AndObserveCron 'send-scheduled-reminders' 120 'send-scheduled-reminders'
    }
    Invoke-Stage 'cron_redistribution' 'habilitar/observar auto-redistribute-leads' {
        Enable-AndObserveCron 'auto-redistribute-leads' 390 'send-scheduled-reminders,auto-redistribute-leads'
    }
    Invoke-Stage 'retention_enabled' 'habilitar retencao chat-media de sete dias' { Enable-Retention }
    Invoke-Stage 'frontend_live' 'publicar frontend green e remover manutencao' { Deploy-TargetFrontend }
    Invoke-Stage 'production_marked' 'gravar marcador final de producao' { Mark-Production }
    Complete-RemoteProductionLease
}
catch {
    $originalFailure = $_
    $rollbackAuthorized = (
        (Test-Stage 'maintenance_live') -or
        ($null -ne (Get-Artifact 'maintenance_candidate')) -or
        (Test-Path -LiteralPath (State-Path 'maintenance_env_mutation.started') -PathType Leaf) -or
        (Test-Path -LiteralPath (State-Path 'target_env_mutation.started') -PathType Leaf)
    )
    if ($rollbackAuthorized -and -not (Test-Stage 'frontend_live')) {
        Write-CutoverLog 'Falha antes do checkpoint frontend_live; tentando rollback automatico autorizado.'
        try { Invoke-SafeRollback }
        catch { Write-CutoverLog "ROLLBACK AUTOMATICO NAO CONCLUIDO: $(Protect-LogLine $_.Exception.Message)" }
    }
    throw $originalFailure
}

$protectedBlue = State-Path 'blue-anon.dpapi'
if (Test-Path -LiteralPath $protectedBlue -PathType Leaf) {
    try { Remove-Item -LiteralPath $protectedBlue -Force }
    catch { Write-CutoverLog 'Aviso: captura DPAPI blue permaneceu no checkpoint local protegido.' }
}
Write-CutoverLog 'CUTOVER COMPLETO. Supabase blue permanece congelado como copia fria.'
Write-CutoverLog "Checkpoints: $($script:RunState)"
}
finally { Exit-CutoverLock }
