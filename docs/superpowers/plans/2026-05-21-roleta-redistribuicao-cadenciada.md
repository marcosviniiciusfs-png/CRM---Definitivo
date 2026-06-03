# Redistribuição Cadenciada Lead-a-Lead — Plano de Implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: usar `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para executar este plano tarefa-a-tarefa. Os passos usam checkbox (`- [ ]`) para tracking.

**Goal:** Substituir a redistribuição em batches de 25 leads (que aparenta travar) por uma redistribuição lead-a-lead com cadência adaptativa (2s/lead até 50, 500ms depois), modal de operação em 3 fases com barra de progresso, log corrido e cancelamento via AbortController.

**Architecture:** Client-orchestrated, server-stateless. A página `LeadDistribution` controla o loop chamando a edge function uma vez por lead. Backend ganha `BATCH_SIZE = 1` na edge function `redistribute-from-collaborator` e o helper compartilhado retorna `assignments` (campo aditivo, sem quebrar consumidores existentes). Frontend ganha estado isolado `collabRedistState` que não interfere nas outras duas mutations de redistribuição.

**Tech Stack:** React 18, TypeScript, @tanstack/react-query v5, @supabase/supabase-js 2.81, Deno (edge functions), Tailwind, shadcn/ui (Dialog, AlertDialog, Progress). Sem framework de testes — verificação via `npm run lint`, `npm run build` e smoke manual com os 10 testes definidos no spec.

**Spec:** [2026-05-21-roleta-redistribuicao-cadenciada-design.md](../specs/2026-05-21-roleta-redistribuicao-cadenciada-design.md)

---

## Estrutura de Arquivos

**Modificar:**
- `supabase/functions/_shared/redistribute-batch.ts` — adiciona `nome_lead` ao SELECT, tipo `RedistributeBatchResult.assignments`, e popula `assignments` no loop final
- `supabase/functions/redistribute-from-collaborator/index.ts` — `BATCH_SIZE: 25 → 1`, inclui `nome_lead` no SELECT do batch, repassa `assignments` no payload de resposta
- `src/pages/LeadDistribution.tsx` — novos tipos e estado `collabRedistState`, helpers (`computeDelay`, `abortableDelay`, `formatEta`), refatoração completa de `redistributeFromCollaboratorMutation`
- `src/components/roulette/RedistributeFromCollaboratorPanel.tsx` — modal ganha fases 2 (running) e 3 (done/aborted/error); recebe novas props; `AlertDialog` extra para confirmar cancelamento

**Sincronizar (sem código):**
- `Projetos/Kairoz CRM/02 - Plans/2026-05-21-roleta-redistribuicao-cadenciada.md` (vault)
- `Projetos/Kairoz CRM/Home.md` (vault — contagem Plans 26 → 27 + entrada)
- `Projetos/Kairoz CRM/Changelog.md` (vault — entrada `[Plan]`)

---

### Task 1: Helper compartilhado retorna `assignments`

Mudança puramente aditiva. `redistribute-unassigned-leads` (outro consumidor) ignora o novo campo e continua funcionando.

**Files:**
- Modify: `supabase/functions/_shared/redistribute-batch.ts`

- [ ] **Step 1: Adicionar campo `assignments` no tipo `RedistributeBatchResult`**

Localizar (linhas 30-36):

```ts
export interface RedistributeBatchResult {
  redistributed: number;
  skipped: number;
  totalRemaining: number;
  hasMore: boolean;
  errors: string[];
}
```

Substituir por:

```ts
export interface RedistributeBatchResult {
  redistributed: number;
  skipped: number;
  totalRemaining: number;
  hasMore: boolean;
  errors: string[];
  /**
   * Lista granular de cada lead processado neste batch.
   * `agent_user_id`/`agent_name` são null para leads sem agente compatível (skipped).
   * Consumidores antigos ignoram este campo (aditivo).
   */
  assignments: Array<{
    lead_id: string;
    lead_nome: string;
    agent_user_id: string | null;
    agent_name: string | null;
  }>;
}
```

- [ ] **Step 2: Incluir `nome_lead` no SELECT do batch fetch (linha ~65)**

Localizar:

```ts
  let leadsQuery = supabase
    .from('leads')
    .select('id, source, funnel_id')
    .eq('organization_id', organizationId)
    .is('responsavel_user_id', null)
    .limit(batchSize);
```

Substituir por:

```ts
  let leadsQuery = supabase
    .from('leads')
    .select('id, nome_lead, source, funnel_id')
    .eq('organization_id', organizationId)
    .is('responsavel_user_id', null)
    .limit(batchSize);
```

- [ ] **Step 3: Atualizar os 3 early-returns para incluir `assignments: []`**

Localizar e substituir os três early-returns que ainda não têm `assignments`:

Primeiro (linha ~59) — erro no fetch de closedStages:

```ts
    return { redistributed: 0, skipped: 0, totalRemaining: 0, hasMore: false, errors: [`closedStages: ${closedStagesErr.message}`] };
```

Substituir por:

```ts
    return { redistributed: 0, skipped: 0, totalRemaining: 0, hasMore: false, errors: [`closedStages: ${closedStagesErr.message}`], assignments: [] };
```

Segundo (linha ~79) — erro no leads fetch:

```ts
    return { redistributed: 0, skipped: 0, totalRemaining: 0, hasMore: false, errors: [`leadsFetch: ${leadsError.message}`] };
```

Substituir por:

```ts
    return { redistributed: 0, skipped: 0, totalRemaining: 0, hasMore: false, errors: [`leadsFetch: ${leadsError.message}`], assignments: [] };
```

Terceiro (linha ~83) — nenhum lead sem dono:

```ts
  if (!unassignedLeads || unassignedLeads.length === 0) {
    return { redistributed: 0, skipped: 0, totalRemaining: 0, hasMore: false, errors: [] };
  }
```

Substituir por:

```ts
  if (!unassignedLeads || unassignedLeads.length === 0) {
    return { redistributed: 0, skipped: 0, totalRemaining: 0, hasMore: false, errors: [], assignments: [] };
  }
```

- [ ] **Step 4: Atualizar os 2 early-returns no meio que faltam `assignments`**

Localizar (linha ~109) — erro no configsFetch:

```ts
    return { redistributed: 0, skipped: 0, totalRemaining: totalRemaining || 0, hasMore: false, errors: [`configsFetch: ${configsError.message}`] };
```

Substituir por:

```ts
    return { redistributed: 0, skipped: 0, totalRemaining: totalRemaining || 0, hasMore: false, errors: [`configsFetch: ${configsError.message}`], assignments: [] };
```

Localizar (linha ~112) — sem configs ativos:

```ts
    return { redistributed: 0, skipped: unassignedLeads.length, totalRemaining: totalRemaining || 0, hasMore: false, errors: ['Nenhuma roleta ativa'] };
```

Substituir por:

```ts
    return { redistributed: 0, skipped: unassignedLeads.length, totalRemaining: totalRemaining || 0, hasMore: false, errors: ['Nenhuma roleta ativa'], assignments: skippedAssignmentsFromLeads(unassignedLeads) };
```

E logo após `if (!configs || configs.length === 0) { ... }` (após linha ~113), adicionar acima do bloco a função helper. Mas para evitar problema de scope, vou definir inline. Substitua o bloco completo (das linhas ~111 a ~113):

```ts
  if (!configs || configs.length === 0) {
    return { redistributed: 0, skipped: unassignedLeads.length, totalRemaining: totalRemaining || 0, hasMore: false, errors: ['Nenhuma roleta ativa'] };
  }
```

Por:

```ts
  if (!configs || configs.length === 0) {
    // deno-lint-ignore no-explicit-any
    const skippedAssignments = (unassignedLeads as any[]).map((l: any) => ({
      lead_id: l.id,
      lead_nome: l.nome_lead || '(sem nome)',
      agent_user_id: null,
      agent_name: null,
    }));
    return { redistributed: 0, skipped: unassignedLeads.length, totalRemaining: totalRemaining || 0, hasMore: false, errors: ['Nenhuma roleta ativa'], assignments: skippedAssignments };
  }
```

- [ ] **Step 5: Declarar `assignments` no escopo principal e popular no loop final**

Localizar (linha ~173) — declaração de `errors`:

```ts
  let redistributedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];
```

Substituir por:

```ts
  let redistributedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];
  const assignments: Array<{
    lead_id: string;
    lead_nome: string;
    agent_user_id: string | null;
    agent_name: string | null;
  }> = [];
```

- [ ] **Step 6: Popular `assignments` para leads SKIPPED (sem config/sem agente)**

Localizar o bloco de loop por lead (linhas ~177-199 atuais):

```ts
  for (const lead of unassignedLeads) {
    const config = effectiveConfig || findBestConfig(configs, lead) || fallbackConfig;
    if (!config) { skippedCount++; continue; }
    const agents = agentsByConfig.get(config.id);
    if (!agents || agents.length === 0) { skippedCount++; continue; }
```

Substituir por:

```ts
  for (const lead of unassignedLeads) {
    const config = effectiveConfig || findBestConfig(configs, lead) || fallbackConfig;
    if (!config) {
      skippedCount++;
      assignments.push({
        // deno-lint-ignore no-explicit-any
        lead_id: (lead as any).id,
        // deno-lint-ignore no-explicit-any
        lead_nome: (lead as any).nome_lead || '(sem nome)',
        agent_user_id: null,
        agent_name: null,
      });
      continue;
    }
    const agents = agentsByConfig.get(config.id);
    if (!agents || agents.length === 0) {
      skippedCount++;
      assignments.push({
        // deno-lint-ignore no-explicit-any
        lead_id: (lead as any).id,
        // deno-lint-ignore no-explicit-any
        lead_nome: (lead as any).nome_lead || '(sem nome)',
        agent_user_id: null,
        agent_name: null,
      });
      continue;
    }
```

- [ ] **Step 7: Popular `assignments` para leads efetivamente REDISTRIBUÍDOS**

Localizar o bloco de update por agente (linhas ~215-249 atuais), dentro do `for (const [agentId, items] of agentLeadMap)`. Encontre:

```ts
      redistributedCount += leadIds.length;
      for (const item of items) {
        historyRecords.push({
          lead_id: item.id,
          organization_id: organizationId,
          config_id: configId,
          batch_id: batchId,
          to_user_id: agentId,
          distribution_method: config.distribution_method,
          trigger_source: 'manual',
          is_redistribution: true,
        });
      }
```

Substituir por:

```ts
      redistributedCount += leadIds.length;
      for (const item of items) {
        historyRecords.push({
          lead_id: item.id,
          organization_id: organizationId,
          config_id: configId,
          batch_id: batchId,
          to_user_id: agentId,
          distribution_method: config.distribution_method,
          trigger_source: 'manual',
          is_redistribution: true,
        });
        assignments.push({
          lead_id: item.id,
          lead_nome: item.nome_lead || '(sem nome)',
          agent_user_id: agentId,
          agent_name: agent.full_name || agent.email || '(sem nome)',
        });
      }
```

- [ ] **Step 8: Retornar `assignments` no resultado final**

Localizar o return final (linha ~260-267):

```ts
  const remainingAfter = (totalRemaining || 0) - redistributedCount;
  return {
    redistributed: redistributedCount,
    skipped: skippedCount,
    totalRemaining: remainingAfter,
    hasMore: remainingAfter > 0,
    errors,
  };
```

Substituir por:

```ts
  const remainingAfter = (totalRemaining || 0) - redistributedCount;
  return {
    redistributed: redistributedCount,
    skipped: skippedCount,
    totalRemaining: remainingAfter,
    hasMore: remainingAfter > 0,
    errors,
    assignments,
  };
```

- [ ] **Step 9: Commit**

```
git add supabase/functions/_shared/redistribute-batch.ts
git commit -m "feat(redistribute-batch): retornar assignments granulares no resultado"
```

---

### Task 2: Edge function `redistribute-from-collaborator` processa 1 lead por chamada

**Files:**
- Modify: `supabase/functions/redistribute-from-collaborator/index.ts`

- [ ] **Step 1: Mudar `BATCH_SIZE` de 25 para 1**

Localizar (linha ~112):

```ts
    // 7. Capturar IDs do PROXIMO BATCH (nao todos de uma vez).
    // 25 leads por batch: cada chamada completa em ~1-2s, o cliente loopa
    // com 800ms entre chamadas, e a barra de progresso preenche visivelmente
    // (em vez de pular de 0 -> N em 1 update so).
    const BATCH_SIZE = 25;
```

Substituir por:

```ts
    // 7. Capturar 1 lead por chamada — cadência lead-a-lead.
    // O cliente loopa com delay adaptativo (2s/lead até 50, 500ms depois)
    // e usa cada `assignments[0]` retornado para alimentar o log do modal.
    const BATCH_SIZE = 1;
```

- [ ] **Step 2: Incluir `nome_lead` no SELECT do batch (para log do skipped)**

Localizar (linhas ~113-118):

```ts
    let batchQuery = supabase
      .from("leads")
      .select("id")
      .eq("organization_id", organization_id)
      .in("responsavel_user_id", collaborator_user_ids)
      .limit(BATCH_SIZE);
```

Substituir por:

