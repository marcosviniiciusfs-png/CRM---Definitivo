# Obsidian Vault Integration — Kairoz CRM

**Data:** 2026-04-27
**Status:** Aprovado

## Objetivo

Espelhar toda a documentação, specs, plans, edge functions, migrations e schema do projeto Kairoz CRM em um vault do Obsidian, criando um hub centralizado de conhecimento. Futuras ações realizadas pelo Claude devem ser registradas automaticamente no vault.

## Vault

- **Caminho:** `C:\Users\Brito\Desktop\principal\Projetos\Kairoz CRM`
- **MCP:** filesystem server já configurado via `.mcp.json`
- **Estado atual:** vault vazio, recém-criado
- **Repo:** `C:\Users\Brito\Desktop\principal\Kairoz\Teste - CRM Kairoz\CRM---Definitivo`

## Abordagem

Sync inicial completo + CLAUDE.md no vault com instruções para registro automático de futuras ações. Sem hooks, sem automação complexa — o registro acontece quando a sessão do Claude é iniciada pelo vault.

## Estrutura de Pastas

```
Kairoz CRM/
├── Home.md                          # Índice geral com wiki-links
├── Changelog.md                     # Log cronológico de mudanças
├── 01 - Specs/                      # Specs de design (23 arquivos)
├── 02 - Plans/                      # Plans de implementação (20 arquivos)
├── 03 - Edge Functions/             # Catálogo com Índice.md + 1 arquivo por função
├── 04 - Migrations/                 # Histórico com Índice.md + resumos
├── 05 - Database/                   # Schema Geral + Diagramas
├── 06 - Documentação/              # Visão Geral, Stack, Google Calendar Setup
└── .claude/
    └── CLAUDE.md                    # Instruções para registro automático
```

Pastas numeradas (01, 02...) para ordem visual no Obsidian. Specs e Plans primeiro por serem os mais consultados.

## Conteúdo a Ser Copiado

### 01 - Specs (23 arquivos)
Copiar todos os arquivos de `docs/superpowers/specs/` para `01 - Specs/`. Remover o sufixo `-design` do nome. Quando spec e plan têm o mesmo nome base, o arquivo de spec fica em `01 - Specs/` e o plan em `02 - Plans/` — sem conflito pois estão em pastas diferentes.

### 02 - Plans (20 arquivos)
Copiar todos os arquivos de `docs/superpowers/plans/` para `02 - Plans/`. Remover o sufixo `-plan` do nome se existir.

### 03 - Edge Functions
- `Índice.md` — tabela com nome, descrição, última modificação de cada function
- 1 arquivo `.md` por function com: propósito, endpoints, dependências, código-fonte resumido
- Source: `supabase/functions/*/index.ts`

### 04 - Migrations
- `Índice.md` — lista cronológica de migrations com data e descrição
- Arquivos individuais para migrations importantes
- Source: `supabase/migrations/*.sql`

### 05 - Database
- `Schema Geral.md` — conversão do `FULL_DATABASE_SCHEMA.sql` para markdown com tabelas organizadas
- `Diagramas.md` — diagramas de relacionamento em texto/mermaid

### 06 - Documentação
- `Visão Geral.md` — conteúdo de `DOCUMENTATION.md`
- `Stack Tecnológico.md` — detalhes extraídos da documentação
- `Google Calendar Setup.md` — conteúdo de `GOOGLE_CALENDAR_SETUP.md`

## Home.md

Página principal com wiki-links `[[ ]]` para todas as seções. Seções: status do projeto, documentação, specs (lista completa com links), plans (lista completa), edge functions, migrations, changelog. Cada item clicável navega diretamente para o arquivo.

## Changelog.md

Formato de cada entrada:
```
## 2026-04-27
- **[Spec]** Multi WhatsApp Channels — spec criada → [[2026-04-27-multi-whatsapp-channels]]
- **[Plan]** Multi WhatsApp Channels — plan criado → [[2026-04-27-multi-whatsapp-channels]]
- **[Fix]** Integrações — adaptar UI para modo claro
```

Alimentado automaticamente pelo Claude em cada sessão no vault.

## CLAUDE.md do Vault

Instruções para o Claude quando a sessão inicia pelo vault:

1. **Repo path:** `C:\Users\Brito\Desktop\principal\Kairoz\Teste - CRM Kairoz\CRM---Definitivo`
2. **Ao iniciar:** ler estado atualizado do repo via `git log`, atualizar Changelog com mudanças desde última sessão, copiar novos specs/plans
3. **Ao criar spec/plan:** salvar no repo E copiar para o vault, adicionar entrada no Changelog, atualizar Home.md
4. **Ao modificar edge function/migration:** atualizar arquivo no vault, adicionar entrada no Changelog
5. **Formato do Changelog:** data | tipo de ação | descrição | link para spec/plan
6. **Idioma:** Português (Brasil) em todas as notas

## Limitação

Se o trabalho for feito pelo repo original sem abrir pelo vault, o registro não é automático. Solução: pedir "sincroniza com o Obsidian" após concluir o trabalho.
