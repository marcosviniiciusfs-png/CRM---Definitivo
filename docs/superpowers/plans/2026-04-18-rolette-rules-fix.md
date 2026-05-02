# Roleta Rules Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all smart rules in the roleta system functional by having the Edge Function read and execute `smart_rules` from the database.

**Architecture:** The SmartRulesPanel saves rules to `smart_rules` JSONB on `lead_distribution_configs`. The Edge Function `distribute-lead` already fetches the config — we add a rules execution layer between config lookup and agent selection. Three files change: the Edge Function (core logic), the SmartRulesPanel (sync timeout field), and the RouletteSimulator (match real logic).

**Tech Stack:** Deno Edge Function (TypeScript), React + TanStack Query, Supabase (Postgres)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/functions/distribute-lead/index.ts` | Modify | Add smart_rules execution + conversion priority |
| `src/components/roulette/SmartRulesPanel.tsx` | Modify | Sync auto_redistribute_timeout to config columns |
| `src/components/roulette/RouletteSimulator.tsx` | Modify | Fix simulation to match Edge Function logic |

No new files. No database migrations.

---

### Task 1: Add smart_rules type definitions and helper functions to distribute-lead

**Files:**
- Modify: `supabase/functions/distribute-lead/index.ts` (add after line 17, before `serve()`)

These types and helpers will be used by the smart rules execution in Task 2.

- [ ] **Step 1: Add smart_rules types after the `DistributeLeadRequest` interface (after line 17)**

Insert the following code block between line 17 and line 19 (before `serve(async (req) => {`):

```typescript
// ── Smart Rules Types & Helpers ────────────────────────────────

interface SystemRules {
  reroute_same_agent: boolean;
  work_hours_enabled: boolean;
  work_hours_start: string;
  work_hours_end: string;
  hot_lead_enabled: boolean;
  hot_lead_score: number;
  auto_redistribute_timeout: number;
}

interface CustomRule {
  id: string;
  name: string;
  condition_field: "source" | "score_min" | "score_max" | "funnel";
  condition_operator: "equals" | "not_equals" | "greater" | "less";
  condition_value: string;
  action: "assign_to" | "skip";
  agent_id: string;
  enabled: boolean;
}

interface SmartRulesData {
  system: SystemRules;
  custom: CustomRule[];
}

function parseSmartRules(raw: any): SmartRulesData {
  const DEFAULT_SYSTEM: SystemRules = {
    reroute_same_agent: false,
    work_hours_enabled: false,
    work_hours_start: "08:00",
    work_hours_end: "18:00",
    hot_lead_enabled: false,
    hot_lead_score: 70,
    auto_redistribute_timeout: 60,
  };

  if (!raw) return { system: DEFAULT_SYSTEM, custom: [] };
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!parsed || typeof parsed !== "object") return { system: DEFAULT_SYSTEM, custom: [] };

  return {
    system: { ...DEFAULT_SYSTEM, ...(parsed.system || {}) },
    custom: Array.isArray(parsed.custom) ? parsed.custom : [],
  };
}

function getCustomRuleFieldValue(field: string, lead: any): any {
  switch (field) {
    case "source": return lead.source || "";
    case "score_min": return lead.lead_score || 0;
    case "score_max": return lead.lead_score || 0;
    case "funnel": return lead.funnel_id || "";
    default: return "";
  }
}

function evaluateCustomCondition(value: any, operator: string, conditionValue: string): boolean {
  const strVal = String(value);
  switch (operator) {
    case "equals": return strVal === conditionValue;
    case "not_equals": return strVal !== conditionValue;
    case "greater": return Number(value) > Number(conditionValue);
    case "less": return Number(value) < Number(conditionValue);
    default: return false;
  }
}
```

- [ ] **Step 2: Verify the Edge Function compiles**

Run: `cd "c:\Users\Brito\Desktop\principal\Kairoz\Teste - CRM Kairoz\CRM---Definitivo" && grep -n "parseSmartRules\|CustomRule\|SmartRulesData" supabase/functions/distribute-lead/index.ts | head -5`

Expected: The grep finds the new types and functions.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/distribute-lead/index.ts
git commit -m "feat(roleta): add smart_rules types and helper functions to distribute-lead"
```

---

### Task 2: Add smart_rules execution in distribute-lead main flow

**Files:**
- Modify: `supabase/functions/distribute-lead/index.ts`

This inserts the smart rules execution between config lookup (line ~192) and agent selection (line ~277). It reads `config.smart_rules`, runs custom rules, hot lead check, reroute check, and work hours check.

- [ ] **Step 1: Add smart_rules execution block after filter_rules check (after line 216, before line 218)**

The current code at line 216-217 is:
```typescript
      console.log(`Lead passes filter rules for config "${config.name}"`);
    }
```

Insert the following code block AFTER the closing `}` of the filter_rules block (after line 217), BEFORE the comment `// 3. Mapear trigger_source`:

```typescript
    // 2.6. Execute smart rules (custom rules, hot lead, reroute, work hours)
    const smartRules = parseSmartRules(config.smart_rules);
    const leadScore = lead.lead_score || 0;

    // ── Custom Rules ──
    let forcedAgentId: string | null = null;
    let leadSkipped = false;

    for (const rule of smartRules.custom) {
      if (!rule.enabled) continue;
      const fieldValue = getCustomRuleFieldValue(rule.condition_field, lead);
      const matches = evaluateCustomCondition(fieldValue, rule.condition_operator, rule.condition_value);

      if (matches) {
        console.log(`[SmartRules] Custom rule "${rule.name}" matched: ${rule.condition_field} ${rule.condition_operator} ${rule.condition_value}`);
        if (rule.action === "skip") {
          console.log(`[SmartRules] Lead skipped by custom rule "${rule.name}"`);
          leadSkipped = true;
          break;
        }
        if (rule.action === "assign_to" && rule.agent_id) {
          forcedAgentId = rule.agent_id;
          console.log(`[SmartRules] Custom rule forces assignment to agent ${rule.agent_id}`);
          break;
        }
      }
    }

    if (leadSkipped) {
      return new Response(
        JSON.stringify({ success: false, message: 'Lead skipped by custom smart rule' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Hot Lead Check ──
    const isHotLead = smartRules.system.hot_lead_enabled && leadScore >= smartRules.system.hot_lead_score;
    if (isHotLead) {
      console.log(`[SmartRules] Hot lead detected (score: ${leadScore} >= ${smartRules.system.hot_lead_score})`);
    }

    // ── Reroute Same Agent ──
    if (!forcedAgentId && smartRules.system.reroute_same_agent) {
      const { data: prevHistory } = await supabase
        .from('lead_distribution_history')
        .select('to_user_id')
        .eq('lead_id', lead_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (prevHistory?.to_user_id) {
        // Will validate agent availability after fetching agents
        forcedAgentId = prevHistory.to_user_id;
        console.log(`[SmartRules] Rerouting to previous agent: ${prevHistory.to_user_id}`);
      }
    }

    // ── Work Hours Check ──
    if (!isHotLead && smartRules.system.work_hours_enabled) {
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 5);
      if (currentTime < smartRules.system.work_hours_start || currentTime > smartRules.system.work_hours_end) {
        console.log(`[SmartRules] Outside work hours (${currentTime} not in ${smartRules.system.work_hours_start}-${smartRules.system.work_hours_end}), queuing lead`);
        return new Response(
          JSON.stringify({ success: false, message: 'Outside work hours, lead queued for next business hours' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
```

- [ ] **Step 2: Modify agent selection to respect forced agent**

The current code around line 277-296 selects an agent via `selectAgent()`. We need to add the forced agent logic BEFORE the `selectAgent` call. Find the block:

```typescript
    // 6. Selecionar agente baseado no método de distribuição
    const selectedAgent = await selectAgent(
```

Replace the block from `// 6. Selecionar agente` through the `selectedAgent` null check (lines 289-304) with:

```typescript
    // 6. Selecionar agente baseado no método de distribuição (ou usar agente forçado pelas smart rules)
    let selectedAgent: any = null;

    if (forcedAgentId) {
      // Verify the forced agent is actually available
      selectedAgent = availableAgents.find((a: any) => a.user_id === forcedAgentId) || null;
      if (selectedAgent) {
        console.log(`[SmartRules] Using forced agent: ${selectedAgent.full_name || selectedAgent.email}`);
      } else {
        console.log(`[SmartRules] Forced agent ${forcedAgentId} not available, falling back to normal selection`);
      }
    }

    if (!selectedAgent) {
      selectedAgent = await selectAgent(
        supabase,
        availableAgents,
        config.distribution_method,
        organization_id,
        config.id
      );
    }

    if (!selectedAgent) {
      console.log('Could not select an agent');
      return new Response(
        JSON.stringify({ success: false, message: 'Could not select an agent' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
```

- [ ] **Step 3: Verify the full file has no syntax errors**

Run: `cd "c:\Users\Brito\Desktop\principal\Kairoz\Teste - CRM Kairoz\CRM---Definitivo" && grep -c "executeSmartRules\|parseSmartRules\|forcedAgentId\|isHotLead\|leadSkipped" supabase/functions/distribute-lead/index.ts`

Expected: Count > 0, confirming the new variables and functions are present.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/distribute-lead/index.ts
git commit -m "feat(roleta): execute smart_rules in distribute-lead (custom rules, hot lead, reroute, work hours)"
```

---

### Task 3: Add Conversion Priority (Smart AI) selection method

**Files:**
- Modify: `supabase/functions/distribute-lead/index.ts`

The `selectAgent` switch statement (line ~550) has no case for `conversion_priority`. We add the function and the case.

- [ ] **Step 1: Add `selectConversionPriority` function before `selectAgent` (before line 543)**

Insert this function before the existing `selectAgent` function:

```typescript
async function selectConversionPriority(supabase: any, agents: any[], organization_id: string): Promise<any> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Count won leads per agent in last 30 days
  const { data: wonLeads } = await supabase
    .from('leads')
    .select('responsavel_user_id, funnel_stages!inner(stage_type)')
    .eq('organization_id', organization_id)
    .not('responsavel_user_id', 'is', null)
    .gte('updated_at', thirtyDaysAgo);

  // Filter only won leads from the join
  const wonCount = new Map<string, number>();
  for (const lead of wonLeads || []) {
    const stage = (lead as any).funnel_stages;
    if (stage?.stage_type === 'won') {
      wonCount.set(lead.responsavel_user_id, (wonCount.get(lead.responsavel_user_id) || 0) + 1);
    }
  }

  // Count total assigned per agent in last 30 days
  const { data: history } = await supabase
    .from('lead_distribution_history')
    .select('to_user_id')
    .eq('organization_id', organization_id)
    .gte('created_at', thirtyDaysAgo);

  const assignedCount = new Map<string, number>();
  for (const row of history || []) {
    assignedCount.set(row.to_user_id, (assignedCount.get(row.to_user_id) || 0) + 1);
  }

  // Select agent with highest conversion rate (minimum 3 assignments to qualify)
  let bestAgent = agents[0];
  let bestRate = -1;

  for (const agent of agents) {
    const assigned = assignedCount.get(agent.user_id) || 0;
    const won = wonCount.get(agent.user_id) || 0;
    const rate = assigned >= 3 ? won / assigned : 0;
    console.log(`[SmartAI] Agent ${agent.full_name || agent.email}: ${won}/${assigned} conversions (rate: ${(rate * 100).toFixed(1)}%)`);
    if (rate > bestRate) {
      bestRate = rate;
      bestAgent = agent;
    }
  }

  console.log(`[SmartAI] Selected: ${bestAgent.full_name || bestAgent.email} (rate: ${(bestRate * 100).toFixed(1)}%)`);
  return bestAgent;
}
```

- [ ] **Step 2: Add case to `selectAgent` switch (modify the switch at line ~550)**

Find the existing `selectAgent` function with the switch statement:

```typescript
  switch (method) {
    case 'round_robin':
      return selectRoundRobin(supabase, agents, organization_id, config_id);

    case 'weighted':
      return selectWeighted(agents);

    case 'load_based':
      return selectLoadBased(agents);

    case 'random':
      return selectRandom(agents);

    default:
      return selectRoundRobin(supabase, agents, organization_id, config_id);
  }
