# Obsidian Vault Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Espelhar toda a documentação do Kairoz CRM em um vault Obsidian, com registro automático de futuras ações via CLAUDE.md.

**Architecture:** Sync one-way do repo para o vault. O vault é read-only espelho — o repo continua a fonte de verdade. CLAUDE.md no vault instrui futuras sessões do Claude a manter o espelho atualizado.

**Tech Stack:** Bash (cp), Markdown, Obsidian wiki-links

**Repo:** `C:\Users\Brito\Desktop\principal\Kairoz\Teste - CRM Kairoz\CRM---Definitivo`
**Vault:** `C:\Users\Brito\Desktop\principal\Projetos\Kairoz CRM`

---

## File Structure

```
Vault (Kairoz CRM)/
├── Home.md                              # CREATE — índice com wiki-links
├── Changelog.md                         # CREATE — log cronológico
├── 01 - Specs/                          # CREATE — 24 specs copiadas
│   ├── 2026-03-28-code-review-fixes.md
│   ├── ...
│   └── 2026-04-27-obsidian-vault-integration.md
├── 02 - Plans/                          # CREATE — 19 plans copiados
│   ├── 2026-03-28-code-review-fixes.md
│   ├── ...
│   └── 2026-04-27-multi-whatsapp-channels.md
├── 03 - Edge Functions/                 # CREATE — índice + 51 resumos
│   ├── Índice.md
│   ├── admin-auth.md
│   └── ...
├── 04 - Migrations/                     # CREATE — índice com 73 entradas
│   └── Índice.md
├── 05 - Database/                       # CREATE — schema em markdown
│   └── Schema Geral.md
├── 06 - Documentação/                   # CREATE — docs convertidas
│   ├── Visão Geral.md
│   └── Google Calendar Setup.md
└── .claude/
    └── CLAUDE.md                        # CREATE — instruções de automação
```

---

### Task 1: Criar estrutura de pastas no vault

**Files:**
- Create: pastas `01 - Specs/` até `06 - Documentação/` e `.claude/`

- [ ] **Step 1: Criar todas as pastas**

Run:
```bash
VAULT="c:/Users/Brito/Desktop/principal/Projetos/Kairoz CRM"
mkdir -p "$VAULT/01 - Specs" "$VAULT/02 - Plans" "$VAULT/03 - Edge Functions" "$VAULT/04 - Migrations" "$VAULT/05 - Database" "$VAULT/06 - Documentação" "$VAULT/.claude"
```

Expected: todas as pastas criadas sem erros

- [ ] **Step 2: Verificar estrutura**

Run: `ls "c:/Users/Brito/Desktop/principal/Projetos/Kairoz CRM/"`

Expected: pastas `01 - Specs` até `06 - Documentação` e `.claude` listadas

---

### Task 2: Copiar 24 specs para o vault

**Files:**
- Create: 24 arquivos em `01 - Specs/` (nomes sem o sufixo `-design`)

- [ ] **Step 1: Copiar specs removendo o sufixo `-design` do nome**

Run:
```bash
REPO="c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo"
VAULT="c:/Users/Brito/Desktop/principal/Projetos/Kairoz CRM"

for f in "$REPO/docs/superpowers/specs/"*-design.md; do
  base=$(basename "$f" -design.md)
  cp "$f" "$VAULT/01 - Specs/${base}.md"
done
```

Expected: 24 arquivos em `01 - Specs/` com nomes limpos (ex: `2026-04-27-obsidian-vault-integration.md`)

- [ ] **Step 2: Verificar contagem**

Run: `ls "c:/Users/Brito/Desktop/principal/Projetos/Kairoz CRM/01 - Specs/" | wc -l`

Expected: 24

---

### Task 3: Copiar 19 plans para o vault

**Files:**
- Create: 19 arquivos em `02 - Plans/`

- [ ] **Step 1: Copiar plans**

Run:
```bash
REPO="c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo"
VAULT="c:/Users/Brito/Desktop/principal/Projetos/Kairoz CRM"

cp "$REPO"/docs/superpowers/plans/*.md "$VAULT/02 - Plans/"
```

Expected: 19 arquivos em `02 - Plans/`

- [ ] **Step 2: Verificar contagem**

Run: `ls "c:/Users/Brito/Desktop/principal/Projetos/Kairoz CRM/02 - Plans/" | wc -l`

Expected: 19

---

### Task 4: Criar Índice de Edge Functions

**Files:**
- Create: `03 - Edge Functions/Edge Functions - Índice.md`

- [ ] **Step 1: Ler uma function de exemplo para entender o formato**

Read: `supabase/functions/admin-auth/index.ts`

