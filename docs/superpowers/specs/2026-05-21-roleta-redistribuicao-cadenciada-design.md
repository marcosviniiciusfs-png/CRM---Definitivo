# Redistribuição cadenciada lead-a-lead — Roleta de Leads

**Data:** 2026-05-21
**Escopo:** Sessão "Roleta de Leads" → "Redistribuir leads de colaboradores"
**Status:** Design aprovado

## Motivação

A redistribuição de leads de colaboradores **aparenta travar** para o usuário: o modal de confirmação fecha imediatamente após o clique em "Redistribuir", e a barra de progresso vive numa região da página (`LeadDistribution`) fora do campo visual do usuário, que estava focado no diálogo. Além disso, o progresso pula em saltos de 25 leads (tamanho do batch atual) com 800ms entre batches — sem feedback intermediário, parece estar parada.

O usuário pediu literalmente: *"deve haver uma barra de progresso e um delay de 2s na redistribuição de um lead para o outro"*.

## Diagnóstico técnico

Três causas concretas combinadas:

1. **Barra de progresso fora do campo visual.** O `AlertDialog` de confirmação fecha o modal pai (`setModalOpen(false)`) antes de chamar `onConfirm`. A barra renderizada em `LeadDistribution.tsx:393-409` está entre o trigger e as tabs — sem `scrollIntoView`, o usuário muitas vezes não a percebe.

2. **Granularidade grosseira do progresso.** A edge function `redistribute-from-collaborator` processa 25 leads por chamada com 800ms de delay entre chamadas (`BATCH_SIZE = 25`, `DELAY_MS = 800`). O `current` só incrementa quando o batch inteiro retorna. Em volumes pequenos (5–24 leads), a UI praticamente pula de 0 para N. A condição de render `redistProgress.total > 0` ainda esconde a barra no primeiro tick.

3. **Sem cadência lead-a-lead.** O delay de 800ms é entre **batches**, não entre **leads**. Não existe feedback "lead → agente" por unidade.

## Arquitetura

**Estratégia:** client-orchestrated, server-stateless. O cliente (página `LeadDistribution`) controla o ritmo chamando a edge function uma vez por lead. A edge function passa de "1 batch por chamada" para "1 lead por chamada". O modal de confirmação evolui para um modal de **operação em andamento** com barra de progresso, log corrido e botão de cancelar.

**Por que client-side e não worker no servidor?** Edge functions Supabase são stateless e têm timeout. Manter o ritmo no cliente: (a) é trivialmente cancelável fechando a página; (b) o usuário tem feedback em tempo real; (c) não exige tabela de fila/estado; (d) o backend já está preparado para receber 1 lead por chamada — basta mudar `BATCH_SIZE` para 1.

**Isolamento:** a mudança escopa estritamente à redistribuição de colaboradores. Outras redistribuições (sem responsável, perdidos, lotes manuais, auto-redistribuição) ficam intactas.

## Componentes afetados

### Frontend

**`src/components/roulette/RedistributeFromCollaboratorPanel.tsx`**
- Modal ganha três fases (configuração → em execução → concluído).
- Não fecha mais ao iniciar a operação. Permanece aberto até o usuário clicar em "Fechar" na fase 3.
- Recebe novas props para controlar fase, progresso, log e cancelar.

**`src/pages/LeadDistribution.tsx`**
- Mutation `redistributeFromCollaboratorMutation` passa a usar `AbortController`, delay adaptativo, e estado próprio (`collabRedistState`) — **não toca** no `redistProgress` compartilhado.
- Estado novo armazena: `current`, `total`, `phase` (`'idle' | 'running' | 'done' | 'aborted' | 'error'`), `log: Array<{lead_nome, agent_name, timestamp}>`, `skipped`, `errorMessage`.
- Após cada chamada da edge function, anexa o `assignment` recebido ao log e calcula próximo delay.

### Backend

**`supabase/functions/redistribute-from-collaborator/index.ts`**
- `BATCH_SIZE: 25 → 1` (constante interna).
- `select` da query do batch passa a incluir `nome_lead` (para o log).
- Payload de retorno adiciona campo `assignments: [{ lead_id, lead_nome, agent_user_id, agent_name }]` (chave `lead_nome` no retorno, valor vem de `leads.nome_lead`).