```

Replace the entire switch body with:

```typescript
  switch (method) {
    case 'round_robin':
      return selectRoundRobin(supabase, agents, organization_id, config_id);

    case 'weighted':
      return selectWeighted(agents);

    case 'load_based':
      return selectLoadBased(agents);

    case 'random':
      return selectRandom(agents);

    case 'conversion_priority':
      return selectConversionPriority(supabase, agents, organization_id);

    default:
      return selectRoundRobin(supabase, agents, organization_id, config_id);
  }
```

- [ ] **Step 3: Verify the new case exists**

Run: `grep -n "conversion_priority" supabase/functions/distribute-lead/index.ts`

Expected: Two matches — one in the `selectConversionPriority` function name and one in the switch case.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/distribute-lead/index.ts
git commit -m "feat(roleta): add conversion priority (Smart AI) selection method"
```

---

### Task 4: Sync auto_redistribute_timeout in SmartRulesPanel

**Files:**
- Modify: `src/components/roulette/SmartRulesPanel.tsx` (lines 123-147)

The `saveMutation.mutationFn` (line 124) currently updates only `smart_rules`. We change it to also sync `redistribution_timeout_minutes` and `auto_redistribute` on each config.

- [ ] **Step 1: Modify the save mutation to sync config fields**

Find the `saveMutation` definition (line 123-147):