- [ ] **Step 2: Criar Índice com tabela de todas as 51 funções**

Write `03 - Edge Functions/Edge Functions - Índice.md` com a tabela abaixo. Cada linha tem: nome, propósito, categorias (admin, whatsapp, leads, billing, calendar, facebook, utils).

O arquivo deve conter uma tabela markdown com colunas: `| Função | Propósito | Categoria |` seguida de uma linha por função. O propósito de cada função deve ser extraído lendo o `index.ts` de cada uma.

- [ ] **Step 3: Criar resumo individual de cada edge function**

Para cada uma das 51 funções, ler o `index.ts` e criar um arquivo `.md` com:
- Propósito (1 frase)
- Endpoints/serviços externos que chama
- Tabelas do banco que acessa
- Código-fonte completo do `index.ts` dentro de um bloco de código

Escrever um script bash que itera sobre cada pasta de função, lê o index.ts, e gera o markdown automaticamente:

```bash
REPO="c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo"
VAULT="c:/Users/Brito/Desktop/principal/Projetos/Kairoz CRM"

for dir in "$REPO/supabase/functions/"*/; do
  [ "$(basename "$dir")" = "_shared" ] && continue
  name=$(basename "$dir")
  ts_file="$dir/index.ts"
  [ ! -f "$ts_file" ] && continue

  code=$(cat "$ts_file")

  cat > "$VAULT/03 - Edge Functions/${name}.md" <<HEREDOC
# ${name}

\`\`\`typescript
${code}
\`\`\`
HEREDOC
done
```

Expected: 51 arquivos `.md` em `03 - Edge Functions/`

- [ ] **Step 4: Verificar contagem**

Run: `ls "c:/Users/Brito/Desktop/principal/Projetos/Kairoz CRM/03 - Edge Functions/" | grep -v "Índice" | wc -l`

Expected: 51

---

### Task 5: Criar Índice de Migrations

**Files:**
- Create: `04 - Migrations/Migrations - Índice.md`

- [ ] **Step 1: Criar índice listando as 73 migrations**

Gerar um script que lê o cabeçalho (primeiras 5 linhas) de cada migration SQL e extrai comentários descritivos:

```bash
REPO="c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo"
VAULT="c:/Users/Brito/Desktop/principal/Projetos/Kairoz CRM"

echo "# Índice de Migrations" > "$VAULT/04 - Migrations/Migrations - Índice.md"
echo "" >> "$VAULT/04 - Migrations/Migrations - Índice.md"
echo "| Data | Migration | Descrição |" >> "$VAULT/04 - Migrations/Migrations - Índice.md"
echo "|------|-----------|-----------|" >> "$VAULT/04 - Migrations/Migrations - Índice.md"

for f in "$REPO/supabase/migrations/"*.sql; do
  base=$(basename "$f")
  date_part=$(echo "$base" | sed 's/\(^[0-9]\{4\}\)\([0-9]\{2\}\)\([0-9]\{2\}\).*/\1-\2-\3/')
  desc=$(echo "$base" | sed 's/^[0-9]*_//' | sed 's/\.sql$//' | tr '_' ' ')
  echo "| ${date_part} | ${base} | ${desc} |" >> "$VAULT/04 - Migrations/Migrations - Índice.md"
done
```

Expected: tabela com 73 linhas de migrations

- [ ] **Step 2: Verificar conteúdo**

Run: `wc -l "c:/Users/Brito/Desktop/principal/Projetos/Kairoz CRM/04 - Migrations/Migrations - Índice.md"`

Expected: ~76 linhas (3 de header + 73 de dados)

---

### Task 6: Criar documentação de Database

**Files:**
- Create: `05 - Database/Schema Geral.md`

- [ ] **Step 1: Converter FULL_DATABASE_SCHEMA.sql para markdown**

Read: `FULL_DATABASE_SCHEMA.sql` — converter cada bloco `CREATE TABLE` em uma seção markdown com tabela de colunas. O arquivo tem 47KB, então processar por seções.

Write `05 - Database/Schema Geral.md` com:
- Título: `# Schema do Banco de Dados — Kairoz CRM`
- Para cada tabela: `## nome_da_tabela`, seguido de uma tabela markdown com colunas (Coluna, Tipo, Restrições)
- Incluir comentários sobre índices e políticas RLS quando presentes no SQL

- [ ] **Step 2: Verificar que o arquivo foi criado e contém tabelas**

Run: `grep -c "^## " "c:/Users/Brito/Desktop/principal/Projetos/Kairoz CRM/05 - Database/Schema Geral.md"`

Expected: número correspondente às tabelas no schema

---

### Task 7: Criar seção de Documentação

