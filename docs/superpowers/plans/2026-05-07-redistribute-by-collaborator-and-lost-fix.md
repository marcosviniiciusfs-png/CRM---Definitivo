# Redistribuir leads por colaborador + bug fix dos Perdidos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o "Simulador de distribuição" da página Roleta por uma feature útil "Redistribuir leads de um colaborador" (auto-roteamento por source+funil), corrigir bug onde redistribuição de Perdidos parava em ~19 leads, e garantir robustez (cap + delay + guarda) para redistribuir TODOS os leads independente de volume.

**Architecture:** Frontend troca componente colapsável Simulador por novo `RedistributeFromCollaboratorPanel`. Backend ganha edge function nova `redistribute-from-collaborator` que desatribui todos os leads do colaborador e usa o pipeline existente de não-atribuídos. Bug do Perdidos é corrigido filtrando `stage_type='lost'` no banco em vez de em JS após batch. Lógica de redistribuir batch é extraída para `_shared/redistribute-batch.ts` para evitar duplicação entre as funções.

**Tech Stack:** Supabase Edge Functions (Deno + supabase-js@2.81.0), React + TypeScript, shadcn/ui, TanStack Query.

**Spec:** [docs/superpowers/specs/2026-05-07-redistribute-by-collaborator-and-lost-fix-design.md](../specs/2026-05-07-redistribute-by-collaborator-and-lost-fix-design.md)

**Note about testing:** Sem infra de testes unitários (mesmo do projeto da feature anterior). Verificações via SQL Editor, `curl` e teste manual no browser.

**Note about deploys:** Usuário autorizou Claude a fazer deploys de Edge Functions (memória `feedback_deploy.md`).

---

## File Map

**Novos:**
- `supabase/functions/_shared/redistribute-batch.ts` — helper compartilhado `redistributeBatch(supabase, orgId, options)` que processa 1 batch de leads sem dono via `findBestConfig` + roleta apropriada
- `supabase/functions/redistribute-from-collaborator/index.ts` — edge function que desatribui leads do colaborador e chama o helper em loop até esgotar
- `src/components/roulette/RedistributeFromCollaboratorPanel.tsx` — painel colapsável novo com dropdown + count + botão + modal de confirmação

**Editados:**
- `src/pages/LeadDistribution.tsx` — remove botão Simular + componente Simulator + state; adiciona botão e mutation novos; aplica cap=500/delay=800ms/guarda anti-loop nas 3 mutations
- `supabase/functions/redistribute-lost-leads/index.ts` — 3 patches (filtro DB, has_more correto, BATCH_SIZE=100)
- `supabase/functions/redistribute-unassigned-leads/index.ts` — refatorar para usar `_shared/redistribute-batch.ts` (Task 8, último, com verificação)

**Deletados:**
- `src/components/roulette/RouletteSimulator.tsx`

---

## Task 1: Frontend — robustez nas 2 mutations existentes (cap + delay + guarda)

**Files:**
- Modify: `src/pages/LeadDistribution.tsx:136-238`

Aplica cap de 500 iterações, delay de 800ms entre iterações, e guarda anti-loop-vazio nas mutations `redistributeMutation` (linhas 136-186) e `redistributeLostMutation` (linhas 189-238). Não toca em backend ainda — esta task ganha valor imediato sem mexer em edge functions.

- [ ] **Step 1.1: Localizar e reescrever `redistributeMutation`**

Em `src/pages/LeadDistribution.tsx`, localizar `const redistributeMutation = useMutation({` (linha ~136). Substituir o `mutationFn` inteiro por:

```ts
    mutationFn: async (configId: string | null) => {
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
        const { data, error } = await supabase.functions.invoke("redistribute-unassigned-leads", {
          body: { organization_id: organizationId, config_id: configId },
        });
        if (error) throw error;

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

        // Guarda anti-loop-vazio: se nao processou nenhum mas diz has_more,
        // significa que faltam roletas/agentes. Saimos para nao loopar.
        if (count === 0 && hasMore) {
          break;
        }

        // Delay entre iteracoes para nao travar e dar folga ao banco
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
      if (redistributed > 0) {
        const msg = skipped > 0
          ? `${redistributed} leads redistribuidos. ${skipped} aguardando configuracao de roleta/agente.`
          : `${redistributed} leads redistribuidos com sucesso!`;
        toast.success(msg);
      } else if (skipped > 0) {
        toast.warning(`${skipped} leads aguardando configuracao de roleta/agente.`);
      } else {
        toast.info("Nenhum lead para redistribuir");
      }
      setRedistributeOpen(false);
      setTimeout(() => setRedistProgress({ current: 0, total: 0, isRunning: false }), 3000);
    },
    onError: () => {
      toast.error("Erro ao redistribuir leads");
      setRedistProgress({ current: 0, total: 0, isRunning: false });
    },
```

- [ ] **Step 1.2: Reescrever `redistributeLostMutation`**

Localizar `const redistributeLostMutation = useMutation({` (linha ~189). Substituir o `mutationFn` por (mesma estrutura, ajustada para a função de Perdidos):

```ts
    mutationFn: async (configId: string | null) => {
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
        const { data, error } = await supabase.functions.invoke("redistribute-lost-leads", {
          body: { organization_id: organizationId, config_id: configId },
        });
        if (error) throw error;

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

        if (count === 0 && hasMore) {
          break;
        }

        if (hasMore && iteration < MAX_ITERATIONS) {
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
      }

      setRedistProgress(prev => ({ ...prev, isRunning: false }));
      return { redistributed: totalRedistributed, skipped: totalSkipped };
    },
    onSuccess: ({ redistributed, skipped }) => {
      queryClient.invalidateQueries({ queryKey: ["lost-leads-count"] });
      queryClient.invalidateQueries({ queryKey: ["unassigned-leads-count"] });
      queryClient.invalidateQueries({ queryKey: ["lead-distribution-configs"] });
      if (redistributed > 0) {
        const msg = skipped > 0
          ? `${redistributed} leads perdidos redistribuidos. ${skipped} aguardando configuracao.`
          : `${redistributed} leads perdidos redistribuidos!`;
        toast.success(msg);
      } else if (skipped > 0) {
        toast.warning(`${skipped} leads perdidos aguardando configuracao de roleta/agente.`);
      } else {
        toast.info("Nenhum lead perdido para redistribuir");
      }
      setRedistributeLostOpen(false);
      setTimeout(() => setRedistProgress({ current: 0, total: 0, isRunning: false }), 3000);
    },
    onError: () => {
      toast.error("Erro ao redistribuir leads perdidos");
      setRedistProgress({ current: 0, total: 0, isRunning: false });
    },
```