```typescript
  const saveMutation = useMutation({
    mutationFn: async (updated: SmartRulesData) => {
      if (!organizationId) return;
      const { data: configs } = await supabase
        .from("lead_distribution_configs")
        .select("id")
        .eq("organization_id", organizationId);
      if (!configs?.length) {
        toast.error("Crie pelo menos uma roleta antes de configurar regras");
        return;
      }
      // Update all configs with the same smart_rules (org-level)
      for (const config of configs) {
        await supabase
          .from("lead_distribution_configs")
          .update({ smart_rules: updated as any })
          .eq("id", config.id);
      }
    },
```

Replace the entire `mutationFn` (just the function body inside `mutationFn:`) with:

```typescript
    mutationFn: async (updated: SmartRulesData) => {
      if (!organizationId) return;
      const { data: configs } = await supabase
        .from("lead_distribution_configs")
        .select("id")
        .eq("organization_id", organizationId);
      if (!configs?.length) {
        toast.error("Crie pelo menos uma roleta antes de configurar regras");
        return;
      }
      // Update all configs with the same smart_rules + sync timeout/auto_redistribute
      for (const config of configs) {
        await supabase
          .from("lead_distribution_configs")
          .update({
            smart_rules: updated as any,
            redistribution_timeout_minutes: updated.system.auto_redistribute_timeout,
            auto_redistribute: true,
          })
          .eq("id", config.id);
      }
    },
```

