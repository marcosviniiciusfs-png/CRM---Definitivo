# KairoZ CRM — configuração do Obsidian

Este é o guia oficial para criar um vault Obsidian navegável a partir do repositório KairoZ CRM.

O Git continua sendo a fonte do código. O vault recebe snapshots somente para consulta, documentação e criação de links; mudanças feitas dentro do snapshot não voltam automaticamente para o repositório.

## O que o processo cria

```text
Meu Vault/
├─ .obsidian/
│  └─ app.json
├─ 00 - KairoZ - Início.md
├─ Guia - Configurar Obsidian.md
└─ Snapshots/
   └─ KairoZ-<commit>/
      ├─ SNAPSHOT.md
      ├─ src/
      ├─ supabase/
      ├─ docs/
      ├─ public/
      └─ arquivos de configuração
```

Cada commit gera uma pasta própria. O script nunca apaga snapshots anteriores; ele gerencia apenas a página inicial, a cópia deste guia e a opção que mostra arquivos de código no Obsidian.

## Pré-requisitos

- Git instalado.
- PowerShell.
- Obsidian Desktop.
- Repositório clonado e sem alterações locais pendentes.

Se ainda não tiver o projeto:

```powershell
git clone https://github.com/marcosviniiciusfs-png/CRM---Definitivo.git
Set-Location CRM---Definitivo
```

## Configuração rápida

1. Abra o PowerShell na raiz do repositório, onde ficam `package.json` e `.git`.
2. Copie e execute todo o bloco abaixo.
3. Informe a pasta do vault quando solicitado. Pode ser uma pasta vazia ou um vault já criado pelo Obsidian.

