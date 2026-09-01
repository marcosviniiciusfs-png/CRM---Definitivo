#requires -Version 5.1

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$testRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$kitRoot = Split-Path -Parent $testRoot
$repoRoot = [IO.Path]::GetFullPath((Join-Path $kitRoot '..\..'))
$scriptPath = Join-Path $kitRoot 'Invoke-CrmProductionCutover.ps1'
$storageScriptPath = Join-Path $kitRoot 'scripts\copy-storage.mjs'
$systemdInstallPath = Join-Path $kitRoot 'scripts\install-systemd.sh'
$healthcheckPath = Join-Path $kitRoot 'scripts\10-healthcheck.sh'
$shellLibraryPath = Join-Path $kitRoot 'scripts\lib.sh'
$targetValidationPath = Join-Path $kitRoot 'sql\target-validation.sql'
$metaScriptPath = Join-Path $kitRoot 'scripts\16-cutover-meta-webhook.sh'
$rewrapScriptPath = Join-Path $kitRoot 'scripts\17-rewrap-meta-tokens.sh'
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$errors)
if (@($errors).Count -gt 0) {
    throw "PowerShell parser errors: $(@($errors | ForEach-Object Message) -join '; ')"
}

$source = [IO.File]::ReadAllText($scriptPath)
$required = @(
    'PODE_COLOCAR_EM_PRODUCAO',
    'uxttihjsxfowursjyult',
    '103.199.185.97',
    'api.kairozcrm.com.br',
    'expected_auth_users',
    "--set=expected_auth_users=",
    'YES_POINT_CRM_EVOLUTION_TO_VPS',
    'YES_POINT_CRM_META_TO_VPS',
    "11-freeze-source.sh' --preflight",
    'Restore-VercelBlueEnvironment',
    'blue-anon.dpapi',
    'maintenance_env_mutation.started',
    'target_env_mutation.started',
    'green_promotion.started',
    "Invoke-RollbackAction 'source'",
    "Invoke-RollbackAction 'target_workers'",
    'routingReady',
    'Disable-TargetWorkersForRollback',
    'ACTIVE_RUN',
    'crm-release-sync.lock',
    'Complete-RemoteRollbackLease',
    'Complete-RemoteProductionLease',
    'Get-RemoteProviderArtifact',
    "`$startPattern = '.meta-start.*'",
    "`$startPattern = '.evolution-start.*'",
    "17-rewrap-meta-tokens.sh' --inventory",
    "Invoke-Stage 'meta_rewrap_inventoried'",
    "Invoke-Stage 'meta_rewrap_dry_run'",
    "Invoke-Stage 'meta_rewrap_executed'",
    "Invoke-Stage 'meta_oracle_revoked'",
    "Invoke-Stage 'meta_fallback_removed'",
    "Invoke-RollbackAction 'meta_oracle'",
    'Remove-ManagedMetaOracle',
    'Remove-ManagedMetaRewrap.ps1',
    'CRM_META_REWRAP_PROVENANCE=',
    "`$_.slug -eq 'meta-token-rewrap'",
    'marker_value meta_key_sha256',
    'marker_value fallback_key_sha256',
    'Assert-MetaRewrapBinding',
    'Assert-MetaRewrapPostFallback',
    'Remove-LegacyMetaFallback',
    'meta-fallback-removal.env',
    'legacy_meta_fallback=removed',
    'Assert-GreenUnchangedForRollback',
    "Invoke-Stage 'green_write_boundary'",
    'Assert-OrCaptureReleaseFingerprints',
    'release_kit_sha256',
    'release_functions_sha256',
    'release_frontend_sha256',
    'infra\hostinger-supabase\scripts\copy-storage.mjs',
    'SOURCE_SUPABASE_URL',
    'SOURCE_SERVICE_ROLE_KEY',
    'TARGET_SUPABASE_URL',
    'TARGET_SERVICE_ROLE_KEY',
    'STORAGE_BUCKETS',
    'Get-StorageApiHandoff',
    'EnvironmentVariables',
    "'--verify'",
    'Bucket chat-media: configuracao preservada, vazio no destino e excluido da copia',
    'New-Object Text.UTF8Encoding($false)',
    '$Script.Replace("`r`n", "`n").Replace("`r", "`n")',
    "'inspect', `$script:FrontendOrigin",
    'catch {',
    'Invoke-SafeRollback',
    'rollback.started',
    'Assert-RunCanResumeForward',
    "foreach (`$stage in @('functions_started'",
    'close_services',
    "Enable-AndObserveCron 'send-scheduled-reminders'",
    "Enable-AndObserveCron 'auto-redistribute-leads'",
    'managed-source-cold',
    '/etc/crm-supabase/managed-source-cold-approved',
    "`$script:BackupMode = 'managed-source-cold'",
    "backup_mode=`$(`$script:BackupMode)",
    'recurring_backup=disabled'
    "scripts/install-systemd.sh'"
)
foreach ($literal in $required) {
    if (-not $source.Contains($literal)) { throw "Missing contract: $literal" }
}
if ($source.Contains("Enable-AndObserveCron 'sync-google-sheets'")) {
    throw 'Google Sheets cron must remain inactive.'
}
foreach ($resendFunction in @('admin-generate-temp-password', 'admin-reset-password')) {
    if ($source -notmatch "for fn in [^\r\n]*$resendFunction") {
        throw "Resend-dependent Function must remain disabled: $resendFunction"
    }
}
if ($source -match "'list',\s*\`$script:VercelProject,\s*'--environment'") {
    throw 'Production alias must be resolved with inspect, not newest deployment inventory.'
}
if ($source.Contains('return ,$output')) {
    throw 'Captured native output must stay flat for JSON/artifact parsers.'
}