```ts
    let batchQuery = supabase
      .from("leads")
      .select("id, nome_lead")
      .eq("organization_id", organization_id)
      .in("responsavel_user_id", collaborator_user_ids)
      .limit(BATCH_SIZE);
```

- [ ] **Step 3: Atualizar extração de `batchIds` para preservar `nome_lead`**

Localizar (linha ~126):

```ts
    const batchIds: string[] = (batchLeads || []).map((l: { id: string }) => l.id);
```

Substituir por:

```ts
    const batchLeadsTyped: Array<{ id: string; nome_lead: string | null }> = batchLeads || [];
    const batchIds: string[] = batchLeadsTyped.map((l) => l.id);
```

- [ ] **Step 4: Atualizar o response final para incluir `assignments`**

Localizar (linhas ~162-170):

```ts
    return new Response(JSON.stringify({
      success: true,
      redistributed_count: result.redistributed,
      total: totalRemaining,
      processed: result.redistributed,
      skipped: result.skipped,
      has_more: hasMore,
      errors: result.errors.length > 0 ? result.errors : undefined,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
```

Substituir por:

```ts
    return new Response(JSON.stringify({
      success: true,
      redistributed_count: result.redistributed,
      total: totalRemaining,
      processed: result.redistributed,
      skipped: result.skipped,
      has_more: hasMore,
      assignments: result.assignments,
      errors: result.errors.length > 0 ? result.errors : undefined,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
```

- [ ] **Step 5: Atualizar os 2 early-returns que ficaram sem `assignments`**

Localizar (linhas ~97-105) — nenhum lead ativo:

```ts
    if (!totalRemaining || totalRemaining === 0) {
      return new Response(JSON.stringify({
        success: true,
        redistributed_count: 0,
        total: 0,
        processed: 0,
        skipped: 0,
        has_more: false,
        message: "Nenhum lead ativo para redistribuir"
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
```

Substituir por:

```ts
    if (!totalRemaining || totalRemaining === 0) {
      return new Response(JSON.stringify({
        success: true,
        redistributed_count: 0,
        total: 0,
        processed: 0,
        skipped: 0,
        has_more: false,
        assignments: [],
        message: "Nenhum lead ativo para redistribuir"
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
```

Localizar (linhas ~128-138) — batch vazio:

```ts
    if (batchIds.length === 0) {
      // totalRemaining > 0 mas o batch retornou 0 — improvavel mas seguro retornar done
      return new Response(JSON.stringify({
        success: true,
        redistributed_count: 0,
        total: totalRemaining,
        processed: 0,
        skipped: 0,
        has_more: false,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
```

Substituir por:

```ts
    if (batchIds.length === 0) {
      // totalRemaining > 0 mas o batch retornou 0 — improvavel mas seguro retornar done
      return new Response(JSON.stringify({
        success: true,
        redistributed_count: 0,
        total: totalRemaining,
        processed: 0,
        skipped: 0,
        has_more: false,
        assignments: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
```

- [ ] **Step 6: Commit**

```
git add supabase/functions/redistribute-from-collaborator/index.ts
git commit -m "feat(redistribute-from-collaborator): batch=1 + assignments no payload"
```

---

### Task 3: Deploy das edge functions modificadas

**Files:** (nenhum arquivo modificado — apenas comandos)

- [ ] **Step 1: Deploy `redistribute-from-collaborator`**

```
npx supabase functions deploy redistribute-from-collaborator
```

Esperado: saída `Deployed Function redistribute-from-collaborator on project ref ...`. Se pedir login, executar `npx supabase login` antes.

- [ ] **Step 2: Deploy `redistribute-unassigned-leads` (regressão obrigatória)**

Como ambos importam `_shared/redistribute-batch.ts`, o `redistribute-unassigned-leads` precisa redeploy para empacotar a nova versão do helper.

```
npx supabase functions deploy redistribute-unassigned-leads
```

Esperado: deploy bem-sucedido.