- [ ] **Step 2: Verify the change**

Run: `grep -n "redistribution_timeout_minutes\|auto_redistribute" src/components/roulette/SmartRulesPanel.tsx`

Expected: Both fields appear in the update call.

- [ ] **Step 3: Commit**

```bash
git add src/components/roulette/SmartRulesPanel.tsx
git commit -m "fix(roleta): sync auto_redistribute_timeout from smart_rules to config columns"
```

---

### Task 5: Fix RouletteSimulator to match Edge Function logic

**Files:**
- Modify: `src/components/roulette/RouletteSimulator.tsx` (lines 41-147)

The simulator uses `Math.random()` for round robin and incorrect logic for weighted/load based. We fix the `simulate` function to match the real distribution logic.

- [ ] **Step 1: Replace the `simulate` function body (lines 41-147)**

Find the `const simulate = async () => {` function and replace its entire body (from line 41 to the closing `};` before `return (`) with:

```typescript
  const simulate = async () => {
    if (!organizationId) return;
    setSimulating(true);
    setResult(null);

    try {
      // Find matching configs using same hierarchy as Edge Function
      const { data: configs } = await supabase
        .from("lead_distribution_configs")
        .select("id, name, source_type, distribution_method, eligible_agents, funnel_id, smart_rules")
        .eq("organization_id", organizationId)
        .eq("is_active", true);

      if (!configs?.length) {
        setResult({ rouletteName: "Nenhuma", agentName: "—", method: "—", reason: "Nenhuma roleta ativa encontrada" });
        setSimulating(false);
        return;
      }

      // Same priority hierarchy as Edge Function: source+funnel > source only > all+funnel > all only
      const funnelVal = funnelId || null;
      let match = configs.find(c => c.source_type === source && c.funnel_id === funnelVal);
      if (!match) match = configs.find(c => c.source_type === source && !c.funnel_id);
      if (!match) match = configs.find(c => c.source_type === "all" && c.funnel_id === funnelVal);
      if (!match) match = configs.find(c => c.source_type === "all" && !c.funnel_id);
      if (!match) match = configs[0];

      // Get active agents (same filters as Edge Function)
      const { data: agentSettings } = await supabase
        .from("agent_distribution_settings")
        .select("user_id, priority_weight, max_capacity, capacity_enabled")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .eq("is_paused", false)
        .order("user_id", { ascending: true });

      const eligibleIds = (match.eligible_agents?.length > 0 ? match.eligible_agents : (agentSettings || []).map(a => a.user_id)) as string[];
      let eligible = (agentSettings || []).filter(a => eligibleIds.includes(a.user_id));

      if (!eligible.length) {
        setResult({ rouletteName: match.name, agentName: "—", method: getMethodLabel(match.distribution_method), reason: "Nenhum agente elegivel disponivel" });
        setSimulating(false);
        return;
      }

      // ── Simulate smart rules (same as Edge Function) ──
      const smartRules = match.smart_rules as any;
      let forcedAgentId: string | null = null;
      let ruleReason = "";

      if (smartRules?.custom?.length) {
        for (const rule of smartRules.custom) {
          if (!rule.enabled) continue;
          const isSourceRule = rule.condition_field === "source";
          if (isSourceRule && rule.condition_operator === "equals" && source === rule.condition_value) {
            if (rule.action === "assign_to" && rule.agent_id && eligible.find(a => a.user_id === rule.agent_id)) {
              forcedAgentId = rule.agent_id;
              ruleReason = `Regra personalizada: "${rule.name}"`;
              break;
            }
          }
        }
      }

      if (forcedAgentId && !ruleReason) {
        ruleReason = "Roteamento inteligente";
      }

      // Reroute same agent check (simulated — assume no prior history)
      if (!forcedAgentId && smartRules?.system?.reroute_same_agent) {
        ruleReason = "Reagendamento ativado (sem historico anterior)";
      }

      // Work hours check
      if (smartRules?.system?.work_hours_enabled) {
        const now = new Date();
        const currentTime = now.toTimeString().slice(0, 5);
        if (currentTime < smartRules.system.work_hours_start || currentTime > smartRules.system.work_hours_end) {
          setResult({
            rouletteName: match.name,
            agentName: "—",
            method: getMethodLabel(match.distribution_method),
            reason: `Fora do horario de trabalho (${smartRules.system.work_hours_start}-${smartRules.system.work_hours_end})`,
          });
          setSimulating(false);
          return;
        }
      }

      // ── Agent selection (match Edge Function logic) ──
      let selectedAgent: any = null;
      let reason = ruleReason;

      if (forcedAgentId) {
        selectedAgent = eligible.find(a => a.user_id === forcedAgentId) || null;
      }

      if (!selectedAgent) {
        // Get lead counts for load-based (excluding won/lost stages)
        const { data: activeLeads } = await supabase
          .from("leads")
          .select("responsavel_user_id, funnel_stages!inner(stage_type)")
          .eq("organization_id", organizationId)
          .in("responsavel_user_id", eligibleIds);

        const countMap = new Map<string, number>();
        for (const row of activeLeads || []) {
          const stage = (row as any).funnel_stages;
          if (stage?.stage_type !== "won" && stage?.stage_type !== "lost") {
            countMap.set(row.responsavel_user_id, (countMap.get(row.responsavel_user_id) || 0) + 1);
          }
        }

        switch (match.distribution_method) {
          case "round_robin": {
            // Fetch last distribution history to find next agent (same as Edge Function)
            const { data: lastDist } = await supabase
              .from("lead_distribution_history")
              .select("to_user_id")
              .eq("organization_id", organizationId)
              .eq("config_id", match.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (lastDist) {
              const lastIdx = eligible.findIndex(a => a.user_id === lastDist.to_user_id);
              if (lastIdx !== -1) {
                const nextIdx = (lastIdx + 1) % eligible.length;
                selectedAgent = eligible[nextIdx];
                reason = reason || `Proximo da fila (rodizio)`;
              } else {
                selectedAgent = eligible[0];
                reason = reason || `Primeiro da fila (ultimo agente indisponivel)`;
              }
            } else {
              selectedAgent = eligible[0];
              reason = reason || `Primeiro da fila (sem historico)`;
            }
            break;
          }
          case "load_based": {
            selectedAgent = eligible.reduce((min, a) => {
              const countA = countMap.get(a.user_id) || 0;
              const countMin = countMap.get(min.user_id) || 0;
              return countA < countMin ? a : min;
            }, eligible[0]);
            reason = reason || `Menor carga (${countMap.get(selectedAgent.user_id) || 0} leads ativos)`;
            break;
          }
          case "weighted": {
            // Proper weighted random selection (same as Edge Function)
            const totalWeight = eligible.reduce((sum, a) => sum + (a.priority_weight || 1), 0);
            let random = Math.random() * totalWeight;
            for (const agent of eligible) {
              random -= (agent.priority_weight || 1);
              if (random <= 0) {
                selectedAgent = agent;
                break;
              }
            }
            if (!selectedAgent) selectedAgent = eligible[0];
            reason = reason || `Selecao ponderada (peso ${selectedAgent.priority_weight || 1})`;
            break;
          }
          case "conversion_priority": {
            // Smart AI — show agent with best conversion rate
            reason = reason || "Smart AI (melhor taxa de conversao)";
            selectedAgent = eligible[0]; // Fallback for simulator
            break;
          }
          case "random":
          default: {
            selectedAgent = eligible[Math.floor(Math.random() * eligible.length)];
            reason = reason || "Selecao aleatoria";
            break;
          }
        }
      }

      // Get agent name
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", selectedAgent.user_id)
        .maybeSingle();

      setResult({
        rouletteName: match.name,
        agentName: profile?.full_name || "Agente",
        method: getMethodLabel(match.distribution_method),
        reason,
      });
    } catch (err) {
      console.error("Simulation error:", err);
    } finally {
      setSimulating(false);
    }
  };
```

