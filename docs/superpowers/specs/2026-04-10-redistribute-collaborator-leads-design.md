# Redistribuir Leads de um Colaborador Específico

**Data**: 2026-04-10
**Status**: Aprovado

## Funcionalidade

Na aba "Redistribuições", o usuário pode redistribuir todos os leads ativos de um colaborador específico, escolhendo uma roleta para usar seus colaboradores como destino.

## Localização

Aba "Redistribuições" — novo card/seção no topo da página com:
1. Dropdown para selecionar colaborador (membros ativos da organização)
2. Botão "Redistribuir" que abre o `RedistributeBatchDialog` para escolher a roleta

## Backend — Nova Edge Function: `redistribute-collaborator-leads`

**Parâmetros:**
- `collaborator_user_id` (UUID) — colaborador cujos leads serão redistribuídos
- `config_id` (UUID) — roleta escolhida (colaboradores destino)
- `organization_id` (UUID)

**Fluxo:**
1. Buscar todos os leads ativos do colaborador na organização (excluindo won/lost)
2. Buscar colaboradores da roleta escolhida (`eligible_agents` da config)
3. Excluir o colaborador original da lista de destino (para não receber de volta)
4. Distribuir em round-robin direto (sem regras de capacidade/horário)
5. Atualizar leads com novo `responsavel_user_id`
6. Criar lote em `redistribution_batches` com `batch_type = 'redistribution'`
7. Registrar histórico com `batch_id`

## Frontend — Modificação em `RedistributionBatches.tsx`

Novo card no topo com:
- `<Select>` para escolher colaborador (busca membros ativos da org)
- Botão "Redistribuir" que abre `RedistributeBatchDialog`
- Ao confirmar, chama Edge Function `redistribute-collaborator-leads`
- Feedback via toast (sucesso/erro)

Reutiliza `RedistributeBatchDialog` existente (com `showAutoOption={false}`).

## Arquivos

- Criar: `supabase/functions/redistribute-collaborator-leads/index.ts`
- Modificar: `src/components/RedistributionBatches.tsx` (adicionar card de redistribuição por colaborador)

Nenhuma tabela nova. Nenhuma migration nova.