```powershell
$ErrorActionPreference = 'Stop'

# 1. Validar o repositório de origem
$Repo = [IO.Path]::GetFullPath((Get-Location).Path).TrimEnd('\')
$GitDirectory = Join-Path $Repo '.git'
$PackageFile = Join-Path $Repo 'package.json'

if (-not (Test-Path -LiteralPath $GitDirectory -PathType Container) -or
    -not (Test-Path -LiteralPath $PackageFile -PathType Leaf)) {
  throw 'Execute este bloco na raiz do repositório CRM---Definitivo.'
}

$DirtyFiles = @(git -C $Repo status --porcelain)
if ($LASTEXITCODE -ne 0) {
  throw 'Não foi possível consultar o Git.'
}
if ($DirtyFiles.Count -gt 0) {
  throw 'O repositório possui alterações locais. Faça commit ou stash antes de criar o snapshot.'
}

# 2. Escolher e proteger o destino
$VaultInput = Read-Host 'Caminho completo do vault Obsidian'
if ([string]::IsNullOrWhiteSpace($VaultInput)) {
  throw 'O caminho do vault é obrigatório.'
}

$VaultFullPath = [IO.Path]::GetFullPath($VaultInput)
if ($VaultFullPath.Equals([IO.Path]::GetPathRoot($VaultFullPath), [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Escolha uma pasta para o vault, não a raiz inteira de uma unidade.'
}
$Vault = $VaultFullPath.TrimEnd('\')
if ($Vault.Equals($Repo, [StringComparison]::OrdinalIgnoreCase) -or
    $Vault.StartsWith($Repo + '\', [StringComparison]::OrdinalIgnoreCase) -or
    $Repo.StartsWith($Vault + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'O repositório e o vault não podem estar dentro um do outro.'
}

New-Item -ItemType Directory -Path $Vault -Force | Out-Null

$Commit = (git -C $Repo rev-parse HEAD).Trim()
$ShortCommit = (git -C $Repo rev-parse --short=12 HEAD).Trim()
$Branch = (git -C $Repo branch --show-current).Trim()
if (-not $Commit -or -not $ShortCommit) {
  throw 'Não foi possível identificar o commit atual.'
}
if (-not $Branch) {
  $Branch = '(detached HEAD)'
}

$SnapshotRelative = "Snapshots/KairoZ-$ShortCommit"
$Snapshot = [IO.Path]::GetFullPath((Join-Path $Vault $SnapshotRelative)).TrimEnd('\')
if (-not $Snapshot.StartsWith($Vault + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'O destino calculado saiu do vault. Operação interrompida.'
}

# 3. Selecionar somente o conteúdo útil e seguro
$ExcludedPrefixes = @(
  '.claude/',
  '.playwright-mcp/',
  '.superpowers/',
  '.lovable/',
  '.obsidian/',
  '.git/',
  '.vercel/',
  'node_modules/',
  'dist/',
  'dist-ssr/',
  'coverage/',
  'migrations_backup/',
  'supabase/.temp/',
  'supabase/.branches/'
)

$ExcludedFiles = @(
  '.clauderules',
  'whatsapp-qr-code-working.png'
)

function Test-IsExcluded([string]$RelativePath) {
  $Normalized = $RelativePath.Replace('\', '/')
  if ($ExcludedFiles -contains $Normalized) {
    return $true
  }

  foreach ($Prefix in $ExcludedPrefixes) {
    if ($Normalized.StartsWith($Prefix, [StringComparison]::OrdinalIgnoreCase)) {
      return $true
    }
  }

  $Leaf = [IO.Path]::GetFileName($Normalized).ToLowerInvariant()
  $Extension = [IO.Path]::GetExtension($Leaf).ToLowerInvariant()
  return (
    $Leaf -eq '.env' -or
    $Leaf.StartsWith('.env.') -or
    $Leaf -match '^(secret|secrets|credential|credentials)(\..+)?$' -or
    $Extension -in @('.key', '.p12', '.pem', '.pfx')
  )
}

$Tracked = @(git -C $Repo ls-files)
$Selected = @(
  $Tracked | Where-Object { -not (Test-IsExcluded $_) }
)

if ($Selected.Count -eq 0) {
  throw 'Nenhum arquivo foi selecionado para o snapshot.'
}

# 4. Impedir que uma credencial privilegiada entre no vault
$TextExtensions = @(
  '.bat', '.cjs', '.cmd', '.conf', '.css', '.graphql', '.html', '.ini',
  '.js', '.json', '.jsx', '.md', '.mjs', '.properties', '.ps1', '.sh',
  '.sql', '.toml', '.ts', '.tsx', '.txt', '.xml', '.yaml', '.yml'
)
$DangerousFiles = New-Object System.Collections.Generic.HashSet[string]
$JwtPattern = 'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}'
$SecretPattern = @(
  'gh[pousr]_[A-Za-z0-9]{20,}'
  'github_pat_[A-Za-z0-9_]{20,}'
  'sk_live_[A-Za-z0-9]{16,}'
  'sb_secret_[A-Za-z0-9_-]{20,}'
  'xox[baprs]-[A-Za-z0-9-]{20,}'
  'AKIA[0-9A-Z]{16}'
  'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY'
) -join '|'

foreach ($RelativePath in $Selected) {
  $SourceFile = Join-Path $Repo $RelativePath
  $Extension = [IO.Path]::GetExtension($SourceFile).ToLowerInvariant()
  if (-not ($TextExtensions -contains $Extension) -and
      [IO.Path]::GetFileName($SourceFile) -ne '.gitignore') {
    continue
  }

  try {
    $Text = [IO.File]::ReadAllText($SourceFile)
  } catch {
    continue
  }

  if ([regex]::IsMatch($Text, $SecretPattern)) {
    [void]$DangerousFiles.Add($RelativePath)
  }

  foreach ($Match in [regex]::Matches($Text, $JwtPattern)) {
    try {
      $Payload = $Match.Value.Split('.')[1].Replace('-', '+').Replace('_', '/')
      while ($Payload.Length % 4) { $Payload += '=' }
      $Json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Payload)) |
        ConvertFrom-Json
      $HasRole = $Json.PSObject.Properties.Name -contains 'role'
      if ($HasRole -and $Json.role -ne 'anon') {
        [void]$DangerousFiles.Add($RelativePath)
      }
    } catch {
      # Tokens que não forem JWTs válidos não são impressos nem interrompem a leitura.
    }
  }
}

if ($DangerousFiles.Count -gt 0) {
  $List = ($DangerousFiles | Sort-Object) -join "`n - "
  throw "O snapshot foi bloqueado porque há possível material sensível em:`n - $List"
}