**`supabase/functions/_shared/redistribute-batch.ts`**
- Mudança **aditiva apenas**: o helper retorna `assignments` no resultado. Consumidores que não leem o campo (atualmente `redistribute-unassigned-leads`) ignoram silenciosamente.
- `select` dos leads passa de `'id, source, funnel_id'` para `'id, nome_lead, source, funnel_id'`. Aditivo.
- Tipo `RedistributeBatchResult` ganha `assignments: Array<{lead_id, lead_nome, agent_user_id, agent_name}>`.

## Fluxo de dados (sequência)

```
[Usuário] clica "Redistribuir" no AlertDialog
   ↓
[Frontend] AlertDialog fecha, mas Dialog (modal pai) PERMANECE aberto e muda para fase "running"
   ↓
[Frontend] inicializa: { current: 0, total: N, phase: 'running', log: [], skipped: 0 }
   ↓
LOOP (i = 1 .. N):
   se signal.aborted → phase = 'aborted'; break
   ↓
   [Frontend] chama edge function (configurada para BATCH_SIZE=1)
       ↓
   [Edge] desatribui 1 lead + redistribui via redistributeBatch (com leadIds=[esse 1])
       ↓
   [Edge] retorna {
     redistributed_count: 0 ou 1,
     total: <restantes>,
     skipped: 0 ou 1,
     has_more: boolean,
     assignments: [{lead_id, lead_nome, agent_user_id, agent_name}] (vazio se skipped)
   }
       ↓
   [Frontend] current++; log.unshift(assignment) (se houver); skipped += data.skipped
       ↓
   se !data.has_more → phase = 'done'; break
   ↓
   [Frontend] aguarda delay (2000ms se current < 50, senão 500ms)
   ↓
[Frontend] modal mostra fase final com botão "Fechar"
```

## UI — três fases no modal

### Fase 1 — Configuração (inalterada)
Conteúdo atual: seleção de colaboradores + seleção de roleta. Footer: `Cancelar` + `Redistribuir N lead(s)`.

### Fase 2 — Em execução
Oculta seleções da fase 1. Mostra:

- **Cabeçalho:** "Redistribuindo N lead(s)..."
- **Barra `<Progress>`** com `value = (current/total)*100` e label `current / total`
- **ETA calculado:** `"~Xmin Ys restantes"` usando a fórmula do delay adaptativo
- **Log corrido** (lista, mais recente no topo, `max-h-72 overflow-y-auto`):
  - Linha: `✓ <lead_nome> → <agent_name>` (texto pequeno, ícone verde)
  - Linhas com skipped (raras): `⊘ <lead_nome> — sem agente compatível`
  - Limite visual: últimos 50 eventos (o restante é truncado mas o estado guarda tudo até o fim)
- **Footer:** botão `Cancelar` (vermelho). Se `current > 0`, abre `AlertDialog` de confirmação: *"X leads já foram redistribuídos. Cancelar agora não desfaz o que já foi feito."*

### Fase 3 — Concluído / Cancelado / Erro
- **Concluído:** `✓ Redistribuição concluída: X de N leads atribuídos.` Se `skipped > 0`: aviso amarelo `Y leads aguardando configuração de roleta/agente.`
- **Cancelado:** `⚠ Operação cancelada após Y leads. Z leads não foram redistribuídos.`
- **Erro:** `✗ Erro: <mensagem>. Y leads foram redistribuídos antes da falha.` Botão extra: `Retomar` (reinicia o loop — os já feitos saem do filtro do servidor naturalmente).
- **Footer:** botão `Fechar` (fecha o modal e reseta o estado).

## Delay adaptativo

```ts
const computeDelay = (processedSoFar: number): number =>
  processedSoFar < 50 ? 2000 : 500;
```

Aplicado **depois** de cada chamada da edge function, exceto a última (quando `has_more === false`, pula o delay).

**Tempo estimado em função do N:**
- N ≤ 50: `N × 2s`
- N > 50: `100s + (N - 50) × 0.5s`

Exemplos:
- 10 leads → 20s
- 50 leads → 100s
- 100 leads → 125s
- 200 leads → 175s ≈ 3min

A UI calcula e exibe o ETA atualizando a cada iteração.

## Cancelamento

`AbortController` instanciado no início da mutation. Botão "Cancelar" da fase 2 chama `controller.abort()`.

- `supabase.functions.invoke(name, { body, signal: controller.signal })` propaga o `AbortSignal`.
- Antes de cada iteração do loop, checa `signal.aborted` → break com `phase = 'aborted'`.
- Antes do `setTimeout` do delay, embrulha numa `Promise` que rejeita ao abortar (assim o usuário não precisa esperar os 2s para o cancelamento ter efeito).
- Atomicidade preservada: cada chamada da edge function é uma transação atômica do lado do servidor. Leads já redistribuídos permanecem no agente novo; leads ainda no colaborador permanecem com ele. Não há estado intermediário corrompido.