# Candidate and captured-blue deployment URLs can be protected by Vercel
# Authentication. Both flows must fetch their HTML/assets through `vercel curl`,
# which obtains the automatic protection-bypass token for the linked project.
$functionDefinitions = @($ast.FindAll({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst]
}, $true))
$vercelCurlHelpers = @($functionDefinitions | Where-Object {
    $functionAst = $_
    $vercelCalls = @($functionAst.Body.FindAll({
        param($node)
        $node -is [Management.Automation.Language.CommandAst] -and
            $node.GetCommandName() -eq 'Invoke-Vercel'
    }, $true))
    @($vercelCalls | Where-Object {
        $_.Extent.Text -match '(?s)-Arguments\s+@\(\s*[''"]curl[''"](?:\s*,|\s*\))'
    }).Count -gt 0
})
if ($vercelCurlHelpers.Count -eq 0) {
    throw 'Protected Vercel deployment reads must have a helper backed by vercel curl.'
}
$vercelCurlHelperNames = @($vercelCurlHelpers | ForEach-Object Name)
foreach ($protectedFlowName in @('Assert-VercelBundle', 'Capture-BlueAnonKey')) {
    $protectedFlows = @($functionDefinitions | Where-Object Name -eq $protectedFlowName)
    if ($protectedFlows.Count -ne 1) {
        throw "Expected exactly one protected Vercel flow: $protectedFlowName"
    }
    $flowCommands = @($protectedFlows[0].Body.FindAll({
        param($node)
        $node -is [Management.Automation.Language.CommandAst]
    }, $true))
    if (@($flowCommands | Where-Object { $_.GetCommandName() -eq 'Invoke-WebRequest' }).Count -gt 0) {
        throw "$protectedFlowName must never read a protected deployment with Invoke-WebRequest."
    }
    $calledCommands = @($flowCommands | ForEach-Object { $_.GetCommandName() } | Where-Object { $_ })
    if (@($calledCommands | Where-Object { $vercelCurlHelperNames -contains $_ }).Count -eq 0) {
        throw "$protectedFlowName must fetch protected deployment content through the vercel curl helper."
    }
}
foreach ($vercelCurlHelper in $vercelCurlHelpers) {
    $directWebRequests = @($vercelCurlHelper.Body.FindAll({
        param($node)
        $node -is [Management.Automation.Language.CommandAst] -and
            $node.GetCommandName() -eq 'Invoke-WebRequest'
    }, $true))
    if ($directWebRequests.Count -gt 0) {
        throw 'The vercel curl helper must not fall back to Invoke-WebRequest.'
    }
}
if ($source.Contains('''$($script:RemoteKit)/scripts/06-sync-storage-rclone.sh'' final')) {
    throw 'Automated cutover must use the Storage API copier, not remote rclone.'
}
if ($source.Contains('for key in SOURCE_S3_ENDPOINT SOURCE_S3_REGION SOURCE_S3_ACCESS_KEY_ID SOURCE_S3_SECRET_ACCESS_KEY TARGET_S3_ENDPOINT TARGET_S3_REGION TARGET_S3_ACCESS_KEY_ID TARGET_S3_SECRET_ACCESS_KEY')) {
    throw 'Automated cutover readiness must not require optional S3 credentials.'
}
if ($source -notmatch '(?s)managed-source-cold.*/etc/crm-supabase/managed-source-cold-approved|/etc/crm-supabase/managed-source-cold-approved.*managed-source-cold') {
    throw 'Managed-source cold mode must be bound to a protected remote approval marker.'
}
if ($source -notmatch '(?s)grep -Fxq ''backup_mode=\$\(\$script:BackupMode\)''.*\.crm-production-cutover-complete|\.crm-production-cutover-complete.*backup_mode=\$\(\$script:BackupMode\)') {
    throw 'Production marker must persist and validate the managed-source-cold backup mode.'
}
if ($source -notmatch "grep -Fxq 'recurring_backup=disabled'") {
    throw 'Production marker must state explicitly that recurring target backup is disabled.'
}
$storageSuccessPattern = "^Total: 3 buckets, [0-9]+ objetos, .+ conhecidos, [0-9]+ copiados, 0 falhas\.`$"
if (-not $source.Contains($storageSuccessPattern)) {
    throw 'Automated Storage copy must require one explicit zero-failure summary.'
}
foreach ($secretEnvironmentName in @('SOURCE_SERVICE_ROLE_KEY', 'TARGET_SERVICE_ROLE_KEY')) {
    if (-not $source.Contains("EnvironmentVariables['$secretEnvironmentName']")) {
        throw "Storage secret must reach Node through the child environment: $secretEnvironmentName"
    }
}
if ([regex]::Matches($source, [regex]::Escape('New-Object Text.UTF8Encoding($false)')).Count -lt 3) {
    throw 'Every PowerShell 5.1 stdin channel must disable the UTF-8 BOM.'
}
if ($source -match '(?<![0-9])344(?![0-9])') {
    throw 'Auth baseline must remain dynamic.'
}
if ($source -match '--expected-(?:nonempty|meta-readable|fallback-readable)\s+[''\"]?(?:102|84|18)(?![0-9])') {
    throw 'Meta rewrap counts must be recaptured from the final restore.'
}
if ($source.Contains('meta_valid=$($counts.Meta)') -or
    $source.Contains('fallback_valid=$($counts.Fallback)')) {
    throw 'Orchestrator still expects the pre-rewrap Meta/fallback marker semantics.'
}
$localFunctionCount = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'supabase\functions') -Directory |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'index.ts') -PathType Leaf }).Count
if ($localFunctionCount -ne 96 -or -not $source.Contains('$script:FunctionCount = 96')) {
    throw 'Production Function inventory must contain exactly 96 local slugs.'
}
$orderedStages = @(
    "Invoke-Stage 'storage_copied'",
    "Invoke-Stage 'post_restore'",
    "Invoke-Stage 'meta_rewrap_inventoried'",
    "Invoke-Stage 'meta_rewrap_dry_run'",
    "Invoke-Stage 'meta_rewrap_executed'",
    "Invoke-Stage 'meta_oracle_revoked'",
    "Invoke-Stage 'meta_fallback_removed'",
    "Invoke-Stage 'functions_started'",
    "Invoke-Stage 'target_validated'",
    "Invoke-Stage 'green_write_boundary'",
    "Invoke-Stage 'evolution_cutover'",
    "Invoke-Stage 'meta_cutover'",
    "Invoke-Stage 'cron_reminders'",
    "Invoke-Stage 'cron_redistribution'",
    "Invoke-Stage 'retention_enabled'",
    "Invoke-Stage 'frontend_live'",
    "Invoke-Stage 'production_marked'"
)
$previousIndex = -1
foreach ($stageLiteral in $orderedStages) {
    $currentIndex = $source.IndexOf($stageLiteral, [StringComparison]::Ordinal)
    if ($currentIndex -le $previousIndex) {
        throw "Irreversible cutover boundary is out of order: $stageLiteral"
    }
    $previousIndex = $currentIndex
}
$storageSource = [IO.File]::ReadAllText($storageScriptPath)
foreach ($contract in @(
    "const DISCARDED_BUCKET_ID = 'chat-media'",
    "SOURCE_SUPABASE_URL",
    "SOURCE_SERVICE_ROLE_KEY",
    "TARGET_SUPABASE_URL",
    "TARGET_SERVICE_ROLE_KEY",
    "STORAGE_BUCKETS",
    "case '--verify'",
    'upsert: true',
    'if (failures > 0) process.exitCode = 1'
)) {
    if (-not $storageSource.Contains($contract)) { throw "Storage API copier contract missing: $contract" }
}
$systemdInstallSource = [IO.File]::ReadAllText($systemdInstallPath)
foreach ($contract in @(
    'managed-source-cold',
    'crm-supabase-backup.timer',
    'crm-supabase-maintenance.timer',
    'crm-supabase-health.timer',
    'crm-supabase-chat-media-retention.timer'
)) {
    if (-not $systemdInstallSource.Contains($contract)) {
        throw "Managed-source cold systemd contract missing: $contract"
    }
}
if ($systemdInstallSource -notmatch '(?s)managed-source-cold.*systemctl disable --now[^\r\n]*(?:\\\r?\n\s*)?[^\r\n]*crm-supabase-backup\.timer[^\r\n]*crm-supabase-maintenance\.timer') {
    throw 'Managed-source cold mode must disable backup and Restic maintenance timers.'
}
if ($systemdInstallSource -notmatch '(?s)managed-source-cold.*systemctl enable --now[^\r\n]*(?:\\\r?\n\s*)?[^\r\n]*crm-supabase-chat-media-retention\.timer[^\r\n]*crm-supabase-health\.timer') {
    throw 'Managed-source cold mode must keep retention and production health timers enabled.'
}
$shellLibrarySource = [IO.File]::ReadAllText($shellLibraryPath)
foreach ($contract in @(
    '/etc/crm-supabase/managed-source-cold-approved',
    'env_file_value "$approval_file" status',
    "== 'approved'",
    'env_file_value "$approval_file" mode',
    "== 'managed-source-cold'",
    'env_file_value "$approval_file" project_ref',
    'env_file_value "$approval_file" approved_at_utc'
)) {
    if (-not $shellLibrarySource.Contains($contract)) {
        throw "Managed-source cold approval contract missing: $contract"
    }
}
if ($shellLibrarySource -notmatch '(?s)managed-source-cold-approved.*! -L|! -L.*managed-source-cold-approved') {
    throw 'Managed-source cold approval marker must reject symlinks.'
}
if ($shellLibrarySource -notmatch "stat -c '%u:%a'.*approval_file") {
    throw 'Managed-source cold approval marker must validate root ownership and mode 0600.'
}
if ($shellLibrarySource -notmatch "== '0:600'") {
    throw 'Managed-source cold approval marker must require exact root/0600 metadata.'
}

$healthcheckSource = [IO.File]::ReadAllText($healthcheckPath)
foreach ($contract in @(
    'managed-source-cold',
    'crm-supabase-backup.timer',
    'crm-supabase-maintenance.timer',
    'backup=$BACKUP_MODE'
)) {
    if (-not $healthcheckSource.Contains($contract)) {
        throw "Managed-source cold healthcheck contract missing: $contract"
    }
}
if ($healthcheckSource -notmatch '(?s)managed-source-cold.*crm-supabase-backup\.timer.*crm-supabase-maintenance\.timer') {
    throw 'Healthcheck must audit that recurring backup/maintenance stay disabled in managed-source-cold mode.'
}
if ($healthcheckSource -notmatch '(?s)managed-source-cold.*latest_marker|latest_marker.*managed-source-cold') {
    throw 'Local-backup freshness checks must be explicitly conditional on backup mode.'
}
if ($healthcheckSource -notmatch '(?s)managed-source-cold.*RESTIC_REPOSITORY|RESTIC_REPOSITORY.*managed-source-cold') {
    throw 'Restic checks must be explicitly conditional on backup mode.'
}
$targetValidationSource = [IO.File]::ReadAllText($targetValidationPath)
foreach ($contract in @(
    'pg_database_collation_actual_version',
    'pg_collation_actual_version',
    'database_collation_version_mismatch',
    'invalid_or_unready_indexes',
    'NOT index_state.indisvalid OR NOT index_state.indisready'
)) {
    if (-not $targetValidationSource.Contains($contract)) {
        throw "Target collation/index gate missing: $contract"
    }
}
foreach ($blockedLiteral in @(('Hurtz' + 'gestao'), ('troque_' + 'esta_chave'))) {
    if ($source.IndexOf($blockedLiteral, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
        throw 'Credential-like literal found in orchestrator.'
    }
}
if (-not (Test-Path -LiteralPath $metaScriptPath -PathType Leaf)) {
    throw 'Meta cutover script is missing.'
}
$metaSource = [IO.File]::ReadAllText($metaScriptPath)
foreach ($contract in @(
    'dry-run',
    'apply',
    'rollback',
    'historical_verify_token_validated=true',
    'https://uxttihjsxfowursjyult.supabase.co/functions/v1/facebook-leads-webhook',
    'https://api.kairozcrm.com.br/functions/v1/facebook-leads-webhook'
)) {
    if (-not $metaSource.Contains($contract)) { throw "Meta contract missing: $contract" }
}
if (-not (Test-Path -LiteralPath $rewrapScriptPath -PathType Leaf)) {
    throw 'Meta rewrap script is missing.'
}
$rewrapSource = [IO.File]::ReadAllText($rewrapScriptPath)
foreach ($contract in @(
    'source_meta_readable=$EXPECTED_META_READABLE',
    'source_fallback_readable=$EXPECTED_FALLBACK_READABLE',
    'fallback_rewrapped=$fallback_rewrapped_count',
    'meta_valid=$meta_valid_count',
    'fallback_valid=$fallback_valid_count',
    'changed=$changed_count'
)) {
    if (-not $rewrapSource.Contains($contract)) { throw "Rewrap marker contract missing: $contract" }
}

# Exercise the rollback dependency gate with every remote/provider operation
# mocked. A failed oracle cleanup must not stop independent provider checks,
# but it must keep the source closed and must not promote blue or close lease.
try { . $scriptPath -Confirm '__TEST_ONLY_INVALID_CONFIRMATION__' }
catch {
    if ($_.Exception.Message -notlike 'Corte recusado*') { throw }
}
$flattenedJson = @(ConvertFrom-CliJsonArray @('[{"slug":"one"},{"slug":"two"}]') 'synthetic CLI inventory')
if ($flattenedJson.Count -ne 2 -or $flattenedJson[0].slug -ne 'one' -or $flattenedJson[1].slug -ne 'two') {
    throw 'CLI JSON arrays must be flat under Windows PowerShell 5.1.'
}
$nativeStderr = @(Invoke-Native -Command $env:ComSpec -Arguments @(
    '/d', '/s', '/c', 'echo native-stderr-probe 1>&2 & exit /b 0'
) -Capture -Quiet)
if (($nativeStderr -join "`n") -notmatch 'native-stderr-probe') {
    throw 'Successful native stderr must be captured without becoming a terminating error.'
}

# Render and parse the new embedded Bash gates locally. Invoke-Remote is fully
# mocked, so this test cannot contact the VPS or any provider.
$bashCommand = Get-Command bash -ErrorAction SilentlyContinue
$bashPath = if ($bashCommand) { $bashCommand.Source } else { 'C:\Program Files\Git\bin\bash.exe' }
if (-not (Test-Path -LiteralPath $bashPath -PathType Leaf)) { throw 'Bash is required for embedded-script syntax tests.' }
$script:EmbeddedBashParses = 0
function Invoke-Remote {
    param([Parameter(Mandatory = $true, Position = 0)][string]$Script, [switch]$Capture, [switch]$Quiet)
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $bashPath
    $start.Arguments = '-n'
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $start
    try {
        [void]$process.Start()
        $process.StandardInput.Write($Script.Replace("`r`n", "`n").Replace("`r", "`n") + "`n")
        $process.StandardInput.Close()
        $stdout = $process.StandardOutput.ReadToEnd()
        $stderr = $process.StandardError.ReadToEnd()
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) { throw "Embedded Bash syntax failed: $stderr" }
        $script:EmbeddedBashParses++
        if ($Capture) { return @() }
    }
    finally { $process.Dispose() }
}
function Get-RemoteRun { return '/var/backups/crm-supabase/orchestrator/20260830T120000Z-1234abcd' }
$bashState = Join-Path ([IO.Path]::GetTempPath()) "crm-cutover-bash-test-$([Guid]::NewGuid().ToString('N'))"
[void](New-Item -ItemType Directory -Path $bashState)
try {
    $script:RunState = $bashState
    $script:ActiveRunId = '20260830T120000Z-1234abcd'
    Set-Artifact 'meta_rewrap_nonempty' '102'
    Set-Artifact 'meta_rewrap_meta' '84'
    Set-Artifact 'meta_rewrap_fallback' '18'
    Invoke-MetaRewrapExecute
    Remove-LegacyMetaFallback
    Assert-MetaRewrapPostFallback
    Assert-RemoteReadiness -ResumeMode -SkipMetaProviderCheck -SkipFreezeProviderCheck -SkipMetaRewrapSecretCheck
    Disable-TargetWorkersForRollback
    if ($script:EmbeddedBashParses -lt 6) { throw 'Not every embedded rewrap/rollback Bash gate was parsed.' }
}
finally { Remove-Item -LiteralPath $bashState -Recurse -Force }

$rollbackState = Join-Path ([IO.Path]::GetTempPath()) "crm-cutover-rollback-test-$([Guid]::NewGuid().ToString('N'))"
[void](New-Item -ItemType Directory -Path $rollbackState)
$script:RunState = $rollbackState
$script:ActiveRunId = '20260830T120000Z-1234abcd'
Assert-OrCaptureReleaseFingerprints
Assert-OrCaptureReleaseFingerprints
$script:TestPointerTags = New-Object 'System.Collections.Generic.List[string]'
$script:TestPromotions = 0
$script:TestLeaseClosures = 0
function Get-Artifact {
    param([string]$Name)
    if ($Name -eq 'blue_deployment') { return 'https://crm-definitivo-blue-test.vercel.app' }
    return $null
}
function Get-RemotePointerArtifact {
    param([string]$PointerName, [string]$Tag, [string]$PathPattern, [string]$RequiredFile)
    [void]$script:TestPointerTags.Add($Tag)
    return $null
}
function Get-RemoteProviderArtifact {
    param([string]$Provider)
    [void]$script:TestPointerTags.Add($(if ($Provider -eq 'Meta') { 'META' } else { 'EVOLUTION' }))
    return $null
}
function Remove-ManagedMetaOracle { throw 'simulated oracle cleanup failure' }
function Promote-Vercel { param([string]$Url); $script:TestPromotions++ }
function Complete-RemoteRollbackLease { $script:TestLeaseClosures++ }
function Set-VercelTextEnv { param([string]$Name, [string]$Value, [switch]$Sensitive) }
try {
    $rollbackFailed = $false
    try { Invoke-SafeRollback }
    catch {
        $rollbackFailed = $true
        if ($_.Exception.Message -notlike 'Rollback incompleto*') { throw }
    }
    if (-not $rollbackFailed) { throw 'Rollback fault injection should fail closed.' }
    if (-not (Test-Path -LiteralPath (State-Path 'rollback.started') -PathType Leaf)) {
        throw 'A rollback that began mutations must persist rollback.started.'
    }
    $forwardResumeBlocked = $false
    try { Assert-RunCanResumeForward }
    catch {
        $forwardResumeBlocked = $true
        if ($_.Exception.Message -notlike 'Este run iniciou rollback*') { throw }
    }
    if (-not $forwardResumeBlocked) {
        throw 'Forward resume must be rejected after a partial rollback.'
    }
    if ($script:TestPointerTags -notcontains 'META' -or $script:TestPointerTags -notcontains 'EVOLUTION') {
        throw 'Independent provider rollback checks did not continue after oracle failure.'
    }
    if ($script:TestPointerTags -contains 'SOURCE_FREEZE') {
        throw 'Source rollback ran without all routing prerequisites.'
    }
    if ($script:TestPromotions -ne 0 -or $script:TestLeaseClosures -ne 0) {
        throw 'Blue promotion/lease closure ran after an incomplete rollback.'
    }
}
finally {
    Remove-Item -LiteralPath $rollbackState -Recurse -Force
}
Write-Host 'PASS: orchestrator parses and fixed cutover contracts are present.'