**Files:**
- Create: `06 - Documentação/Visão Geral.md`
- Create: `06 - Documentação/Google Calendar Setup.md`

- [ ] **Step 1: Copiar DOCUMENTATION.md como Visão Geral.md**

Run:
```bash
REPO="c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo"
VAULT="c:/Users/Brito/Desktop/principal/Projetos/Kairoz CRM"
cp "$REPO/DOCUMENTATION.md" "$VAULT/06 - Documentação/Visão Geral.md"
```

- [ ] **Step 2: Copiar GOOGLE_CALENDAR_SETUP.md**

Run:
```bash
REPO="c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo"
VAULT="c:/Users/Brito/Desktop/principal/Projetos/Kairoz CRM"
cp "$REPO/GOOGLE_CALENDAR_SETUP.md" "$VAULT/06 - Documentação/Google Calendar Setup.md"
```

- [ ] **Step 3: Verificar arquivos criados**

Run: `ls "c:/Users/Brito/Desktop/principal/Projetos/Kairoz CRM/06 - Documentação/"`

Expected: `Visão Geral.md` e `Google Calendar Setup.md`

---

### Task 8: Criar Home.md

**Files:**
- Create: `Home.md`

- [ ] **Step 1: Escrever Home.md com wiki-links para todas as seções**

Write `Home.md` com o conteúdo abaixo. Os wiki-links `[[ ]]` apontam para arquivos no vault.

```markdown
# Kairoz CRM

## Status do Projeto
- **Stack:** React 18 + TypeScript + Supabase + Tailwind CSS
- **Repo:** `CRM---Definitivo`
- **Última atualização:** 2026-04-27

---

## Documentação
- [[Visão Geral]] — arquitetura, stack, funcionalidades
- [[Google Calendar Setup]] — configuração de integração Google Calendar
- [[Schema Geral]] — estrutura completa do banco de dados

## Specs de Design (24)
- [[2026-03-28-code-review-fixes]]
- [[2026-03-31-dashboard-design]]
- [[2026-03-31-whatsapp-integration-fix]]
- [[2026-04-01-funnel-pagination]]
- [[2026-04-01-landing-page-redesign]]
- [[2026-04-02-pipeline-list-view]]
- [[2026-04-07-mobile-responsiveness]]
- [[2026-04-07-redistribution-progress-and-fixes]]
- [[2026-04-08-admin-clients-auth-redesign]]
- [[2026-04-10-redistribute-collaborator-leads]]
- [[2026-04-10-redistribution-roulette-fix]]
- [[2026-04-16-lead-import-deduplication]]
- [[2026-04-16-whatsapp-connection-stability]]
- [[2026-04-18-broadcast-whatsapp]]
- [[2026-04-18-equipes-redesign]]
- [[2026-04-18-mobile-pipeline-black-screen-fix]]
- [[2026-04-18-rolette-rules-fix]]
- [[2026-04-20-announcements]]
- [[2026-04-20-pipeline-scroll-fix]]
- [[2026-04-20-producao-dashboard-redesign]]
- [[2026-04-20-ranking-team-visibility]]
- [[2026-04-27-integrations-light-mode]]
- [[2026-04-27-multi-whatsapp-channels]]
- [[2026-04-27-obsidian-vault-integration]]

## Plans de Implementação (19)
- [[2026-03-28-code-review-fixes]]
- [[2026-03-31-dashboard-redesign]]
- [[2026-03-31-whatsapp-integration-fix]]
- [[2026-04-01-funnel-pagination-implementation]]
- [[2026-04-01-landing-page-redesign]]
- [[2026-04-02-pipeline-list-view-implementation]]
- [[2026-04-07-mobile-responsiveness]]
- [[2026-04-07-redistribution-progress-and-fixes]]
- [[2026-04-08-admin-clients-auth-redesign]]
- [[2026-04-10-redistribution-roulette-fix]]
- [[2026-04-18-broadcast-whatsapp]]
- [[2026-04-18-equipes-redesign]]
- [[2026-04-18-mobile-pipeline-black-screen-fix]]
- [[2026-04-18-rolette-rules-fix]]
- [[2026-04-18-whatsapp-evolution-hardening]]
- [[2026-04-20-announcements]]
- [[2026-04-20-producao-dashboard-redesign]]
- [[2026-04-20-ranking-team-visibility]]
- [[2026-04-27-multi-whatsapp-channels]]

## Edge Functions (51)
- [[Índice]] — catálogo completo de Edge Functions

## Migrations (73)
- [[Migrations - Índice]] — histórico cronológico completo

## Changelog
- [[Changelog]] — todas as mudanças em ordem cronológica
```

