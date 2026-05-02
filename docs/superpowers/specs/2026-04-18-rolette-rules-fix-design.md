# Roleta Rules Fix — Design Spec

**Date:** 2026-04-18
**Status:** Approved

## Problem

The Smart Rules Panel (`SmartRulesPanel.tsx`) saves rules to the `smart_rules` JSONB column, but the Edge Function `distribute-lead/index.ts` never reads that column. This means 6 out of 10 rules are non-functional:

| Rule | Status |
|---|---|
| Round Robin | Working |
| Weighted | Working |
| Load Based | Working |
| Random | Working |
| Conversion Priority (Smart AI) | **Broken — falls back to round robin** |
| Reroute to same agent | **Broken — never read** |
| Global work hours | **Broken — never read** |
| Hot lead priority | **Broken — never read** |
| Custom rules | **Broken — never read** |
| Auto-redistribute timeout | **Partial — reads wrong field** |
| Simulator | **Inaccurate — uses random instead of real logic** |

## Solution

### 1. Edge Function: Execute smart_rules

In `distribute-lead/index.ts`, after finding the config and before selecting the agent, add a `executeSmartRules()` function that:

1. Reads `config.smart_rules` (parsed from JSONB)
2. Returns either a forced agent ID (if a rule overrides selection) or null (proceed with normal selection)

#### Rule execution order:

```
1. Custom rules → if match, return forced agent or "skip"
2. Hot lead → if score >= threshold, mark as priority (bypass work hours)
3. Reroute same agent → if lead had prior agent, and agent is available, return that agent
4. Work hours → if outside hours AND not hot lead, return "queue" (don't distribute now)
```

#### Custom rules implementation:

```typescript
function executeCustomRules(
  smartRules: SmartRulesData,
  lead: any,
  availableAgents: any[]
): { action: 'assign_to', agent_id: string } | { action: 'skip' } | null {
  for (const rule of smartRules.custom) {
    if (!rule.enabled) continue;

    const fieldValue = getCustomRuleFieldValue(rule.condition_field, lead);
    const matches = evaluateCondition(fieldValue, rule.condition_operator, rule.condition_value);

    if (matches) {
      if (rule.action === 'skip') return { action: 'skip' };
      if (rule.action === 'assign_to' && rule.agent_id) {
        const agent = availableAgents.find(a => a.user_id === rule.agent_id);
        if (agent) return { action: 'assign_to', agent_id: rule.agent_id };
      }
    }
  }
  return null;
}
```

#### Reroute same agent implementation:

```typescript
async function findPreviousAgent(supabase: any, leadId: string, availableAgents: any[]): Promise<string | null> {
  const { data: history } = await supabase
    .from('lead_distribution_history')
    .select('to_user_id')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (history && availableAgents.find(a => a.user_id === history.to_user_id)) {
    return history.to_user_id;
  }
  return null;
}
```

#### Work hours check:

```typescript
function isWithinWorkHours(smartRules: SystemRules): boolean {
  if (!smartRules.work_hours_enabled) return true;
  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM
  return currentTime >= smartRules.work_hours_start && currentTime <= smartRules.work_hours_end;
}
```

### 2. Conversion Priority (Smart AI)

Add `selectConversionPriority()` to the `selectAgent` switch:

```typescript
async function selectConversionPriority(
  supabase: any,
  agents: any[],
  organization_id: string
): Promise<any> {
  // Count conversions per agent in last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: wonLeads } = await supabase
    .from('leads')
    .select('responsavel_user_id')
    .not('responsavel_user_id', 'is', null)
    .gte('updated_at', thirtyDaysAgo);

  // Also count total assigned per agent
  const { data: history } = await supabase
    .from('lead_distribution_history')
    .select('to_user_id')
    .eq('organization_id', organization_id)
    .gte('created_at', thirtyDaysAgo);

  // Calculate conversion rate per agent
  const wonCount = new Map<string, number>();
  const assignedCount = new Map<string, number>();

  for (const lead of wonLeads || []) {
    wonCount.set(lead.responsavel_user_id, (wonCount.get(lead.responsavel_user_id) || 0) + 1);
  }
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
    if (rate > bestRate) {
      bestRate = rate;
      bestAgent = agent;
    }
  }

  return bestAgent;
}
```

### 3. Sync auto_redistribute_timeout

In `SmartRulesPanel.tsx`, when saving `auto_redistribute_timeout`, also update `redistribution_timeout_minutes` on all configs:

```typescript
// In saveMutation.mutationFn, after updating smart_rules:
for (const config of configs) {
  await supabase
    .from('lead_distribution_configs')
    .update({
      smart_rules: updated as any,
      redistribution_timeout_minutes: updated.system.auto_redistribute_timeout,
      auto_redistribute: true,
    })
    .eq('id', config.id);
}
```

### 4. Fix Simulator

In `RouletteSimulator.tsx`, replace the simulation logic to match the Edge Function:

- **Round robin**: Fetch last distribution history for the config, find the next agent in sequence
- **Load based**: Count active leads excluding won/lost stages (not just raw count)
- **Weighted**: Use actual weighted random selection (not just highest weight)
- **Add hot lead and custom rules indicators**: Show if rules would override the selection

### Files to modify

1. `supabase/functions/distribute-lead/index.ts` — Add smart_rules execution, conversion priority
2. `src/components/roulette/SmartRulesPanel.tsx` — Sync timeout field
3. `src/components/roulette/RouletteSimulator.tsx` — Fix simulation logic

### What NOT to change

- Database schema — no migrations needed, `smart_rules` JSONB already exists
- UI components — the panel already saves correctly, just the backend needs to read
- Other Edge Functions — only `distribute-lead` needs changes