## Tratamento de erros

| Cenário | Comportamento |
|---|---|
| Erro de rede em uma iteração | 1 retry com backoff de 1s. Se falhar de novo, para o loop, `phase = 'error'`, mostra mensagem e botão `Retomar`. |
| HTTP 401/403 | Encerra imediatamente sem retry. `phase = 'error'`. |
| `count === 0 && has_more === true` por 3 iterações seguidas | Sai com `phase = 'done'` e toast informativo: `"X leads aguardando configuração de roleta/agente"`. Mantém a guarda anti-loop atual mas amplia a tolerância de 1 para 3 iterações (alguns leads podem ter source incompatível enquanto outros não). |
| Fechar aba do navegador | Operação é interrompida. Leads já feitos permanecem com agente novo. Restantes com o colaborador original. Não há rollback. |

## Não-objetivos (escopo explícito do que NÃO muda)

- **`redistribute-unassigned-leads` edge function** — inalterada.
- **`redistribute-lost-leads` edge function** — inalterada.
- **`redistribute-batch` edge function** (lotes manuais) — inalterada.
- **`auto-redistribute-leads`** — inalterada.
- **`distribute-lead`** (distribuição automática de novos leads) — inalterada.
- **Mutations `redistributeMutation` e `redistributeLostMutation`** no `LeadDistribution.tsx` — inalteradas.
- **Barra de progresso compartilhada `redistProgress`** (linhas 393-421 atuais) — inalterada, continua servindo as outras duas mutations.
- **Helper `redistributeBatch` para consumidores existentes** — apenas ganha campo aditivo no retorno. Comportamento preservado.

## Testes manuais (gate para "feito")

1. Redistribuir 1 colaborador com 0 leads → mostra toast info, **não abre fase 2**.
2. Redistribuir 1 colaborador com 5 leads → fase 2 dura ~10s, log mostra 5 linhas, fase 3 mostra "5 de 5".
3. Redistribuir 3 colaboradores com 75 leads totais → modo híbrido: 50 leads × 2s + 25 leads × 500ms ≈ 112s. ETA atualiza ao cruzar o limite de 50.
4. Cancelar na metade (current = 25 de 50) → `AlertDialog` confirma, fase 3 mostra "Cancelado após 25 de 50".
5. Fechar aba durante operação, reabrir → 25 leads atribuídos ao agente novo, 25 ainda com o colaborador (sem corrupção).
6. Sem roleta ativa → `phase = 'done'`, `skipped = N`, aviso amarelo.
7. Múltiplos colaboradores com alguns leads sem roleta compatível → mistura de "✓" e "⊘" no log.
8. **Regressão obrigatória:** "Redistribuir agora" (leads sem responsável) continua funcionando como antes. Barra de progresso aparece fora do modal, como hoje.
9. **Regressão obrigatória:** "Redistribuir perdidos" continua funcionando como antes.
10. Verificar build sem warnings TS, sem erros de import.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Mudança no `redistribute-batch.ts` (helper) quebra `redistribute-unassigned-leads` | Mudança puramente aditiva. `assignments` é campo novo no retorno; `select` adicional não altera semântica. Regressão #8 valida. |
| Custo de N invocações de edge function (vs 1 batch) | Edge functions Supabase são leves. Custo aceitável para a faixa de uso esperada (até 500 leads/operação). Acima disso, o delay adaptativo já amortiza. |
| Usuário aborta no meio e quer "desfazer" | Não há undo. Aviso explícito antes de cancelar deixa isso claro. Cada lead é atômico — sem estado inconsistente. |
| Latência alta de rede inflando o tempo real além do ETA | Aceitável. ETA é estimativa baseada em delay puro; latência adiciona ~200-500ms por chamada. Para 100 leads = ~30s a mais. Não é crítico. |

## Migração de dados

Nenhuma. Sem mudança de schema. Sem migrations.

## Plano de rollout

1. PR único cobrindo backend (`BATCH_SIZE=1`, `assignments` no retorno) + frontend (modal 3-fases, estado isolado, delay adaptativo).
2. Verificação manual completa antes do merge (10 testes acima).
3. Sem feature flag — mudança é totalmente isolada e reversível por revert do PR.