- [ ] **Step 1.3: Lint**

```bash
npm run lint -- src/pages/LeadDistribution.tsx 2>&1 | grep -A1 "src/pages/LeadDistribution.tsx" | head -20
```

Esperado: erros pré-existentes em outras seções do arquivo continuam (são pre-existing); zero novos erros.

- [ ] **Step 1.4: Commit**

```bash
git add src/pages/LeadDistribution.tsx
git commit -m "fix(roleta): cap=500, delay 800ms e guarda anti-loop nas mutations

Garante que redistribuicoes processem TODOS os leads (ate 50k por
execucao) com delay entre iteracoes para nao travar UI/banco e
guarda contra loop infinito quando faltam roletas/agentes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

CRITICAL: stage apenas `src/pages/LeadDistribution.tsx`. Working tree tem WIPs.

---

## Task 2: Backend — bug fix em `redistribute-lost-leads`

**Files:**
- Modify: `supabase/functions/redistribute-lost-leads/index.ts`

Três patches: filtrar perdidos no banco em vez de JS, calcular `has_more` por count real, reduzir BATCH_SIZE.

- [ ] **Step 2.1: Reduzir BATCH_SIZE**

No topo do arquivo, linha 10, trocar:
```ts
const BATCH_SIZE = 200;
```
por:
```ts
const BATCH_SIZE = 100;
```

- [ ] **Step 2.2: Substituir o bloco de fetch + filtro JS por query DB-level**

Localizar o bloco linhas 33-56 (que faz `select('id, source, funnel_id, funnel_stage_id').not('funnel_stage_id', 'is', null).limit(BATCH_SIZE)` seguido de filtro JS via `lostStageIds`).

Substituir todo esse bloco por:

```ts
    // 1. Pré-buscar IDs de stages 'lost' desta org (org-scoped via JOIN)
    const { data: lostStages, error: lostStagesErr } = await supabase
      .from('funnel_stages')
      .select('id, sales_funnels!inner(organization_id)')
      .eq('sales_funnels.organization_id', organization_id)
      .eq('stage_type', 'lost');
    if (lostStagesErr) {
      console.error('❌ Erro ao buscar stages lost:', lostStagesErr);
      return new Response(
        JSON.stringify({ success: false, error: `Erro ao buscar stages: ${lostStagesErr.message}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }
    const lostStageIds = (lostStages || []).map((s: { id: string }) => s.id);

    if (lostStageIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, redistributed_count: 0, total: 0, has_more: false, message: 'Nenhuma etapa Perdido configurada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar leads perdidos diretamente do banco
    const { data: lostLeads, error: leadsError } = await supabase
      .from('leads')
      .select('id, source, funnel_id, funnel_stage_id')
      .eq('organization_id', organization_id)
      .in('funnel_stage_id', lostStageIds)
      .limit(BATCH_SIZE);

    if (leadsError) throw leadsError;

    const filteredLeads = lostLeads || [];

    // Contar total restante de perdidos (para has_more correto)
    const { count: totalCount, error: countError } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organization_id)
      .in('funnel_stage_id', lostStageIds);

    if (countError) throw countError;
```

A variável `filteredLeads` (que antes era resultado do filter JS) agora é `lostLeads || []`. O resto do código que usa `filteredLeads` não muda.

- [ ] **Step 2.3: Corrigir cálculo de `has_more`**

Localizar (linha ~261, perto do final): `const hasMore = filteredLeads.length >= BATCH_SIZE;`. Substituir por:

```ts
    // has_more baseado em count real do que sobrou apos esta iteracao
    // (filteredLeads ja foram processados nesta chamada)
    const remainingAfter = (totalCount || 0) - redistributedCount;
    const hasMore = remainingAfter > 0;
```

- [ ] **Step 2.4: Deploy**

```bash
npx supabase functions deploy redistribute-lost-leads
```

- [ ] **Step 2.5: Verificação rápida**

```bash
curl -i -X OPTIONS "https://uxttihjsxfowursjyult.supabase.co/functions/v1/redistribute-lost-leads"
```

Esperado: HTTP/2 200 com CORS headers.

Verificação funcional fica para o teste manual final.

- [ ] **Step 2.6: Commit**

```bash
git add supabase/functions/redistribute-lost-leads/index.ts
git commit -m "fix(redistribute-lost): filtrar perdidos no banco, has_more correto

Bug: a query buscava 200 leads quaisquer com stage_id e filtrava
'lost' em JS depois. Se org tinha muitos leads em outros estagios,
batch caia com poucos perdidos e has_more=false (porque len < 200),
fazendo redistribuicao parar em ~19 leads.

Fix:
- Pre-busca IDs de stages 'lost' via JOIN org-scoped
- Busca leads diretamente filtrados por funnel_stage_id IN (lost)
- has_more baseado em count real do que sobra apos a iteracao
- BATCH_SIZE reduzido de 200 para 100 (mais folga de timeout)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Backend — módulo compartilhado `_shared/redistribute-batch.ts`

**Files:**
- Create: `supabase/functions/_shared/redistribute-batch.ts`

Extrai a lógica de "processar 1 batch de leads sem dono e distribuir via roletas" em um módulo standalone. Não é consumido por ninguém ainda — é apenas escrito. As Tasks 4 e 8 vão consumir.

- [ ] **Step 3.1: Criar pasta + arquivo**

```bash
mkdir -p supabase/functions/_shared
touch supabase/functions/_shared/redistribute-batch.ts
```

- [ ] **Step 3.2: Escrever o módulo**

Conteúdo de `supabase/functions/_shared/redistribute-batch.ts`:

```ts
/**
 * Helper compartilhado para redistribuir 1 batch de leads sem dono via roletas.
 *
 * Usado por:
 * - redistribute-from-collaborator (depois de desatribuir leads do colaborador)
 * - redistribute-unassigned-leads (refatoração futura)
 *
 * Aplica a hierarquia: source+funnel > source > all+funnel > all
 */

export interface RedistributeBatchOptions {
  batchSize?: number;
  configId?: string | null;
}

export interface RedistributeBatchResult {
  redistributed: number;
  skipped: number;
  totalRemaining: number;
  hasMore: boolean;
  errors: string[];
}

export async function redistributeBatch(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  organizationId: string,
  options: RedistributeBatchOptions = {}
): Promise<RedistributeBatchResult> {
  const batchSize = options.batchSize ?? 100;
  const configIdFilter = options.configId ?? null;

  // 1. Buscar leads sem dono (excluir won/lost)
  const { data: closedStages, error: closedStagesErr } = await supabase
    .from('funnel_stages')
    .select('id, sales_funnels!inner(organization_id)')
    .eq('sales_funnels.organization_id', organizationId)
    .in('stage_type', ['won', 'lost']);
  if (closedStagesErr) {
    return { redistributed: 0, skipped: 0, totalRemaining: 0, hasMore: false, errors: [`closedStages: ${closedStagesErr.message}`] };
  }
  const closedStageIds = (closedStages || []).map((s: { id: string }) => s.id);

  let leadsQuery = supabase
    .from('leads')
    .select('id, source, funnel_id')
    .eq('organization_id', organizationId)
    .is('responsavel_user_id', null)
    .limit(batchSize);
  if (closedStageIds.length > 0) {
    leadsQuery = leadsQuery.or(
      `funnel_stage_id.is.null,funnel_stage_id.not.in.(${closedStageIds.join(',')})`
    );
  }
  const { data: unassignedLeads, error: leadsError } = await leadsQuery;
  if (leadsError) {
    return { redistributed: 0, skipped: 0, totalRemaining: 0, hasMore: false, errors: [`leadsFetch: ${leadsError.message}`] };
  }

  if (!unassignedLeads || unassignedLeads.length === 0) {
    return { redistributed: 0, skipped: 0, totalRemaining: 0, hasMore: false, errors: [] };
  }

  // 2. Contar total restante
  let countQuery = supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .is('responsavel_user_id', null);
  if (closedStageIds.length > 0) {
    countQuery = countQuery.or(
      `funnel_stage_id.is.null,funnel_stage_id.not.in.(${closedStageIds.join(',')})`
    );
  }
  const { count: totalRemaining } = await countQuery;

  // 3. Buscar configs ativos da org
  const { data: configs, error: configsError } = await supabase
    .from('lead_distribution_configs')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true);
  if (configsError) {
    return { redistributed: 0, skipped: 0, totalRemaining: totalRemaining || 0, hasMore: false, errors: [`configsFetch: ${configsError.message}`] };
  }
  if (!configs || configs.length === 0) {
    return { redistributed: 0, skipped: unassignedLeads.length, totalRemaining: totalRemaining || 0, hasMore: false, errors: ['Nenhuma roleta ativa'] };
  }

  // 4. Buscar agentes por config
  // deno-lint-ignore no-explicit-any
  const agentsByConfig = new Map<string, any[]>();
  for (const config of configs) {
    const eligibleIds = config.eligible_agents as string[] | null;
    const agents = await getAvailableAgentsFast(supabase, organizationId, eligibleIds, config.team_id);
    agentsByConfig.set(config.id, agents);
  }

  // 5. Buscar primeiro estágio dos funis (para mover lead se config tem funil)
  const funnelIds = [...new Set(configs.filter((c: { funnel_id: string | null }) => c.funnel_id).map((c: { funnel_id: string }) => c.funnel_id))];
  const firstStages = new Map<string, string>();
  if (funnelIds.length > 0) {
    const { data: stages } = await supabase
      .from('funnel_stages')
      .select('id, funnel_id, position')
      .in('funnel_id', funnelIds)
      .not('stage_type', 'in', '("won","lost")')
      .order('position', { ascending: true });
    for (const s of (stages || [])) {
      if (!firstStages.has(s.funnel_id)) firstStages.set(s.funnel_id, s.id);
    }
  }

  // 6. Último agente por config (round-robin contínuo)
  const lastAgentByConfig = new Map<string, string>();
  for (const config of configs) {
    const { data: lastHistory } = await supabase
      .from('lead_distribution_history')
      .select('to_user_id')
      .eq('organization_id', organizationId)
      .eq('config_id', config.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastHistory) lastAgentByConfig.set(config.id, lastHistory.to_user_id);
  }

  // 7. Distribuir
  const effectiveConfig = configIdFilter
    // deno-lint-ignore no-explicit-any
    ? configs.find((c: any) => c.id === configIdFilter) || null
    : null;
  // deno-lint-ignore no-explicit-any
  const fallbackConfig = configs.find((c: any) => c.source_type === 'all' && !c.funnel_id)
    // deno-lint-ignore no-explicit-any
    || configs.find((c: any) => agentsByConfig.get(c.id)?.length > 0)
    || null;

  let redistributedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];
  // deno-lint-ignore no-explicit-any
  const leadsByConfig = new Map<string, { leads: any[], agents: any[], agentIndex: number }>();

  for (const lead of unassignedLeads) {
    const config = effectiveConfig || findBestConfig(configs, lead) || fallbackConfig;
    if (!config) { skippedCount++; continue; }
    const agents = agentsByConfig.get(config.id);
    if (!agents || agents.length === 0) { skippedCount++; continue; }

    let group = leadsByConfig.get(config.id);
    if (!group) {
      const lastAgentId = lastAgentByConfig.get(config.id);
      let startIndex = 0;
      if (lastAgentId) {
        // deno-lint-ignore no-explicit-any
        const idx = agents.findIndex((a: any) => a.user_id === lastAgentId);
        if (idx !== -1) startIndex = (idx + 1) % agents.length;
      }
      group = { leads: [], agents, agentIndex: startIndex };
      leadsByConfig.set(config.id, group);
    }

    const selectedAgent = group.agents[group.agentIndex];
    group.agentIndex = (group.agentIndex + 1) % group.agents.length;
    group.leads.push({ ...lead, agent: selectedAgent, config });
  }

  // 8. Batch update por agente
  // deno-lint-ignore no-explicit-any
  const historyRecords: any[] = [];
  for (const [configId, group] of leadsByConfig) {
    const config = group.leads[0]?.config;
    if (!config || group.leads.length === 0) continue;

    // deno-lint-ignore no-explicit-any
    const agentLeadMap = new Map<string, any[]>();
    for (const item of group.leads) {
      if (!agentLeadMap.has(item.agent.user_id)) agentLeadMap.set(item.agent.user_id, []);
      agentLeadMap.get(item.agent.user_id)!.push(item);
    }

    for (const [agentId, items] of agentLeadMap) {
      const agent = items[0].agent;
      const leadIds = items.map((i: { id: string }) => i.id);
      // deno-lint-ignore no-explicit-any
      const update: Record<string, any> = {
        responsavel_user_id: agentId,
        responsavel: agent.full_name || agent.email,
      };
      if (config.funnel_id) {
        update.funnel_id = config.funnel_id;
        const stageId = config.funnel_stage_id || firstStages.get(config.funnel_id);
        if (stageId) update.funnel_stage_id = stageId;
      }
      const { error: updateError } = await supabase
        .from('leads')
        .update(update)
        .in('id', leadIds);
      if (updateError) {
        errors.push(`Update batch (${leadIds.length} leads): ${updateError.message}`);
        continue;
      }
      redistributedCount += leadIds.length;
      for (const item of items) {
        historyRecords.push({
          lead_id: item.id,
          organization_id: organizationId,
          config_id: configId,
          to_user_id: agentId,
          distribution_method: config.distribution_method,
          trigger_source: 'manual',
          is_redistribution: true,
        });
      }
    }
  }

  // 9. Insert historico
  if (historyRecords.length > 0) {
    const { error: histError } = await supabase
      .from('lead_distribution_history')
      .insert(historyRecords);
    if (histError) errors.push(`History insert: ${histError.message}`);
  }

  const remainingAfter = (totalRemaining || 0) - redistributedCount;
  return {
    redistributed: redistributedCount,
    skipped: skippedCount,
    totalRemaining: remainingAfter,
    hasMore: remainingAfter > 0,
    errors,
  };
}

// deno-lint-ignore no-explicit-any
function findBestConfig(configs: any[], lead: { source?: string; funnel_id?: string | null }): any | null {
  const leadSource = lead.source?.toLowerCase() || '';
  let sourceType = 'all';
  if (leadSource.includes('whatsapp')) sourceType = 'whatsapp';
  else if (leadSource.includes('facebook')) sourceType = 'facebook';
  else if (leadSource.includes('webhook') || leadSource.includes('formulário')) sourceType = 'webhook';

  const funnelId = lead.funnel_id || null;

  // deno-lint-ignore no-explicit-any
  if (funnelId) {
    const c = configs.find((c: any) => c.source_type === sourceType && c.funnel_id === funnelId);
    if (c) return c;
  }
  // deno-lint-ignore no-explicit-any
  const c2 = configs.find((c: any) => c.source_type === sourceType && !c.funnel_id);
  if (c2) return c2;
  if (funnelId) {
    // deno-lint-ignore no-explicit-any
    const c3 = configs.find((c: any) => c.source_type === 'all' && c.funnel_id === funnelId);
    if (c3) return c3;
  }
  // deno-lint-ignore no-explicit-any
  const c4 = configs.find((c: any) => c.source_type === 'all' && !c.funnel_id);
  return c4 || null;
}

// deno-lint-ignore no-explicit-any
async function getAvailableAgentsFast(supabase: any, organization_id: string, eligibleAgentIds?: string[] | null, team_id?: string | null): Promise<any[]> {
  let settingsQuery = supabase
    .from('agent_distribution_settings')
    .select('*')
    .eq('organization_id', organization_id)
    .eq('is_active', true)
    .eq('is_paused', false)
    .order('user_id', { ascending: true });

  let effectiveIds = eligibleAgentIds;

  if (team_id) {
    const { data: teamMembers } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('team_id', team_id);
    if (teamMembers && teamMembers.length > 0) {
      // deno-lint-ignore no-explicit-any
      const teamIds = teamMembers.map((tm: any) => tm.user_id);
      if (effectiveIds && effectiveIds.length > 0) {
        effectiveIds = effectiveIds.filter(id => teamIds.includes(id));
      } else {
        effectiveIds = teamIds;
      }
    } else {
      return [];
    }
  }

  if (effectiveIds && effectiveIds.length > 0) {
    settingsQuery = settingsQuery.in('user_id', effectiveIds);
  }

  let { data: settings } = await settingsQuery;

  if (!settings || settings.length === 0) {
    let membersQuery = supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', organization_id)
      .eq('is_active', true)
      .order('user_id', { ascending: true });
    if (effectiveIds && effectiveIds.length > 0) {
      membersQuery = membersQuery.in('user_id', effectiveIds);
    }
    const { data: orgMembers } = await membersQuery;
    if (!orgMembers || orgMembers.length === 0) return [];
    // deno-lint-ignore no-explicit-any
    settings = orgMembers.map((m: any) => ({
      user_id: m.user_id,
      organization_id,
      is_active: true,
      is_paused: false,
      max_capacity: 999,
      priority_weight: 1,
      capacity_enabled: false,
      pause_until: null,
      working_hours: null,
    }));
  }

  // deno-lint-ignore no-explicit-any
  const userIds = settings.map((s: any) => s.user_id);
  const [profilesResult, membersResult] = await Promise.all([
    supabase.from('profiles').select('user_id, full_name').in('user_id', userIds),
    supabase.from('organization_members').select('user_id, email').in('user_id', userIds).eq('organization_id', organization_id),
  ]);
  // deno-lint-ignore no-explicit-any
  const profilesMap = new Map((profilesResult.data || []).map((p: any) => [p.user_id, p]));
  // deno-lint-ignore no-explicit-any
  const membersMap = new Map((membersResult.data || []).map((m: any) => [m.user_id, m]));

  const now = new Date();
  const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const currentTime = now.toTimeString().slice(0, 5);

  // deno-lint-ignore no-explicit-any
  const available: any[] = [];
  for (const agent of settings) {
    if (agent.pause_until && new Date(agent.pause_until) > now) continue;
    // deno-lint-ignore no-explicit-any
    const workingHours = agent.working_hours as any;
    if (workingHours && workingHours[currentDay]) {
      const { start, end } = workingHours[currentDay];
      if (currentTime < start || currentTime > end) continue;
    }
    available.push({
      user_id: agent.user_id,
      // deno-lint-ignore no-explicit-any
      full_name: (profilesMap.get(agent.user_id) as any)?.full_name,
      // deno-lint-ignore no-explicit-any
      email: (membersMap.get(agent.user_id) as any)?.email,
      priority_weight: agent.priority_weight,
      current_load: 0,
      max_capacity: 0,
    });
  }

  return available;
}
```

- [ ] **Step 3.3: Commit**

O módulo é standalone (não tem caller ainda). Apenas commitar:

```bash
git add supabase/functions/_shared/redistribute-batch.ts
git commit -m "feat(shared): redistributeBatch helper para reaproveitar logica de roleta

Extrai a logica de 'processar 1 batch de leads sem dono via roletas'
em um modulo standalone. Aplica hierarquia source+funnel > source >
all+funnel > all (mesma do redistribute-unassigned-leads). Usado
pela nova funcao redistribute-from-collaborator (Task 4).

Refactor de redistribute-unassigned-leads para consumi-lo fica como
follow-up (Task 8) com gates de verificacao.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Backend — nova edge function `redistribute-from-collaborator`

**Files:**
- Create: `supabase/functions/redistribute-from-collaborator/index.ts`

Função nova que desatribui todos os leads ativos de um colaborador e chama `redistributeBatch` em loop até esgotar.

- [ ] **Step 4.1: Criar pasta + arquivo**

```bash
mkdir -p supabase/functions/redistribute-from-collaborator
touch supabase/functions/redistribute-from-collaborator/index.ts
```

- [ ] **Step 4.2: Escrever a função**

Conteúdo de `supabase/functions/redistribute-from-collaborator/index.ts`:

```ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";
import { redistributeBatch } from "../_shared/redistribute-batch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Auth: JWT do owner ou admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: "JWT inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Parse body
    const { organization_id, collaborator_user_id } = await req.json();
    if (!organization_id || !collaborator_user_id) {
      return new Response(JSON.stringify({ error: "organization_id e collaborator_user_id são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Caller é owner ou admin?
    const { data: callerMember, error: callerErr } = await supabase
      .from("organization_members")
      .select("role")
      .eq("user_id", caller.id)
      .eq("organization_id", organization_id)
      .maybeSingle();
    if (callerErr) throw new Error(`Caller lookup: ${callerErr.message}`);
    if (!callerMember || (callerMember.role !== "owner" && callerMember.role !== "admin")) {
      return new Response(JSON.stringify({ error: "Apenas owner ou admin podem redistribuir leads" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Verificar que o colaborador existe na org
    const { data: target, error: targetErr } = await supabase
      .from("organization_members")
      .select("id, user_id")
      .eq("user_id", collaborator_user_id)
      .eq("organization_id", organization_id)
      .maybeSingle();
    if (targetErr) throw new Error(`Target lookup: ${targetErr.message}`);
    if (!target) {
      return new Response(JSON.stringify({ error: "Colaborador não encontrado nesta organização" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Identificar stages won/lost para excluir
    const { data: closedStages } = await supabase
      .from("funnel_stages")
      .select("id, sales_funnels!inner(organization_id)")
      .eq("sales_funnels.organization_id", organization_id)
      .in("stage_type", ["won", "lost"]);
    const closedStageIds = (closedStages || []).map((s: { id: string }) => s.id);

    // 6. Contar leads ativos do colaborador (intent)
    let countQuery = supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization_id)
      .eq("responsavel_user_id", collaborator_user_id);
    if (closedStageIds.length > 0) {
      countQuery = countQuery.or(
        `funnel_stage_id.is.null,funnel_stage_id.not.in.(${closedStageIds.join(",")})`
      );
    }
    const { count: totalIntended, error: countErr } = await countQuery;
    if (countErr) throw new Error(`Count intended: ${countErr.message}`);

    if (!totalIntended || totalIntended === 0) {
      return new Response(JSON.stringify({
        success: true,
        redistributed_count: 0,
        total_intended: 0,
        skipped: 0,
        message: "Nenhum lead ativo para redistribuir"
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 7. Desatribuir TODOS os leads ativos do colaborador (operação única)
    let unassignQuery = supabase
      .from("leads")
      .update({ responsavel_user_id: null, responsavel: null })
      .eq("organization_id", organization_id)
      .eq("responsavel_user_id", collaborator_user_id);
    if (closedStageIds.length > 0) {
      unassignQuery = unassignQuery.or(
        `funnel_stage_id.is.null,funnel_stage_id.not.in.(${closedStageIds.join(",")})`
      );
    }
    const { error: unassignErr } = await unassignQuery;
    if (unassignErr) throw new Error(`Unassign: ${unassignErr.message}`);

    // 8. Loop: chamar redistributeBatch até esgotar
    let totalRedistributed = 0;
    let totalSkipped = 0;
    let iteration = 0;
    const MAX_ITERATIONS = 500;
    const startTime = Date.now();
    const allErrors: string[] = [];

    while (iteration < MAX_ITERATIONS) {
      iteration++;
      const result = await redistributeBatch(supabase, organization_id, { batchSize: 100 });
      totalRedistributed += result.redistributed;
      totalSkipped += result.skipped;
      allErrors.push(...result.errors);

      if (!result.hasMore) break;
      // Anti-loop: se nao processou nada mas hasMore, sai
      if (result.redistributed === 0 && result.skipped > 0) break;
      if (result.redistributed === 0) break;
    }

    const durationMs = Date.now() - startTime;
    console.log(`✅ [redistribute-from-collaborator] ${totalRedistributed}/${totalIntended} redistribuidos em ${durationMs}ms (skipped: ${totalSkipped}, iteracoes: ${iteration})`);

    return new Response(JSON.stringify({
      success: true,
      redistributed_count: totalRedistributed,
      total_intended: totalIntended,
      skipped: totalSkipped,
      duration_ms: durationMs,
      iterations: iteration,
      errors: allErrors.length > 0 ? allErrors : undefined,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[redistribute-from-collaborator] Error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 4.3: Deploy**

```bash
npx supabase functions deploy redistribute-from-collaborator
```

Esperado: deploy succeeds, mensagem `Deployed Functions on project uxttihjsxfowursjyult: redistribute-from-collaborator`. Se houver erro de import (Deno não acha `_shared/`), pode ser que o CLI exclua pastas com `_` por convenção — verificar.

- [ ] **Step 4.4: Verificação CORS**

```bash
curl -i -X OPTIONS "https://uxttihjsxfowursjyult.supabase.co/functions/v1/redistribute-from-collaborator"
```

Esperado: HTTP/2 200.

- [ ] **Step 4.5: Verificação de auth (sem JWT → 401)**

```bash
curl -i -X POST "https://uxttihjsxfowursjyult.supabase.co/functions/v1/redistribute-from-collaborator" \
  -H "Content-Type: application/json" \
  -H "apikey: <ANON_KEY_DO_PROJETO>" \
  -d '{"organization_id":"00000000-0000-0000-0000-000000000000","collaborator_user_id":"00000000-0000-0000-0000-000000000000"}'
```

Sem JWT no Authorization header, gateway do Supabase rejeita com 401 antes de chegar no código. OK.

- [ ] **Step 4.6: Commit**

```bash
git add supabase/functions/redistribute-from-collaborator/index.ts
git commit -m "feat(edge): redistribute-from-collaborator

Nova edge function que desatribui todos os leads ativos de um
colaborador e os redistribui pelas roletas configuradas (auto-
roteamento por source+funil via redistributeBatch helper).

Caller deve ser owner ou admin da org. Colaborador permanece na
org/roleta — so os leads sao soltos.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Frontend — deletar RouletteSimulator e limpar imports/state

**Files:**
- Delete: `src/components/roulette/RouletteSimulator.tsx`
- Modify: `src/pages/LeadDistribution.tsx`

Removemos o componente Simulador e tudo que o referencia ANTES de adicionar o painel novo (Task 6/7) — diff fica limpo.

- [ ] **Step 5.1: Deletar arquivo do Simulador**

```bash
git rm src/components/roulette/RouletteSimulator.tsx
```

- [ ] **Step 5.2: Remover import e uso em LeadDistribution.tsx**

Em `src/pages/LeadDistribution.tsx`:

1. Remover linha ~9: `import { RouletteSimulator } from "@/components/roulette/RouletteSimulator";`
2. Remover state ~linha 40: `const [simulatorOpen, setSimulatorOpen] = useState(false);`
3. Remover botão ~linha 264-271:
   ```tsx
   <Button
     variant="outline"
     onClick={() => setSimulatorOpen(!simulatorOpen)}
     className="gap-2"
   >
     <Target className="h-4 w-4" />
     Simular
   </Button>
   ```
4. Remover componente ~linha 285:
   ```tsx
   <RouletteSimulator open={simulatorOpen} onToggle={() => setSimulatorOpen(!simulatorOpen)} />
   ```
5. Verificar se o ícone `Target` ainda é usado em outro lugar do arquivo (Grep). Se não for, remover também do import de `lucide-react` na linha 17-27.

- [ ] **Step 5.3: Lint**

```bash
npm run lint -- src/pages/LeadDistribution.tsx 2>&1 | tail -20
```

Esperado: 0 erros de "unused import" ou "unused variable".

- [ ] **Step 5.4: Commit**

```bash
git add src/components/roulette/RouletteSimulator.tsx src/pages/LeadDistribution.tsx
git commit -m "refactor(roleta): remover Simulador (sera substituido por redistribuir colaborador)

Componente RouletteSimulator nao tinha valor pratico (era apenas
um what-if diagnostico). Sera substituido por feature mais util
em Task 6/7 do plano.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Frontend — criar `RedistributeFromCollaboratorPanel.tsx`

**Files:**
- Create: `src/components/roulette/RedistributeFromCollaboratorPanel.tsx`

- [ ] **Step 6.1: Criar arquivo**

Conteúdo de `src/components/roulette/RedistributeFromCollaboratorPanel.tsx`:

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Shuffle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onToggle: () => void;
  onConfirm: (collaboratorUserId: string) => void;
  isPending: boolean;
}

export function RedistributeFromCollaboratorPanel({ open, onToggle, onConfirm, isPending }: Props) {
  const { organizationId } = useOrganization();
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Buscar colaboradores ativos
  const { data: collaborators = [] } = useQuery({
    queryKey: ["redistribute-collaborator-options", organizationId],
    queryFn: async () => {
      if (!organizationId) return [] as Array<{ user_id: string; display: string }>;

      const { data: members } = await supabase
        .from("organization_members")
        .select("user_id, email, display_name, is_active")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .not("user_id", "is", null);

      const userIds = (members || []).map(m => m.user_id).filter(Boolean) as string[];
      if (userIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p.full_name]));
      const list = (members || []).map(m => ({
        user_id: m.user_id!,
        display: profileMap.get(m.user_id!) || m.display_name || m.email || "Sem nome",
      }));
      list.sort((a, b) => a.display.localeCompare(b.display));
      return list;
    },
    enabled: !!organizationId && open,
    staleTime: 5 * 60 * 1000,
  });

  // Contar leads ativos do selecionado
  const { data: activeLeadsCount, isLoading: countLoading } = useQuery({
    queryKey: ["collaborator-active-leads-count", organizationId, selectedUserId],
    queryFn: async () => {
      if (!organizationId || !selectedUserId) return 0;

      const { data: closedStages } = await supabase
        .from("funnel_stages")
        .select("id, sales_funnels!inner(organization_id)")
        .eq("sales_funnels.organization_id", organizationId)
        .in("stage_type", ["won", "lost"]);
      const closedIds = (closedStages || []).map(s => s.id);

      let q = supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("responsavel_user_id", selectedUserId);
      if (closedIds.length > 0) {
        q = q.or(`funnel_stage_id.is.null,funnel_stage_id.not.in.(${closedIds.join(",")})`);
      }
      const { count } = await q;
      return count || 0;
    },
    enabled: !!organizationId && !!selectedUserId,
    staleTime: 30 * 1000,
  });

  const selectedDisplay = collaborators.find(c => c.user_id === selectedUserId)?.display || "";
  const canConfirm = !!selectedUserId && (activeLeadsCount ?? 0) > 0 && !isPending;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Shuffle className="h-4 w-4 text-primary" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold">Redistribuir leads de um colaborador</p>
            <p className="text-xs text-muted-foreground">Solta os leads de um agente e os redistribui pelas roletas</p>
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t p-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Todos os leads ativos do colaborador serão desatribuídos e redistribuídos automaticamente
            pelas roletas configuradas (com base em source + funil de cada lead). O colaborador permanece
            ativo na organização.
          </p>

          <div className="space-y-2">
            <label className="text-xs font-medium">Colaborador</label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={isPending}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um colaborador" />
              </SelectTrigger>
              <SelectContent>
                {collaborators.map(c => (
                  <SelectItem key={c.user_id} value={c.user_id}>{c.display}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedUserId && (
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
              {countLoading ? (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Calculando...
                </span>
              ) : (
                <span>
                  Este colaborador tem <strong>{activeLeadsCount ?? 0}</strong> lead(s) ativo(s) que serão redistribuídos.
                </span>
              )}
            </div>
          )}

          <Button
            variant="destructive"
            onClick={() => setConfirmOpen(true)}
            disabled={!canConfirm}
            className="w-full"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Redistribuir todos os leads
          </Button>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar redistribuição</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a desatribuir <strong>{activeLeadsCount ?? 0}</strong> lead(s) de{" "}
              <strong>{selectedDisplay}</strong> e redistribuí-los automaticamente pelas roletas.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                onConfirm(selectedUserId);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Redistribuir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 6.2: Lint**

```bash
npm run lint -- src/components/roulette/RedistributeFromCollaboratorPanel.tsx 2>&1 | tail -10
```

Esperado: 0 erros de TypeScript ou eslint.

- [ ] **Step 6.3: Commit**

```bash
git add src/components/roulette/RedistributeFromCollaboratorPanel.tsx
git commit -m "feat(roleta): RedistributeFromCollaboratorPanel

Painel colapsavel novo com dropdown de colaboradores ativos,
contador dinamico de leads, modal de confirmacao destrutiva e
botao de redistribuicao. Sera integrado no LeadDistribution na
proxima task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Frontend — wire up panel + nova mutation em LeadDistribution

**Files:**
- Modify: `src/pages/LeadDistribution.tsx`

- [ ] **Step 7.1: Adicionar import + state + mutation**

Em `src/pages/LeadDistribution.tsx`:

1. Adicionar import (depois dos outros imports de `@/components/roulette/`):
   ```tsx
   import { RedistributeFromCollaboratorPanel } from "@/components/roulette/RedistributeFromCollaboratorPanel";
   ```

2. Adicionar state perto dos outros (logo onde estava `simulatorOpen` antes da Task 5):
   ```tsx
   const [collabRedistOpen, setCollabRedistOpen] = useState(false);
   ```

3. Adicionar mutation logo após `redistributeLostMutation` (antes de `deleteMutation`):

```tsx
  // Redistribuir leads de um colaborador
  const redistributeFromCollaboratorMutation = useMutation({
    mutationFn: async (collaboratorUserId: string) => {
      if (!organizationId) return { redistributed: 0, skipped: 0, total: 0 };

      setRedistProgress({ current: 0, total: 0, isRunning: true });

      // 1ª chamada: a edge function ja faz o loop interno e retorna agregado.
      const { data, error } = await supabase.functions.invoke("redistribute-from-collaborator", {
        body: {
          organization_id: organizationId,
          collaborator_user_id: collaboratorUserId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const redistributed = data?.redistributed_count || 0;
      const skipped = data?.skipped || 0;
      const total = data?.total_intended || 0;

      setRedistProgress({ current: redistributed, total, isRunning: false });

      return { redistributed, skipped, total };
    },
    onSuccess: ({ redistributed, skipped, total }) => {
      queryClient.invalidateQueries({ queryKey: ["unassigned-leads-count"] });
      queryClient.invalidateQueries({ queryKey: ["lead-distribution-configs"] });
      queryClient.invalidateQueries({ queryKey: ["collaborator-active-leads-count"] });
      if (redistributed > 0) {
        const msg = skipped > 0
          ? `${redistributed}/${total} leads redistribuidos. ${skipped} aguardando configuracao.`
          : `${redistributed} leads redistribuidos com sucesso!`;
        toast.success(msg);
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

- [ ] **Step 7.2: Adicionar botão no header**

No mesmo lugar onde estava o botão "Simular" (que foi removido na Task 5), adicionar:

```tsx
          <Button
            variant="outline"
            onClick={() => setCollabRedistOpen(!collabRedistOpen)}
            className="gap-2"
          >
            <Shuffle className="h-4 w-4" />
            Redistribuir colaborador
          </Button>
```

Verificar que `Shuffle` está no import de `lucide-react` (já está, linha 22).

- [ ] **Step 7.3: Adicionar painel no lugar onde estava o RouletteSimulator**

Após o header (no mesmo lugar onde estava `<RouletteSimulator />`), adicionar:

```tsx
      {/* Redistribuir leads de um colaborador (colapsavel) */}
      <RedistributeFromCollaboratorPanel
        open={collabRedistOpen}
        onToggle={() => setCollabRedistOpen(!collabRedistOpen)}
        onConfirm={(userId) => redistributeFromCollaboratorMutation.mutate(userId)}
        isPending={redistributeFromCollaboratorMutation.isPending}
      />
```

- [ ] **Step 7.4: Lint**

```bash
npm run lint -- src/pages/LeadDistribution.tsx 2>&1 | tail -20
```

- [ ] **Step 7.5: Iniciar dev server e teste manual**

```bash
npm run dev
```

Abrir o app, navegar para Roleta. Verificar:
- [ ] Botão "Simular" sumiu, botão "Redistribuir colaborador" aparece
- [ ] Painel abre/fecha ao clicar
- [ ] Dropdown lista colaboradores ativos
- [ ] Selecionar um colaborador mostra o count de leads ativos
- [ ] Clicar "Redistribuir todos os leads" abre modal de confirmação
- [ ] Cancelar fecha o modal sem efeito
- [ ] Confirmar dispara a mutation (verificar Network tab + toast de sucesso/erro)

(Se houver problema funcional, é Task 9 — golden path completo.)

- [ ] **Step 7.6: Commit**

```bash
git add src/pages/LeadDistribution.tsx
git commit -m "feat(roleta): integrar painel de redistribuir colaborador + mutation

Adiciona botao 'Redistribuir colaborador' no header (substitui o
botao Simular antigo), painel colapsavel novo, e mutation que chama
a edge function redistribute-from-collaborator.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Backend — refactor `redistribute-unassigned-leads` para usar `_shared/redistribute-batch.ts`

**Files:**
- Modify: `supabase/functions/redistribute-unassigned-leads/index.ts`

⚠️ **Esta task é opcional/diferida.** A função atual está em produção e funcionando. Refatorá-la para usar o módulo compartilhado é uma melhoria de DRY mas não traz valor user-visible. **Decisão de pular ou executar:**
- Se Tasks 1-7 deployaram limpas e o usuário validou Task 9 (golden path), executar Task 8.
- Se houver qualquer dúvida, pular Task 8 e marcar como follow-up no spec.

- [ ] **Step 8.1: Decisão go/no-go**

Confirmar que Tasks 1-7 estão deployadas e funcionais. Se sim, prosseguir. Se não, pular esta task.

- [ ] **Step 8.2: Reescrever a função**

Substituir o conteúdo de `supabase/functions/redistribute-unassigned-leads/index.ts` por uma versão fina que delega para o helper:

```ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";
import { redistributeBatch } from "../_shared/redistribute-batch.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { organization_id, config_id } = await req.json();

    if (!organization_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'organization_id é obrigatório' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`🔄 [redistribute-unassigned] Iniciando para org: ${organization_id}`);

    const result = await redistributeBatch(supabase, organization_id, {
      batchSize: 100,
      configId: config_id || null,
    });

    console.log(`✅ [redistribute-unassigned] ${result.redistributed} redistribuidos, ${result.skipped} skipped, has_more: ${result.hasMore}`);

    return new Response(
      JSON.stringify({
        success: true,
        redistributed_count: result.redistributed,
        total: result.totalRemaining + result.redistributed,  // total que existia antes
        processed: result.redistributed,
        skipped: result.skipped,
        has_more: result.hasMore,
        batch_complete: true,
        errors: result.errors.length > 0 ? result.errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Erro em redistribute-unassigned-leads:', message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
```

⚠️ Esta versão remove a lógica antiga de criação de `redistribution_batches` row (linhas 78-95 do original). **Verificar se algum lugar do código depende disso** (Grep `redistribution_batches`). Se sim, manter a lógica de criar batch ANTES do `redistributeBatch` e passar `batchId` como parâmetro adicional ao helper.

- [ ] **Step 8.3: Deploy**

```bash
npx supabase functions deploy redistribute-unassigned-leads
```

- [ ] **Step 8.4: Verificação funcional**

Manualmente, na app, clicar "Redistribuir agora" no card de leads sem dono. Verificar que o comportamento é o mesmo de antes do refactor (mesmos counts, mesma distribuição via roleta apropriada).

Se o comportamento mudou, **revert imediatamente:**

```bash
git revert HEAD
npx supabase functions deploy redistribute-unassigned-leads
```

- [ ] **Step 8.5: Commit (apenas se Step 8.4 passou)**

```bash
git add supabase/functions/redistribute-unassigned-leads/index.ts
git commit -m "refactor(redistribute-unassigned): consumir _shared/redistribute-batch helper

DRY: remove duplicacao de logica de roleta entre essa funcao e
redistribute-from-collaborator. Comportamento user-visible
inalterado (verificado).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Verificação end-to-end (manual, usuário executa)

Sem código a escrever. Owner executa no app real.

- [ ] **Step 9.1: Setup de teste**

Pelo app, criar/usar uma org com:
- 2 colaboradores ativos: "Carlos" e "Ana"
- 2 roletas: uma para `source='whatsapp'` (Roleta A) e outra para `source='all'` sem funil (Roleta B)
- Ambas têm Carlos e Ana em `eligible_agents`
- 30 leads atribuídos ao Carlos: 10 ativos com `source=whatsapp`, 5 ativos com `source=manual`, 10 leads em estágio "Perdido", 5 leads em estágio "Ganho"

- [ ] **Step 9.2: Caso 1 — Redistribuir leads do Carlos**

1. Roleta → botão "Redistribuir colaborador" → painel abre
2. Dropdown: Carlos → texto: "15 leads ativos"
3. Clica "Redistribuir todos os leads" → modal: "desatribuir 15 leads"
4. Confirma → toast "15 leads redistribuídos com sucesso"
5. SQL: leads ativos do Carlos foram para Ana (responsavel_user_id != Carlos). Leads "Perdido" e "Ganho" intactos.
6. Carlos continua na lista de colaboradores, ainda em `eligible_agents`, ainda pode logar.

- [ ] **Step 9.3: Caso 2 — Redistribuir Perdidos com volume alto**

1. Setup adicional: criar 200 leads em estágio "Perdido" espalhados entre os funis (atribuídos ao Carlos ou Ana)
2. Roleta → botão "Redistribuir Perdidos" → modal escolhe roleta (ou null) → confirma
3. Barra de progresso avança em incrementos visíveis (~100, 200, 210, 215...)
4. Toast final: "210 leads perdidos redistribuídos"
5. SQL: nenhum lead em estágio `lost`. Todos foram movidos para o primeiro estágio do funil correspondente.

- [ ] **Step 9.4: Caso 3 — Caso degenerado (source sem roleta)**

1. Setup: criar 5 leads sem dono com `source='facebook'`. Garantir que NENHUMA roleta tem `source_type='facebook'` ou `'all'` (config 'all' precisa ser desativada temporariamente)
2. Clicar "Redistribuir agora" no card de não-atribuídos
3. Toast: "0 redistribuídos. 5 aguardando configuração de roleta/agente."
4. Os 5 leads continuam `responsavel_user_id IS NULL` (não foram forçados para nenhum agente).

- [ ] **Step 9.5: Reportar resultado**

Se todos os 3 casos passaram, a feature está validada. Se algum falhou, anotar exatamente o que falhou e voltar ao subagent para fix.

---

## Resumo dos commits esperados

1. `fix(roleta): cap=500, delay 800ms e guarda anti-loop nas mutations`
2. `fix(redistribute-lost): filtrar perdidos no banco, has_more correto`
3. `feat(shared): redistributeBatch helper para reaproveitar logica de roleta`
4. `feat(edge): redistribute-from-collaborator`
5. `refactor(roleta): remover Simulador (sera substituido por redistribuir colaborador)`
6. `feat(roleta): RedistributeFromCollaboratorPanel`
7. `feat(roleta): integrar painel de redistribuir colaborador + mutation`
8. (opcional) `refactor(redistribute-unassigned): consumir _shared/redistribute-batch helper`

Total: 7-8 commits. Verificação manual (Task 9) feita pelo usuário. Sem testes unitários.