# 5. Criar um snapshot imutável por commit
if (-not (Test-Path -LiteralPath $Snapshot)) {
  $SnapshotParent = Join-Path $Vault 'Snapshots'
  New-Item -ItemType Directory -Path $SnapshotParent -Force | Out-Null
  $StagingName = '.building-KairoZ-' + $ShortCommit + '-' + [guid]::NewGuid().ToString('N')
  $Staging = [IO.Path]::GetFullPath((Join-Path $SnapshotParent $StagingName))
  if (-not $Staging.StartsWith($SnapshotParent + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'A pasta temporária calculada saiu do vault. Operação interrompida.'
  }
  New-Item -ItemType Directory -Path $Staging | Out-Null

  $Copied = 0
  $CopiedBytes = 0L
  try {
    foreach ($RelativePath in $Selected) {
      $SourceFile = [IO.Path]::GetFullPath((Join-Path $Repo $RelativePath))
      $DestinationFile = [IO.Path]::GetFullPath((Join-Path $Staging $RelativePath))

      if (-not $SourceFile.StartsWith($Repo + '\', [StringComparison]::OrdinalIgnoreCase) -or
          -not $DestinationFile.StartsWith($Staging + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "Caminho inseguro encontrado: $RelativePath"
      }

      if (-not (Test-Path -LiteralPath $SourceFile -PathType Leaf)) {
        throw "Arquivo versionado não encontrado: $RelativePath"
      }
      $SourceItem = Get-Item -LiteralPath $SourceFile
      if ($SourceItem.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw "Link simbólico não permitido no snapshot: $RelativePath"
      }

      $Parent = Split-Path -Parent $DestinationFile
      New-Item -ItemType Directory -Path $Parent -Force | Out-Null
      Copy-Item -LiteralPath $SourceFile -Destination $DestinationFile
      if ((Get-FileHash -LiteralPath $SourceFile).Hash -ne
          (Get-FileHash -LiteralPath $DestinationFile).Hash) {
        throw "A cópia não passou na verificação SHA-256: $RelativePath"
      }
      $Copied++
      $CopiedBytes += (Get-Item -LiteralPath $DestinationFile).Length
    }

    $CreatedAt = Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'
    $SizeInMb = [math]::Round($CopiedBytes / 1MB, 2)
    $SnapshotManifest = @(
      '# Snapshot KairoZ CRM'
      ''
      "- Branch: $Branch"
      "- Commit: $Commit"
      "- Criado em: $CreatedAt"
      "- Arquivos do projeto: $Copied"
      "- Tamanho: $SizeInMb MB"
      ''
      'Este diretório é uma cópia para consulta. Edite o repositório Git, não este snapshot.'
    ) -join [Environment]::NewLine
    Set-Content -LiteralPath (Join-Path $Staging 'SNAPSHOT.md') -Value $SnapshotManifest -Encoding UTF8

    $StagedFiles = @(Get-ChildItem -LiteralPath $Staging -Recurse -File)
    $ExpectedFiles = $Selected.Count + 1 # inclui SNAPSHOT.md
    if ($StagedFiles.Count -ne $ExpectedFiles) {
      throw "Validação falhou: esperado $ExpectedFiles arquivos, encontrado $($StagedFiles.Count)."
    }

    Move-Item -LiteralPath $Staging -Destination $Snapshot
  } catch {
    Write-Warning "A cópia incompleta foi preservada para diagnóstico em: $Staging"
    throw
  }
} else {
  $Copied = $Selected.Count
  Write-Host "O snapshot $ShortCommit já existe e foi preservado." -ForegroundColor Yellow
}

$SnapshotFiles = @(Get-ChildItem -LiteralPath $Snapshot -Recurse -File)
$ExpectedFiles = $Selected.Count + 1 # inclui SNAPSHOT.md
if ($SnapshotFiles.Count -ne $ExpectedFiles) {
  throw "Validação falhou: esperado $ExpectedFiles arquivos, encontrado $($SnapshotFiles.Count)."
}

# 6. Configurar o Obsidian para mostrar TS, TSX, SQL e demais extensões
$ObsidianDirectory = Join-Path $Vault '.obsidian'
$AppSettingsFile = Join-Path $ObsidianDirectory 'app.json'
New-Item -ItemType Directory -Path $ObsidianDirectory -Force | Out-Null

if (Test-Path -LiteralPath $AppSettingsFile) {
  try {
    $AppSettings = Get-Content -Raw -LiteralPath $AppSettingsFile | ConvertFrom-Json
  } catch {
    throw 'O .obsidian/app.json existente não contém JSON válido. Corrija-o antes de continuar.'
  }
} else {
  $AppSettings = [pscustomobject]@{}
}
if ($null -eq $AppSettings) {
  $AppSettings = [pscustomobject]@{}
}
if ($AppSettings -isnot [pscustomobject]) {
  throw 'O .obsidian/app.json precisa conter um objeto JSON.'
}

$AppSettings | Add-Member -NotePropertyName showUnsupportedFiles -NotePropertyValue $true -Force
$AppSettings | ConvertTo-Json -Depth 20 |
  Set-Content -LiteralPath $AppSettingsFile -Encoding UTF8

# 7. Criar/atualizar a página inicial do vault
$HomeFile = Join-Path $Vault '00 - KairoZ - Início.md'
$HomeContent = @(
  '---'
  'tags:'
  '  - kairoz'
  '  - crm'
  '  - projeto'
  "snapshot: $ShortCommit"
  '---'
  ''
  '# KairoZ CRM'
  ''
  "Snapshot atual: **$ShortCommit**, branch **$Branch**."
  ''
  '## Arquivos principais'
  ''
  "- [Rotas da aplicação](<$SnapshotRelative/src/App.tsx>)"
  "- [Pipeline](<$SnapshotRelative/src/pages/Pipeline.tsx>)"
  "- [Configuração de etapas](<$SnapshotRelative/src/components/FunnelStagesConfig.tsx>)"
  "- [Cliente Supabase](<$SnapshotRelative/src/integrations/supabase/client.ts>)"
  "- [Tipos do banco](<$SnapshotRelative/src/integrations/supabase/types.ts>)"
  "- [Migrations](<$SnapshotRelative/supabase/migrations>)"
  "- [Edge Functions](<$SnapshotRelative/supabase/functions>)"
  "- [Package](<$SnapshotRelative/package.json>)"
  "- [Manifesto do snapshot](<$SnapshotRelative/SNAPSHOT.md>)"
  '- [[Guia - Configurar Obsidian]]'
  ''
  '## Arquitetura'
  ''
  '```mermaid'
  'flowchart LR'
  '    U[Usuário] --> V[Vercel / SPA]'
  '    V --> R[React + Vite]'
  '    R --> S[Supabase JS]'
  '    S --> A[Auth]'
  '    S --> P[Postgres + RLS]'
  '    S --> E[Edge Functions]'
  '    E --> X[WhatsApp, Meta, Google e pagamentos]'
  '```'
  ''
  '## Regra de trabalho'
  ''
  'O Git é a fonte de verdade. Este snapshot serve para consulta e documentação no Obsidian.'
  ''
  '> [!danger]'
  '> Nunca coloque senhas, chaves privadas ou service_role no vault.'
) -join [Environment]::NewLine
Set-Content -LiteralPath $HomeFile -Value $HomeContent -Encoding UTF8

# Manter o guia disponível dentro do vault
Copy-Item -LiteralPath (Join-Path $Repo 'OBSIDIAN_SETUP.md') `
  -Destination (Join-Path $Vault 'Guia - Configurar Obsidian.md') -Force

# 8. Verificar o resultado
$SnapshotFiles = @(Get-ChildItem -LiteralPath $Snapshot -Recurse -File)
$ExpectedFiles = $Selected.Count + 1 # inclui SNAPSHOT.md
if ($SnapshotFiles.Count -ne $ExpectedFiles) {
  throw "Validação falhou: esperado $ExpectedFiles arquivos, encontrado $($SnapshotFiles.Count)."
}

Write-Host ''
Write-Host 'Vault configurado com sucesso.' -ForegroundColor Green
Write-Host "Vault: $Vault"
Write-Host "Snapshot: $ShortCommit"
Write-Host "Arquivos: $($SnapshotFiles.Count)"

# Abrir a página inicial, se o protocolo do Obsidian estiver instalado.
try {
  $ObsidianUri = 'obsidian://open?path=' + [Uri]::EscapeDataString($HomeFile)
  Start-Process $ObsidianUri
} catch {
  Write-Warning 'Não foi possível abrir o Obsidian automaticamente. Abra o vault manualmente.'
}
```

## O que entra no snapshot

- `src/`: páginas, componentes, hooks, contextos, estilos e integrações.
- `supabase/`: migrations ativas, Edge Functions, configuração e testes.
- `docs/`: especificações e planos técnicos.
- `public/`: assets usados pelo produto.
- `tests/`: testes versionados.
- Configurações de TypeScript, Vite, Tailwind, Vercel, ESLint e dependências.

## O que fica de fora

| Caminho | Motivo |
|---|---|
| `.git/` | Histórico do Git; o repositório original continua sendo a fonte. |
| `node_modules/` | Dependências regeneráveis e muito grandes. |
| `dist/` | Build gerado. |
| `.claude/` | Tooling local e arquivo com credenciais administrativas. |
| `.playwright-mcp/` | Capturas que podem conter dados pessoais de clientes. |
| `.superpowers/` | Estado de ferramentas locais. |
| `.lovable/` | Plano residual e obsoleto do Lovable. |
| `migrations_backup/` | Backups históricos; as migrations ativas são preservadas. |
| `supabase/.temp/` | Metadados locais do Supabase CLI. |
| `whatsapp-qr-code-working.png` | QR potencialmente associado a uma conta. |
| `.env`, logs e caches | Arquivos locais ignorados pelo Git. |

## Mapa rápido do KairoZ

- Entrada e providers: `src/main.tsx`.
- Rotas e guards: `src/App.tsx`.
- Pipeline: `src/pages/Pipeline.tsx`.
- Configuração dos funis: `src/pages/FunnelBuilder.tsx` e `src/components/FunnelStagesConfig.tsx`.
- Leads: `src/pages/LeadDetails.tsx` e modais em `src/components/`.
- Chat e WhatsApp: `src/pages/Chat.tsx`, `src/components/chat/` e Edge Functions relacionadas.
- Distribuição: `src/pages/LeadDistribution.tsx`, `src/components/distribution/` e `src/components/roulette/`.
- Tarefas e reuniões: `src/pages/Tasks.tsx`, `src/pages/Reunioes.tsx` e hooks Kanban.
- Administração: páginas `Admin*`, `Colaboradores`, `Equipes` e `Settings`.
- Banco: `supabase/migrations/` e `src/integrations/supabase/types.ts`.
- Integrações privilegiadas: `supabase/functions/`.

## Como atualizar o vault

1. Atualize o repositório e deixe o worktree limpo.
2. Execute novamente o bloco de configuração.
3. Um novo diretório `Snapshots/KairoZ-<commit>` será criado.
4. A página `00 - KairoZ - Início.md` passará a apontar para o commit novo.
5. O snapshot anterior continuará disponível para comparação.

Não copie manualmente `node_modules`, `.git`, `.env` ou arquivos de sessão para o vault.

## Segurança

- O repositório é público; trate qualquer segredo versionado como comprometido.
- O scanner do script é uma barreira adicional, não substitui uma auditoria com `gitleaks` nem a rotação de chaves expostas.
- Migrations podem conter e-mails e identificadores reais; trate o vault como código confidencial e nunca o publique ou sincronize para um destino público.
- Nunca sincronize um vault com credenciais por Obsidian Sync, OneDrive ou outro serviço.
- Use somente nomes de variáveis ao documentar secrets.
- Antes de publicar o vault, execute uma auditoria de segredos e dados pessoais.
- A chave `anon` do Supabase é pública por desenho; `service_role` nunca é pública.
- Mudanças de banco devem usar migrations revisadas e o projeto correto.
- Exclusões de etapas do funil exigem análise de leads relacionados e plano de recuperação.

## Solução de problemas

### Os arquivos `.ts`, `.tsx` ou `.sql` não aparecem

Abra **Configurações → Arquivos e links → Mostrar todos os tipos de arquivo**. O script também define `showUnsupportedFiles: true` em `.obsidian/app.json`.

### O script diz que o repositório está sujo

Use `git status` e faça commit ou stash. O snapshot precisa corresponder exatamente a um commit identificável.

### O script bloqueou um arquivo sensível

Não contorne a validação. Remova ou rotacione a credencial no repositório e no histórico Git antes de tentar novamente.

### O snapshot do commit já existe

Isso é esperado. O script preserva o snapshot existente e apenas atualiza a página inicial e as configurações do vault.

### Ficou uma pasta `.building-KairoZ-*`

A cópia foi interrompida antes da publicação do snapshot. Preserve a pasta para diagnóstico ou remova somente essa pasta temporária depois de revisar o erro; ao executar novamente, o script cria outra staging isolada.

## Manutenção deste guia

Atualize este arquivo quando houver mudanças em:

- estrutura das pastas;
- processo de deploy;
- gerenciador de pacotes;
- políticas de segurança;
- localização de migrations e Edge Functions;
- processo de criação ou atualização do vault.

Não inclua valores reais de tokens, senhas ou chaves neste documento.