- [ ] **Step 3: Smoke test do `redistribute-unassigned-leads` (regressão #8 do spec)**

No navegador, acessar Roleta de Leads → se houver leads sem responsável, clicar em "Redistribuir agora". Verificar:
- Modal de seleção de roleta abre
- Após confirmar, a barra de progresso **fora do modal** (entre o trigger e as tabs) aparece e preenche
- Toast de sucesso ao final

Se quebrar, reverter Task 1 e investigar.

---

### Task 4: Tipos e estado novo em `LeadDistribution.tsx`

**Files:**
- Modify: `src/pages/LeadDistribution.tsx`

- [ ] **Step 1: Adicionar tipos no topo do arquivo, logo após os imports (após linha 31)**

Localizar (linha 31):

```ts
type TabValue = "roulettes" | "agents" | "rules" | "history";
```

Substituir por:

```ts
type TabValue = "roulettes" | "agents" | "rules" | "history";

type CollabRedistPhase = "idle" | "running" | "done" | "aborted" | "error";

interface CollabAssignment {
  lead_id: string;
  lead_nome: string;
  agent_user_id: string | null;
  agent_name: string | null;
  timestamp: number;
}

interface CollabRedistState {
  phase: CollabRedistPhase;
  current: number;
  total: number;
  skipped: number;
  log: CollabAssignment[];
  errorMessage: string | null;
  lastParams: { userIds: string[]; configId: string | null } | null;
}

const INITIAL_COLLAB_STATE: CollabRedistState = {
  phase: "idle",
  current: 0,
  total: 0,
  skipped: 0,
  log: [],
  errorMessage: null,
  lastParams: null,
};
```

- [ ] **Step 2: Adicionar `useRef` ao import do React**

Localizar (linha 1):

```ts
import { useState, useCallback } from "react";
```

Substituir por:

```ts
import { useState, useCallback, useRef } from "react";
```

- [ ] **Step 3: Adicionar `useState` para `collabRedistState` e `useRef` para AbortController**

Localizar (linha 45):

```ts
  // Redistribution progress state
  const [redistProgress, setRedistProgress] = useState({ current: 0, total: 0, isRunning: false });
```

Substituir por:

```ts
  // Redistribution progress state (compartilhado por redistributeMutation e redistributeLostMutation)
  const [redistProgress, setRedistProgress] = useState({ current: 0, total: 0, isRunning: false });

  // Estado da redistribuição cadenciada de colaboradores (modal-controlled, isolado das outras 2)
  const [collabRedistState, setCollabRedistState] = useState<CollabRedistState>(INITIAL_COLLAB_STATE);
  const collabAbortRef = useRef<AbortController | null>(null);
```

- [ ] **Step 4: Verificar TypeScript**

```
npm run build
```

Esperado: build conclui sem erros (mesmo que `collabRedistState` ainda não tenha consumidores).

- [ ] **Step 5: Commit**

```
git add src/pages/LeadDistribution.tsx
git commit -m "feat(roleta): adicionar tipos e estado para redistribuicao cadenciada"
```

---

### Task 5: Helpers `computeDelay`, `abortableDelay`, `formatEta`

**Files:**
- Modify: `src/pages/LeadDistribution.tsx`

- [ ] **Step 1: Adicionar helpers acima do componente `LeadDistribution`**

Localizar (linha 33):

```ts
export default function LeadDistribution() {
```

Inserir **antes** dessa linha:

```ts
function computeDelay(processedSoFar: number): number {
  return processedSoFar < 50 ? 2000 : 500;
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function formatEta(remaining: number, processedSoFar: number): string {
  let totalMs = 0;
  for (let i = 0; i < remaining; i++) {
    totalMs += computeDelay(processedSoFar + i);
  }
  const totalSeconds = Math.ceil(totalMs / 1000);
  if (totalSeconds < 60) return `~${totalSeconds}s restantes`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `~${minutes}min restantes` : `~${minutes}min ${seconds}s restantes`;
}

export default function LeadDistribution() {
```

- [ ] **Step 2: Verificar build**

```
npm run build
```

Esperado: build conclui sem erros.

- [ ] **Step 3: Commit**

```
git add src/pages/LeadDistribution.tsx
git commit -m "feat(roleta): helpers computeDelay/abortableDelay/formatEta"
```

---

### Task 6: Refatorar `redistributeFromCollaboratorMutation` para loop cadenciado

**Files:**
- Modify: `src/pages/LeadDistribution.tsx`

- [ ] **Step 1: Substituir TODA a mutation `redistributeFromCollaboratorMutation` por versão cadenciada**

Localizar (linhas 275-348 atuais):

```ts
  // Redistribuir leads de um colaborador (loop client-side: cada chamada
  // processa 1 batch, frontend mostra progresso entre chamadas)
  const redistributeFromCollaboratorMutation = useMutation({
    mutationFn: async ({ userIds, configId }: { userIds: string[]; configId: string | null }) => {
      if (!organizationId) return { redistributed: 0, skipped: 0 };

      setRedistProgress({ current: 0, total: 0, isRunning: true });

      let totalRedistributed = 0;
      let totalSkipped = 0;
      let hasMore = true;
      let iteration = 0;
      const MAX_ITERATIONS = 500;
      const DELAY_MS = 800;

      while (hasMore && iteration < MAX_ITERATIONS) {
        iteration++;
        const { data, error } = await supabase.functions.invoke("redistribute-from-collaborator", {
          body: {
            organization_id: organizationId,
            collaborator_user_ids: userIds,
            config_id: configId,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const count = data?.redistributed_count || 0;
        const total = data?.total || 0;
        const skipped = data?.skipped || 0;
        totalRedistributed += count;
        totalSkipped += skipped;

        setRedistProgress(prev => ({
          ...prev,
          current: totalRedistributed,
          total: Math.max(prev.total, total),
        }));

        hasMore = data?.has_more === true;

        // Anti-loop: se servidor diz has_more=true mas processou 0, sai
        if (count === 0 && hasMore) break;

        // Delay entre iteracoes para UI atualizar e nao travar o banco
        if (hasMore && iteration < MAX_ITERATIONS) {
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
      }

      setRedistProgress(prev => ({ ...prev, isRunning: false }));
      return { redistributed: totalRedistributed, skipped: totalSkipped };
    },
    onSuccess: ({ redistributed, skipped }) => {
      queryClient.invalidateQueries({ queryKey: ["unassigned-leads-count"] });
      queryClient.invalidateQueries({ queryKey: ["lead-distribution-configs"] });
      queryClient.invalidateQueries({ queryKey: ["multi-collaborator-active-leads-count"] });
      if (redistributed > 0) {
        const msg = skipped > 0
          ? `${redistributed} leads redistribuidos. ${skipped} aguardando configuracao de roleta/agente.`
          : `${redistributed} leads redistribuidos com sucesso!`;
        toast.success(msg);
      } else if (skipped > 0) {
        toast.warning(`${skipped} leads aguardando configuracao de roleta/agente.`);
      } else {
        toast.info("Nenhum lead foi redistribuido");
      }
      setTimeout(() => setRedistProgress({ current: 0, total: 0, isRunning: false }), 3000);
    },
    onError: (err: Error) => {
      toast.error(`Erro: ${err.message || "falha ao redistribuir"}`);
      setRedistProgress({ current: 0, total: 0, isRunning: false });
    },
  });
```

Substituir por:

```ts
  // Redistribuição cadenciada lead-a-lead — modal-controlled, isolada de redistProgress.
  // NÃO usa onSuccess/onError do useMutation (precisamos persistir o modal aberto
  // mesmo após "concluir"). O modal lê de collabRedistState para decidir fase 2/3.
  const runCollabRedistribution = useCallback(async (userIds: string[], configId: string | null) => {
    if (!organizationId) return;

    // Aborta loop anterior se ainda houver
    collabAbortRef.current?.abort();
    const controller = new AbortController();
    collabAbortRef.current = controller;
    const signal = controller.signal;

    setCollabRedistState({
      ...INITIAL_COLLAB_STATE,
      phase: "running",
      lastParams: { userIds, configId },
    });

    let totalRedistributed = 0;
    let totalSkipped = 0;
    let totalKnown = 0;
    let emptyIterationStreak = 0;
    const MAX_EMPTY_STREAK = 3;
    const MAX_ITERATIONS = 5000;

    const invokeOnce = async () => {
      return await supabase.functions.invoke("redistribute-from-collaborator", {
        body: {
          organization_id: organizationId,
          collaborator_user_ids: userIds,
          config_id: configId,
        },
      });
    };

    try {
      for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        if (signal.aborted) break;

        // 1 retry com backoff de 1s em falha de rede/edge
        let resp = await invokeOnce();
        if (resp.error || resp.data?.error) {
          if (signal.aborted) break;
          await abortableDelay(1000, signal);
          resp = await invokeOnce();
        }
        if (resp.error) throw resp.error;
        if (resp.data?.error) throw new Error(resp.data.error);

        const data = resp.data;
        const count = data?.redistributed_count || 0;
        const total = data?.total || 0;
        const skipped = data?.skipped || 0;
        const hasMore = data?.has_more === true;
        const assignments: CollabAssignment[] = ((data?.assignments as Array<{
          lead_id: string;
          lead_nome: string;
          agent_user_id: string | null;
          agent_name: string | null;
        }>) || []).map((a) => ({ ...a, timestamp: Date.now() }));

        totalRedistributed += count;
        totalSkipped += skipped;
        totalKnown = Math.max(totalKnown, total);

        setCollabRedistState((prev) => ({
          ...prev,
          current: totalRedistributed + totalSkipped,
          total: Math.max(prev.total, total),
          skipped: totalSkipped,
          log: [...assignments.slice().reverse(), ...prev.log],
        }));

        // Anti-loop tolerante: até 3 iterações vazias com has_more=true
        if (count === 0 && skipped === 0 && hasMore) {
          emptyIterationStreak++;
          if (emptyIterationStreak >= MAX_EMPTY_STREAK) break;
        } else {
          emptyIterationStreak = 0;
        }

        if (!hasMore) break;
        if (signal.aborted) break;

        await abortableDelay(computeDelay(totalRedistributed + totalSkipped), signal);
      }

      if (signal.aborted) {
        setCollabRedistState((prev) => ({ ...prev, phase: "aborted" }));
        toast.info(`Operação cancelada. ${totalRedistributed} leads redistribuídos antes.`);
      } else {
        setCollabRedistState((prev) => ({ ...prev, phase: "done" }));
        if (totalRedistributed > 0) {
          const msg = totalSkipped > 0
            ? `${totalRedistributed} leads redistribuídos. ${totalSkipped} aguardando configuração de roleta/agente.`
            : `${totalRedistributed} leads redistribuídos com sucesso!`;
          toast.success(msg);
        } else if (totalSkipped > 0) {
          toast.warning(`${totalSkipped} leads aguardando configuração de roleta/agente.`);
        } else {
          toast.info("Nenhum lead foi redistribuído");
        }
      }

      queryClient.invalidateQueries({ queryKey: ["unassigned-leads-count"] });
      queryClient.invalidateQueries({ queryKey: ["lead-distribution-configs"] });
      queryClient.invalidateQueries({ queryKey: ["multi-collaborator-active-leads-count"] });
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError" || signal.aborted) {
        setCollabRedistState((prev) => ({ ...prev, phase: "aborted" }));
        return;
      }
      const message = err instanceof Error ? err.message : "Falha desconhecida";
      setCollabRedistState((prev) => ({ ...prev, phase: "error", errorMessage: message }));
      toast.error(`Erro: ${message}`);
    }
  }, [organizationId, queryClient]);

  const cancelCollabRedistribution = useCallback(() => {
    collabAbortRef.current?.abort();
  }, []);

  const closeCollabRedistribution = useCallback(() => {
    collabAbortRef.current?.abort();
    collabAbortRef.current = null;
    setCollabRedistState(INITIAL_COLLAB_STATE);
  }, []);

  const resumeCollabRedistribution = useCallback(() => {
    const params = collabRedistState.lastParams;
    if (!params) return;
    void runCollabRedistribution(params.userIds, params.configId);
  }, [collabRedistState.lastParams, runCollabRedistribution]);
```

- [ ] **Step 2: Verificar build**

```
npm run build
```

Esperado: build conclui sem erros. Pode aparecer warning "redistributeFromCollaboratorMutation is not defined" — esse será corrigido na próxima task (substituir a invocação no JSX).

- [ ] **Step 3: Commit**

```
git add src/pages/LeadDistribution.tsx
git commit -m "feat(roleta): mutation cadenciada com AbortController e delay adaptativo"
```

---

### Task 7: Atualizar invocação do `RedistributeFromCollaboratorPanel` com novas props

**Files:**
- Modify: `src/pages/LeadDistribution.tsx`

- [ ] **Step 1: Substituir a invocação do Panel no JSX**

Localizar (linhas 386-390 atuais):

```tsx
      <RedistributeFromCollaboratorPanel
        onConfirm={(userIds, configId) => redistributeFromCollaboratorMutation.mutate({ userIds, configId })}
        isPending={redistributeFromCollaboratorMutation.isPending}
      />
```

Substituir por:

```tsx
      <RedistributeFromCollaboratorPanel
        onConfirm={(userIds, configId) => void runCollabRedistribution(userIds, configId)}
        redistState={collabRedistState}
        onCancel={cancelCollabRedistribution}
        onClose={closeCollabRedistribution}
        onResume={resumeCollabRedistribution}
        computeEta={(remaining, current) => formatEta(remaining, current)}
      />
```

- [ ] **Step 2: Verificar build (vai falhar até atualizar o Panel)**

```
npm run build
```

Esperado: erro de TypeScript sobre props desconhecidas (`redistState`, `onCancel`, `onClose`, `onResume`, `computeEta`). Isso será corrigido nas próximas tasks. Não commitar ainda.

---

### Task 8: `RedistributeFromCollaboratorPanel` — props novas e detecção de fase

**Files:**
- Modify: `src/components/roulette/RedistributeFromCollaboratorPanel.tsx`

- [ ] **Step 1: Adicionar tipos e atualizar a interface `Props`**

Localizar (linhas 21-24 atuais):

```tsx
interface Props {
  onConfirm: (collaboratorUserIds: string[], configId: string | null) => void;
  isPending: boolean;
}
```

Substituir por:

```tsx
type CollabRedistPhase = "idle" | "running" | "done" | "aborted" | "error";

interface CollabAssignment {
  lead_id: string;
  lead_nome: string;
  agent_user_id: string | null;
  agent_name: string | null;
  timestamp: number;
}

interface CollabRedistState {
  phase: CollabRedistPhase;
  current: number;
  total: number;
  skipped: number;
  log: CollabAssignment[];
  errorMessage: string | null;
  lastParams: { userIds: string[]; configId: string | null } | null;
}

interface Props {
  onConfirm: (collaboratorUserIds: string[], configId: string | null) => void;
  redistState: CollabRedistState;
  onCancel: () => void;
  onClose: () => void;
  onResume: () => void;
  computeEta: (remaining: number, current: number) => string;
}
```

- [ ] **Step 2: Adicionar imports faltantes (Progress, X, AlertTriangle, CheckCircle2, etc)**

Localizar (linha 19):

```tsx
import { Shuffle, Loader2, Users, ChevronRight, Search, ChevronDown } from "lucide-react";
```

Substituir por:

```tsx
import { Shuffle, Loader2, Users, ChevronRight, Search, ChevronDown, CheckCircle2, XCircle, AlertTriangle, Ban } from "lucide-react";
import { Progress } from "@/components/ui/progress";
```

- [ ] **Step 3: Remover destruturação de `isPending` da assinatura do componente**

Localizar (linha 40):

```tsx
export function RedistributeFromCollaboratorPanel({ onConfirm, isPending }: Props) {
```

Substituir por:

```tsx
export function RedistributeFromCollaboratorPanel({ onConfirm, redistState, onCancel, onClose, onResume, computeEta }: Props) {
```

- [ ] **Step 4: Derivar `isPending` localmente e adicionar estado para AlertDialog de cancelamento**

Localizar (linhas 41-46 atuais — bloco de useStates iniciais):

```tsx
  const { organizationId } = useOrganization();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [selectedConfigId, setSelectedConfigId] = useState<string>(""); // "" = Auto
  const [searchTerm, setSearchTerm] = useState("");
```

Substituir por:

```tsx
  const { organizationId } = useOrganization();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [selectedConfigId, setSelectedConfigId] = useState<string>(""); // "" = Auto
  const [searchTerm, setSearchTerm] = useState("");

  const phase = redistState.phase;
  const isPending = phase === "running";
  const isFinished = phase === "done" || phase === "aborted" || phase === "error";

  // Forçar modal aberto durante execução/finalização (não permite fechar pelo overlay)
  const dialogOpen = modalOpen || isPending || isFinished;
```

- [ ] **Step 5: Atualizar `handleModalChange` para bloquear close durante execução**

Localizar (linhas 48-55 atuais):

```tsx
  const handleModalChange = (open: boolean) => {
    setModalOpen(open);
    if (!open) {
      setSelectedUserIds(new Set());
      setSelectedConfigId("");
      setSearchTerm("");
    }
  };
```

Substituir por:

```tsx
  const handleModalChange = (open: boolean) => {
    // Bloqueia close enquanto está rodando ou em fase final (deve usar botão Fechar)
    if (!open && (isPending || isFinished)) return;
    setModalOpen(open);
    if (!open) {
      setSelectedUserIds(new Set());
      setSelectedConfigId("");
      setSearchTerm("");
    }
  };

  const handleClose = () => {
    onClose();
    setModalOpen(false);
    setSelectedUserIds(new Set());
    setSelectedConfigId("");
    setSearchTerm("");
  };

  const handleCancelClick = () => {
    if (redistState.current > 0) {
      setCancelConfirmOpen(true);
    } else {
      onCancel();
    }
  };
```

- [ ] **Step 6: Atualizar o `<Dialog open=...>` para usar `dialogOpen`**

Localizar (linha 204 atual):

```tsx
      <Dialog open={modalOpen} onOpenChange={handleModalChange}>
```

Substituir por:

```tsx
      <Dialog open={dialogOpen} onOpenChange={handleModalChange}>
```

- [ ] **Step 7: Atualizar o handler do AlertDialog `onConfirm` para NÃO fechar mais o modal pai**

Localizar (linhas 387-396 atuais):

```tsx
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                setModalOpen(false);
                onConfirm(selectedIdsArray, selectedConfigId || null);
                setSelectedUserIds(new Set());
                setSelectedConfigId("");
                setSearchTerm("");
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
```

Substituir por:

```tsx
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                // Modal pai permanece aberto durante a operação (fase 2/3)
                onConfirm(selectedIdsArray, selectedConfigId || null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
```

- [ ] **Step 8: Verificar build**

```
npm run build
```

Esperado: build conclui sem erros (mesmo que a UI da fase 2/3 ainda não esteja renderizada — será adicionada nas próximas tasks).

- [ ] **Step 9: Commit**

```
git add src/pages/LeadDistribution.tsx src/components/roulette/RedistributeFromCollaboratorPanel.tsx
git commit -m "feat(roleta): props/estado de fase no Panel + bloqueio de close durante execucao"
```

---

### Task 9: Renderizar fase 2 (em execução) dentro do modal

**Files:**
- Modify: `src/components/roulette/RedistributeFromCollaboratorPanel.tsx`

- [ ] **Step 1: Envolver o conteúdo da fase 1 num bloco condicional e adicionar fase 2**

Localizar o `<DialogContent>` inteiro (linhas 205-372 atuais). Vou substituir todo o `<div className="space-y-4 py-2">` e o `<DialogFooter>` para renderizar condicionalmente baseado em `phase`.

Localizar (linha 213):

```tsx
          <div className="space-y-4 py-2">
            {/* Colaboradores (multi-select via Popover) */}
```

Substituir essa abertura por:

```tsx
          <div className="space-y-4 py-2">
            {phase === "idle" && (
            <>
            {/* Colaboradores (multi-select via Popover) */}
```

Localizar o fechamento desse mesmo `<div className="space-y-4 py-2">` (próximo ao final do RadioGroup, antes do `</div>` que abre o footer). Procure:

```tsx
              </RadioGroup>
            </div>
          </div>

          <DialogFooter>
```

Substituir por:

```tsx
              </RadioGroup>
            </div>
            </>
            )}

            {/* Fase 2 — Em execução */}
            {phase === "running" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm font-medium">Redistribuindo {redistState.total} lead(s)...</span>
                </div>
                <div className="space-y-1">
                  <Progress
                    value={redistState.total > 0 ? (redistState.current / redistState.total) * 100 : 0}
                    className="h-2"
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{redistState.current} / {redistState.total}</span>
                    <span>{computeEta(Math.max(0, redistState.total - redistState.current), redistState.current)}</span>
                  </div>
                </div>
                <div className="rounded-md border bg-muted/30 max-h-72 overflow-y-auto p-2 space-y-1">
                  {redistState.log.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">Iniciando...</p>
                  ) : (
                    redistState.log.slice(0, 50).map((a, i) => (
                      <div key={`${a.lead_id}-${a.timestamp}-${i}`} className="flex items-center gap-2 text-xs">
                        {a.agent_user_id ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            <span className="truncate"><span className="font-medium">{a.lead_nome}</span> → {a.agent_name}</span>
                          </>
                        ) : (
                          <>
                            <Ban className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                            <span className="truncate text-muted-foreground"><span className="font-medium">{a.lead_nome}</span> — sem agente compatível</span>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
```

- [ ] **Step 2: Atualizar o `<DialogFooter>` para mostrar botões diferentes por fase**

Localizar (linhas atuais do footer, agora movido):

```tsx
          <DialogFooter>
            <Button variant="outline" onClick={() => handleModalChange(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => setConfirmOpen(true)}
              disabled={!canConfirm}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Redistribuir {activeLeadsCount ?? 0} lead(s)
            </Button>
          </DialogFooter>
```

Substituir por:

```tsx
          <DialogFooter>
            {phase === "idle" && (
              <>
                <Button variant="outline" onClick={() => handleModalChange(false)}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setConfirmOpen(true)}
                  disabled={!canConfirm}
                >
                  Redistribuir {activeLeadsCount ?? 0} lead(s)
                </Button>
              </>
            )}
            {phase === "running" && (
              <Button variant="destructive" onClick={handleCancelClick}>
                <XCircle className="h-4 w-4 mr-2" /> Cancelar
              </Button>
            )}
          </DialogFooter>
```

- [ ] **Step 3: Verificar build**

```
npm run build
```

Esperado: build conclui sem erros. `canConfirm` continua usado só na fase idle.

- [ ] **Step 4: Commit**

```
git add src/components/roulette/RedistributeFromCollaboratorPanel.tsx
git commit -m "feat(roleta): fase 2 (em execucao) no modal de redistribuicao de colaboradores"
```

---

### Task 10: Renderizar fase 3 (done / aborted / error)

**Files:**
- Modify: `src/components/roulette/RedistributeFromCollaboratorPanel.tsx`

- [ ] **Step 1: Adicionar bloco de fase 3 entre o bloco de fase 2 e o fechamento do `</div>` do conteúdo**

Localizar o final do bloco de fase 2 (após `</div>` que fecha o log e antes do `</div>` que fecha o `space-y-4 py-2`):

```tsx
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
```

Substituir por:

```tsx
                </div>
              </div>
            )}

            {/* Fase 3 — Concluído / Cancelado / Erro */}
            {isFinished && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {phase === "done" && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                  {phase === "aborted" && <AlertTriangle className="h-5 w-5 text-amber-600" />}
                  {phase === "error" && <XCircle className="h-5 w-5 text-destructive" />}
                  <span className="text-sm font-medium">
                    {phase === "done" && `Redistribuição concluída: ${redistState.current - redistState.skipped} de ${redistState.total} leads atribuídos`}
                    {phase === "aborted" && `Operação cancelada após ${redistState.current - redistState.skipped} de ${redistState.total} leads`}
                    {phase === "error" && `Erro: ${redistState.errorMessage || "falha desconhecida"}`}
                  </span>
                </div>
                {redistState.skipped > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                    {redistState.skipped} lead(s) aguardando configuração de roleta/agente.
                  </div>
                )}
                {phase === "error" && (
                  <p className="text-xs text-muted-foreground">
                    {redistState.current - redistState.skipped} leads foram redistribuídos antes da falha. Use "Retomar" para continuar.
                  </p>
                )}
                {redistState.log.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver log completo ({redistState.log.length})</summary>
                    <div className="mt-2 max-h-48 overflow-y-auto space-y-1 rounded-md border bg-muted/30 p-2">
                      {redistState.log.map((a, i) => (
                        <div key={`final-${a.lead_id}-${a.timestamp}-${i}`} className="flex items-center gap-2">
                          {a.agent_user_id ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                              <span className="truncate"><span className="font-medium">{a.lead_nome}</span> → {a.agent_name}</span>
                            </>
                          ) : (
                            <>
                              <Ban className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                              <span className="truncate text-muted-foreground"><span className="font-medium">{a.lead_nome}</span> — sem agente</span>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
```

- [ ] **Step 2: Adicionar botões da fase 3 no footer**

Localizar o footer (que agora tem só os blocos `idle` e `running`):

```tsx
          <DialogFooter>
            {phase === "idle" && (
              <>
                <Button variant="outline" onClick={() => handleModalChange(false)}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setConfirmOpen(true)}
                  disabled={!canConfirm}
                >
                  Redistribuir {activeLeadsCount ?? 0} lead(s)
                </Button>
              </>
            )}
            {phase === "running" && (
              <Button variant="destructive" onClick={handleCancelClick}>
                <XCircle className="h-4 w-4 mr-2" /> Cancelar
              </Button>
            )}
          </DialogFooter>
```

Substituir por:

```tsx
          <DialogFooter>
            {phase === "idle" && (
              <>
                <Button variant="outline" onClick={() => handleModalChange(false)}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setConfirmOpen(true)}
                  disabled={!canConfirm}
                >
                  Redistribuir {activeLeadsCount ?? 0} lead(s)
                </Button>
              </>
            )}
            {phase === "running" && (
              <Button variant="destructive" onClick={handleCancelClick}>
                <XCircle className="h-4 w-4 mr-2" /> Cancelar
              </Button>
            )}
            {isFinished && (
              <>
                {phase === "error" && (
                  <Button variant="outline" onClick={onResume}>
                    Retomar
                  </Button>
                )}
                <Button onClick={handleClose}>Fechar</Button>
              </>
            )}
          </DialogFooter>
```

- [ ] **Step 3: Verificar build**

```
npm run build
```

Esperado: build conclui sem erros.

- [ ] **Step 4: Commit**

```
git add src/components/roulette/RedistributeFromCollaboratorPanel.tsx
git commit -m "feat(roleta): fase 3 (done/aborted/error) com retomar e log completo"
```

---

### Task 11: AlertDialog de confirmação de cancelamento

**Files:**
- Modify: `src/components/roulette/RedistributeFromCollaboratorPanel.tsx`

- [ ] **Step 1: Adicionar AlertDialog extra após o AlertDialog de confirmação destrutiva existente**

Localizar o fim do componente (próximo do final, após `</AlertDialog>` e antes do `</>`):

```tsx
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

Substituir por:

```tsx
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de cancelamento (somente quando há progresso) */}
      <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar redistribuição?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{redistState.current - redistState.skipped}</strong> lead(s) já foram redistribuídos. Cancelar agora não desfaz o que já foi feito — os leads restantes permanecem com os colaboradores originais.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar redistribuindo</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setCancelConfirmOpen(false);
                onCancel();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancelar operação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 2: Verificar build**