Nota: Os wiki-links do Obsidian buscam por nome de arquivo em qualquer pasta, então `[[2026-04-27-obsidian-vault-integration]]` vai encontrar `01 - Specs/2026-04-27-obsidian-vault-integration.md`.

---

### Task 9: Criar Changelog.md

**Files:**
- Create: `Changelog.md`

- [ ] **Step 1: Escrever Changelog inicial com o histórico de git**

Extrair o histórico de commits do repo e formatar como changelog. Cada entrada tem data, tipo e descrição.

Write `Changelog.md` com:
```markdown
# Changelog — Kairoz CRM

Histórico cronológico de mudanças no projeto. Atualizado automaticamente pelo Claude.

---
```

Depois, extrair os últimos commits do git para popular o changelog:

```bash
cd "c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo"
git log --pretty=format:"%ad | %s" --date=short | head -50
```

E formatar cada linha como uma entrada no changelog com wiki-links quando aplicável.

---

### Task 10: Criar CLAUDE.md no vault

**Files:**
- Create: `.claude/CLAUDE.md`

- [ ] **Step 1: Escrever CLAUDE.md com instruções de automação**

Write `.claude/CLAUDE.md`:

```markdown
# Instruções — Vault Obsidian Kairoz CRM

## Contexto
Este vault é um espelho do projeto Kairoz CRM. O repo original fica em:
`C:\Users\Brito\Desktop\principal\Kairoz\Teste - CRM Kairoz\CRM---Definitivo`

## Idioma
- Sempre escrever notas em Português (Brasil)

## Ao iniciar uma sessão neste vault
1. Verificar o `git log` do repo para identificar mudanças desde a última sessão
2. Se houver novas specs em `docs/superpowers/specs/`, copiar para `01 - Specs/` (remover sufixo `-design`)
3. Se houver novos plans em `docs/superpowers/plans/`, copiar para `02 - Plans/`
4. Se houver novas edge functions em `supabase/functions/`, criar resumo em `03 - Edge Functions/`
5. Se houver novas migrations em `supabase/migrations/`, adicionar ao `04 - Migrations/Migrations - Índice.md`
6. Atualizar `Changelog.md` com as mudanças encontradas
7. Atualizar `Home.md` se novas specs/plans foram adicionados

## Ao criar uma spec
1. Salvar a spec no repo em `docs/superpowers/specs/`
2. Copiar para `01 - Specs/` neste vault (remover sufixo `-design` do nome)
3. Adicionar entrada no `Changelog.md`
4. Adicionar link no `Home.md` na seção de Specs

## Ao criar um plan
1. Salvar o plan no repo em `docs/superpowers/plans/`
2. Copiar para `02 - Plans/` neste vault
3. Adicionar entrada no `Changelog.md`
4. Adicionar link no `Home.md` na seção de Plans

## Ao modificar edge functions
1. Atualizar o arquivo em `03 - Edge Functions/`
2. Adicionar entrada no `Changelog.md`

## Ao executar migrations
1. Adicionar entrada em `04 - Migrations/Migrations - Índice.md`
2. Adicionar entrada no `Changelog.md`

## Formato do Changelog
Cada entrada:
```
## YYYY-MM-DD
- **[Tipo]** Descrição da mudança → [[link-para-arquivo]]
```

Tipos: Spec, Plan, Feature, Fix, Refactor, Migration, Edge Function, Docs
```

- [ ] **Step 2: Verificar que CLAUDE.md foi criado**

Run: `cat "c:/Users/Brito/Desktop/principal/Projetos/Kairoz CRM/.claude/CLAUDE.md" | head -5`

Expected: header com `# Instruções`

---

### Task 11: Verificação final e commit

- [ ] **Step 1: Verificar estrutura completa do vault**

Run: `find "c:/Users/Brito/Desktop/principal/Projetos/Kairoz CRM" -name "*.md" | wc -l`

Expected: ~100+ arquivos markdown (24 specs + 19 plans + 51 edge functions + 3 índices + 2 docs + Home + Changelog + CLAUDE.md)

- [ ] **Step 2: Verificar que o vault abre no Obsidian**

Abrir o Obsidian e confirmar que:
- Home.md aparece na raiz
- Todas as pastas numeradas aparecem
- Wiki-links no Home.md navegáveis

- [ ] **Step 3: Commit da spec no repo**

Run:
```bash
cd "c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo"
git add docs/superpowers/specs/2026-04-27-obsidian-vault-integration-design.md docs/superpowers/plans/2026-04-27-obsidian-vault-integration.md
git commit -m "docs: spec e plan para integração com Obsidian vault"
```
