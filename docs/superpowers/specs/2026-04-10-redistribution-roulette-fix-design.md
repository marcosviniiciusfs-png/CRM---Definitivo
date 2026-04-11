# Correção de Redistribuição + Sistema de Lotes com Escolha de Roleta

**Data**: 2026-04-10
**Status**: Aprovado

## Problema

A redistribuição de leads (manual e automática) envia todos os leads para um único colaborador ao invés de distribuir entre os colaboradores da roleta. O usuário não pode escolher qual roleta usar na redistribuição, nem re-fazer distribuições anteriores com uma roleta diferente.

## Objetivos

1. Corrigir o bug de leads indo para um só colaborador
2. Permitir escolher qual roleta usar ao redistribuir
3. Permitir re-distribuir lotes anteriores com uma roleta diferente
4. Adicionar aba de histórico de redistribuições na seção Roletas
5. Implementação leve, mínimo consumo de banco

## Seção 1: Correção do Bug

### Problema 1 — Query de capacidade sem filtro de organização
Em `getAvailableAgentsFast` (linha 385-390 de `redistribute-unassigned-leads`), a query de contagem de leads por agente não filtra por `organization_id`. Isso pode fazer agentes aparecerem "cheios" quando não estão, sobrando apenas 1 disponível.

**Correção**: Adicionar `.eq('organization_id', organization_id)` na query de contagem.

### Problema 2 — Sem escolha de roleta
A função de redistribuição não aceita `config_id` como parâmetro. Usa `findBestConfig` automaticamente. Se só uma roleta está ativa, todos os leads vão pela mesma.

**Correção**: Aceitar `config_id` opcional. Se fornecido, usar essa roleta ao invés de `findBestConfig`.

## Seção 2: Modelo de Dados

### Nova tabela: `redistribution_batches`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | UUID (PK, default gen_random_uuid()) | ID do lote |
| `organization_id` | UUID (FK organizations) | Organização |
| `config_id` | UUID (FK lead_distribution_configs, nullable) | Roleta usada (null se automático) |
| `created_by` | UUID (FK auth.users, nullable) | Usuário que disparou (null se automático) |
| `batch_type` | TEXT NOT NULL | `manual` / `auto` / `redistribution` |
| `total_leads` | INTEGER NOT NULL DEFAULT 0 | Total de leads no lote |
| `status` | TEXT NOT NULL DEFAULT 'completed' | `completed` / `redistributed` |
| `created_at` | TIMESTAMPTZ DEFAULT now() | Quando ocorreu |

**Índices**:
- `idx_redistribution_batches_org` ON (organization_id, created_at DESC)
- `idx_redistribution_batches_config` ON (config_id)

### Alteração em tabela existente: `lead_distribution_history`

Adicionar coluna:
- `batch_id` UUID NULLABLE FK → `redistribution_batches(id)`

### Consultas habilitadas

- Listar lotes: `SELECT * FROM redistribution_batches WHERE organization_id = X ORDER BY created_at DESC`
- Leads de um lote: `SELECT lead_id FROM lead_distribution_history WHERE batch_id = X`
- Re-distribuir: pegar leads do lote, resetar `responsavel_user_id`, distribuir entre colaboradores da roleta escolhida

## Seção 3: Edge Functions

### Modificações em `redistribute-unassigned-leads`

1. Aceitar parâmetro opcional `config_id` no body
   - Se fornecido, usar essa roleta ao invés de `findBestConfig`
   - Se não fornecido, comportamento atual (melhor match automático)
2. Criar registro em `redistribution_batches` no início da redistribuição
3. Gravar `batch_id` em cada registro de `lead_distribution_history`
4. Corrigir `getAvailableAgentsFast`: adicionar filtro `organization_id` na query de capacidade

### Nova Edge Function: `redistribute-batch`

Responsável por re-distribuir um lote existente.

**Parâmetros de entrada**:
- `batch_id` (UUID) — lote original a re-distribuir
- `config_id` (UUID) — roleta escolhida para a nova distribuição
- `organization_id` (UUID)