```
npm run build
```

Esperado: build conclui sem erros.

- [ ] **Step 3: Commit**

```
git add src/components/roulette/RedistributeFromCollaboratorPanel.tsx
git commit -m "feat(roleta): AlertDialog de confirmacao ao cancelar redistribuicao em andamento"
```

---

### Task 12: Lint + smoke manual completo

**Files:** (nenhum — apenas verificação)

- [ ] **Step 1: Lint**

```
npm run lint
```

Esperado: zero erros. Warnings de hooks com dependências não-exaustivas em arquivos que NÃO foram tocados podem existir — ignorar. Erros em `LeadDistribution.tsx` ou `RedistributeFromCollaboratorPanel.tsx` precisam ser corrigidos antes de seguir.

- [ ] **Step 2: Build de produção**

```
npm run build
```

Esperado: build conclui sem erros.

- [ ] **Step 3: Smoke manual — Teste #1 do spec (0 leads)**

```
npm run dev
```

No navegador: Roleta de Leads → "Redistribuir leads de um colaborador" → selecionar um colaborador sem leads ativos → confirmar.

Esperado: toast informativo "Nenhum lead foi redistribuído". Modal **não** entra em fase 2.

- [ ] **Step 4: Smoke manual — Teste #2 do spec (5 leads)**