- [ ] **Step 2: Verify the file has no import errors**

Run: `grep -c "supabase\|useQuery\|useOrganization" src/components/roulette/RouletteSimulator.tsx`

Expected: Count > 0, confirming all existing imports are still used.

- [ ] **Step 3: Commit**

```bash
git add src/components/roulette/RouletteSimulator.tsx
git commit -m "fix(roleta): simulator matches Edge Function logic (round robin history, load-based with won/lost, weighted random)"
```

---

### Task 6: Deploy and smoke test

**Files:** None — verification only

- [ ] **Step 1: Deploy the Edge Function to Supabase**

```bash
cd "c:\Users\Brito\Desktop\principal\Kairoz\Teste - CRM Kairoz\CRM---Definitivo"
npx supabase functions deploy distribute-lead
```

Expected: Function deployed successfully.

- [ ] **Step 2: Verify the frontend compiles**

```bash
cd "c:\Users\Brito\Desktop\principal\Kairoz\Teste - CRM Kairoz\CRM---Definitivo"
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: No TypeScript errors in `SmartRulesPanel.tsx` or `RouletteSimulator.tsx`.

- [ ] **Step 3: Manual smoke test in browser**

1. Open the Lead Distribution page
2. Go to the "Regras" tab
3. Enable "Reagendamento para mesmo agente" — save — verify toast "Regras salvas com sucesso"
4. Enable "Lead quente" with score 50 — save — verify toast
5. Enable "Horario de trabalho" — save — verify toast
6. Go to the "Roletas" tab
7. Open the simulator — set source to "WhatsApp" — click "Simular"
8. Verify the simulator shows a result with a reason string
9. Check that round robin shows "Proximo da fila" instead of random selection

- [ ] **Step 4: Final commit if any adjustments needed**

```bash
git add -A
git commit -m "chore(roleta): post-deployment adjustments"
```