**Fluxo**:
1. Validar que o lote existe e `status = 'completed'`
2. Buscar leads do lote via `lead_distribution_history WHERE batch_id = X`
3. Filtrar: excluir leads em estágios `won`/`lost`
4. Filtrar: só resetar leads que ainda estão com o mesmo colaborador da distribuição original
5. Buscar colaboradores da roleta escolhida (`eligible_agents` da config)
6. Distribuir em round-robin direto (sem regras de capacidade/horário)
7. Atualizar leads com novo `responsavel_user_id`
8. Marcar lote original como `status = 'redistributed'`
9. Criar novo lote com `batch_type = 'redistribution'`
10. Registrar histórico com o novo `batch_id`

**Sem regras de capacidade/horário** — distribuição direta entre os colaboradores da roleta.

## Seção 4: Frontend

### Nova aba na página de Roletas

Hoje: Roletas | Configuração de Agentes | Histórico

Fica: **Roletas | Configuração de Agentes | Histórico | Redistribuições**

### Novo componente: `RedistributionBatches.tsx`

Lista de cards de lotes, ordenados do mais recente ao mais antigo.

Cada card mostra:
- Data/hora da redistribuição
- Tipo (manual / automática / redistribuição)
- Roleta usada (nome)
- Quantidade de leads
- Status: `completed` (badge verde) ou `redistributed` (badge cinza)
- Botão **"Re-distribuir"** (só aparece se status = `completed`)

Ao clicar "Re-distribuir":
1. Abre dialog com as roletas ativas da organização
2. Usuário escolhe a roleta
3. Confirma a ação
4. Chama Edge Function `redistribute-batch`
5. Atualiza a lista

### Novo componente: `RedistributeBatchDialog.tsx`

Dialog reutilizável para escolha de roleta. Usado em dois fluxos:
1. Re-distribuir lote existente
2. Redistribuir leads sem responsável

Mostra lista de roletas ativas com nome, método e quantidade de colaboradores. Se só tem 1 roleta ativa, pula o dialog e usa ela direto.

### Seletor de roleta na redistribuição manual (leads sem responsável)

Hoje o botão "Redistribuir agora" redistribui direto.

Novo comportamento:
- Se só 1 roleta ativa: redistribui direto com ela (sem dialog)
- Se 2+ roletas ativas: abre `RedistributeBatchDialog` para escolher
- Opção "Automático" usa o `findBestConfig` atual

### Queries do frontend (leves)

- Lotes: `SELECT * FROM redistribution_batches WHERE organization_id = X ORDER BY created_at DESC LIMIT 50`
- Roletas ativas: já é buscada pelo `LeadDistributionList` existente (cache do React Query)
- Sem joins pesados, sem carregar leads individuais na lista

## Seção 5: Casos Extremos e Validações

1. **Re-distribuir lote já redistribuído**: Só permite `status = 'completed'`. Lotes `redistributed` mostram badge cinza sem botão.

2. **Lead re-atribuído manualmente**: Só reseta leads que ainda estão com o mesmo colaborador da distribuição original. Leads movidos manualmente não são afetados.

3. **Roleta sem colaboradores**: Dialog mostra aviso e bloqueia a ação se a roleta não tem `eligible_agents`.

4. **Leads em ganho/perdido**: Excluídos automaticamente da re-distribuição.

5. **Concorrência**: Verificação de status antes de processar. Se dois usuários tentam o mesmo lote, o segundo recebe erro "Lote já redistribuído".

6. **Performance**: Batch processing no backend. Limite de 500 leads por lote. Frontend só mostra progresso.

## Arquivos a modificar/criar

### Banco de dados (migration)
- Nova tabela `redistribution_batches`
- Coluna `batch_id` em `lead_distribution_history`
- Índices

### Edge Functions
- Modificar: `supabase/functions/redistribute-unassigned-leads/index.ts`
- Criar: `supabase/functions/redistribute-batch/index.ts`

### Frontend
- Modificar: `src/pages/LeadDistribution.tsx` (adicionar aba)
- Modificar: `src/components/LeadDistributionList.tsx` (seletor de roleta)
- Criar: `src/components/RedistributionBatches.tsx`
- Criar: `src/components/RedistributeBatchDialog.tsx`