Selecionar um colaborador com 5 leads → confirmar redistribuição.

Esperado: fase 2 aparece, 5 linhas no log com ✓ verde, ETA mostra `~10s restantes` no início, total dura ~10s, fase 3 mostra "5 de 5 leads atribuídos", botão Fechar funciona.

- [ ] **Step 5: Smoke manual — Teste #3 (modo híbrido com cruzamento de 50)**

Se possível, selecionar colaboradores que somem 75+ leads → confirmar.

Esperado: ETA inicial mostra ~100s para os primeiros 50, depois acelera. Total ~112s. Log scrolla com novos eventos no topo.

- [ ] **Step 6: Smoke manual — Teste #4 (cancelar na metade)**

Iniciar uma redistribuição de 20+ leads. Aos ~10 redistribuídos, clicar "Cancelar".

Esperado: AlertDialog "Cancelar redistribuição?" aparece com contagem correta. Clicar "Cancelar operação" → fase 3 mostra "Operação cancelada após X de N leads". Botão "Continuar redistribuindo" no AlertDialog também precisa funcionar (não cancela).

- [ ] **Step 7: Smoke manual — Teste #6 (sem roleta ativa)**

Desativar todas as roletas (ou usar uma org sem roletas) → tentar redistribuir.

Esperado: log mostra todas as linhas como ⊘ amarelo "sem agente compatível". Fase 3 mostra aviso amarelo `N lead(s) aguardando configuração`. Anti-loop tolera 3 iterações vazias.

- [ ] **Step 8: Smoke manual — Teste #8 (regressão "Redistribuir agora")**

Voltar ao estado normal (roletas ativas). Criar/ter leads sem responsável. Clicar "Redistribuir agora" (alert laranja).

Esperado: comportamento idêntico ao atual — modal de seleção de roleta, barra de progresso **fora** do modal, toast de sucesso. **Nada foi quebrado.**

- [ ] **Step 9: Smoke manual — Teste #9 (regressão "Redistribuir perdidos")**

Mover leads para etapa Perdido, depois clicar "Redistribuir perdidos" (alert vermelho).

Esperado: comportamento idêntico ao atual.

- [ ] **Step 10: Smoke manual — Teste #10 (TS warnings, console)**

DevTools aberto durante os testes anteriores. Verificar:
- Zero erros no console
- Zero warnings de React (key duplicadas, etc.)

Se algo acima falhar, registrar o caso, voltar à task correspondente e corrigir.

---

### Task 13: Sincronizar vault Obsidian

**Files:**
- Create: `c:\Users\Brito\Desktop\principal\Projetos\Kairoz CRM\02 - Plans\2026-05-21-roleta-redistribuicao-cadenciada.md`
- Modify: `c:\Users\Brito\Desktop\principal\Projetos\Kairoz CRM\Home.md`
- Modify: `c:\Users\Brito\Desktop\principal\Projetos\Kairoz CRM\Changelog.md`

- [ ] **Step 1: Copiar plano para o vault**

Powershell:

```
Copy-Item -Force "C:\Users\Brito\Desktop\principal\Kairoz\Teste - CRM Kairoz\CRM---Definitivo\docs\superpowers\plans\2026-05-21-roleta-redistribuicao-cadenciada.md" "c:\Users\Brito\Desktop\principal\Projetos\Kairoz CRM\02 - Plans\2026-05-21-roleta-redistribuicao-cadenciada.md"
```

- [ ] **Step 2: Atualizar contagem de Plans no Home.md (26 → 27)**

Edit em `c:\Users\Brito\Desktop\principal\Projetos\Kairoz CRM\Home.md`:

Localizar:

```
## Plans de Implementação (26)
```

Substituir por:

```
## Plans de Implementação (27)
```

- [ ] **Step 3: Adicionar entrada do plan no Home.md (ordem cronológica)**

No mesmo arquivo, localizar:

```
- [[2026-05-21-lead-no-show]]

## Edge Functions (78)
```

Substituir por:

```
- [[2026-05-21-lead-no-show]]
- [[2026-05-21-roleta-redistribuicao-cadenciada]]

## Edge Functions (78)
```

- [ ] **Step 4: Adicionar entrada no Changelog.md**

Edit em `c:\Users\Brito\Desktop\principal\Projetos\Kairoz CRM\Changelog.md`:

Localizar:

```
## 2026-05-21

- **[Spec]** Redistribuição cadenciada lead-a-lead na Roleta — modal 3-fases com barra de progresso, log de atribuições, delay adaptativo (2s/lead até 50, 500ms depois), cancelamento via AbortController. Resolve "trava ao redistribuir leads de colaboradores" → [[2026-05-21-roleta-redistribuicao-cadenciada]]
```

Substituir por:

```
## 2026-05-21

- **[Plan]** Plano de implementação da Redistribuição cadenciada — 13 tasks (helper aditivo, edge function batch=1, deploy, estado isolado, mutation cadenciada com AbortController/retry, modal 3-fases com barra/log/ETA, AlertDialog de cancelamento, lint+build+smoke, sync vault) → [[2026-05-21-roleta-redistribuicao-cadenciada]]
- **[Spec]** Redistribuição cadenciada lead-a-lead na Roleta — modal 3-fases com barra de progresso, log de atribuições, delay adaptativo (2s/lead até 50, 500ms depois), cancelamento via AbortController. Resolve "trava ao redistribuir leads de colaboradores" → [[2026-05-21-roleta-redistribuicao-cadenciada]]
```

- [ ] **Step 5: Commit do plano (no repo, não no vault — vault não é git)**

```
git add docs/superpowers/plans/2026-05-21-roleta-redistribuicao-cadenciada.md
git commit -m "docs(plan): redistribuicao cadenciada lead-a-lead na Roleta"
```

---

## Resumo da execução

Após todas as 13 tasks:

- **Backend:** `_shared/redistribute-batch.ts` retorna `assignments` (aditivo), `redistribute-from-collaborator` processa 1 lead por chamada, ambas edge functions redeployadas
- **Frontend:** modal de redistribuição de colaboradores tem 3 fases (configuração → execução → final), barra de progresso e log corrido dentro do modal, delay adaptativo de 2s→500ms, cancelamento via AbortController, retry simples em erro de rede
- **Isolamento:** `redistributeMutation` e `redistributeLostMutation` inalteradas; barra `redistProgress` fora do modal continua servindo essas duas
- **Vault:** spec + plan espelhados, Home e Changelog atualizados

Total de commits esperado: **12** (1 por task, exceto Task 3 que é só deploy/teste e Task 12 que é só verificação manual).
