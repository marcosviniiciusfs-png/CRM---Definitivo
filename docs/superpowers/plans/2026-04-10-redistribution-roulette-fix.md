# Redistribuição com Escolha de Roleta + Sistema de Lotes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the bug where all redistributed leads go to one collaborator, add roulette selection for redistribution, and add batch tracking with a history tab for re-distributing past batches.

**Architecture:** New `redistribution_batches` table tracks each redistribution run. Modified `redistribute-unassigned-leads` accepts optional `config_id` and creates batch records. New `redistribute-batch` Edge Function handles re-distribution of past batches. Frontend adds a "Redistribuições" tab and a reusable roulette selector dialog.

**Tech Stack:** Supabase (PostgreSQL, Edge Functions/Deno), React, TypeScript, TanStack Query, shadcn/ui

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/20260410000000_redistribution_batches.sql` | DB schema: new table + column + indexes + RLS |
| Modify | `supabase/functions/redistribute-unassigned-leads/index.ts` | Accept config_id, create batch records, fix capacity query |
| Create | `supabase/functions/redistribute-batch/index.ts` | New Edge Function to re-distribute a past batch |
| Create | `src/components/RedistributeBatchDialog.tsx` | Reusable dialog for choosing a roulette |
| Create | `src/components/RedistributionBatches.tsx` | Tab component listing past redistribution batches |
| Modify | `src/components/LeadDistributionList.tsx` | Add roulette selector before redistributing unassigned leads |
| Modify | `src/pages/LeadDistribution.tsx` | Add "Redistribuições" tab |

---

### Task 1: Database Migration — redistribution_batches table

**Files:**
- Create: `supabase/migrations/20260410000000_redistribution_batches.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- ============================================================
-- Redistribution Batches: track each redistribution run
-- Also adds batch_id to lead_distribution_history for grouping
-- ============================================================

-- 1. Create redistribution_batches table
CREATE TABLE IF NOT EXISTS public.redistribution_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  config_id UUID REFERENCES public.lead_distribution_configs(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  batch_type TEXT NOT NULL CHECK (batch_type IN ('manual', 'auto', 'redistribution')),
  total_leads INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'redistributed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_redistribution_batches_org
  ON public.redistribution_batches (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_redistribution_batches_config
  ON public.redistribution_batches (config_id);

-- 3. Add batch_id column to lead_distribution_history
ALTER TABLE public.lead_distribution_history
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.redistribution_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lead_distribution_history_batch_id
  ON public.lead_distribution_history (batch_id);

-- 4. RLS
ALTER TABLE public.redistribution_batches ENABLE ROW LEVEL SECURITY;

-- SELECT: org members can view batches
CREATE POLICY "org_members_can_view_redistribution_batches"
  ON public.redistribution_batches
  FOR SELECT
  TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
  );

-- INSERT: edge functions use service_role, but admins can insert too
CREATE POLICY "org_admins_can_insert_redistribution_batches"
  ON public.redistribution_batches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_admin(auth.uid(), organization_id)
  );

-- UPDATE: admins can update batch status (for marking as redistributed)
CREATE POLICY "org_admins_can_update_redistribution_batches"
  ON public.redistribution_batches
  FOR UPDATE
  TO authenticated
  USING (
    public.is_org_admin(auth.uid(), organization_id)
  )
  WITH CHECK (
    public.is_org_admin(auth.uid(), organization_id)
  );

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Apply the migration**

Run: Apply via Supabase MCP `apply_migration` tool with project_id, name `redistribution_batches`.

- [ ] **Step 3: Verify table exists**

Run via Supabase MCP `execute_sql`:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'redistribution_batches' ORDER BY ordinal_position;
```
Expected: 8 rows (id, organization_id, config_id, created_by, batch_type, total_leads, status, created_at)

- [ ] **Step 4: Verify batch_id column on history**

Run via Supabase MCP `execute_sql`:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'lead_distribution_history' AND column_name = 'batch_id';
```
Expected: 1 row with column_name = 'batch_id'

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260410000000_redistribution_batches.sql
git commit -m "feat: add redistribution_batches table and batch_id to history"
```

---

### Task 2: Fix Bug + Modify redistribute-unassigned-leads Edge Function

**Files:**
- Modify: `supabase/functions/redistribute-unassigned-leads/index.ts`

This task fixes the capacity query bug and adds batch tracking + optional config_id.

- [ ] **Step 1: Fix the capacity query in `getAvailableAgentsFast`**

In `supabase/functions/redistribute-unassigned-leads/index.ts`, find the capacity check at approximately line 385-390:

```typescript
    // Verificar capacidade (query simplificada - sem join com stages para performance)
    const { count } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('responsavel_user_id', agent.user_id);
```

Replace with:

```typescript
    // Verificar capacidade (query filtrada por organização)
    const { count } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organization_id)
      .eq('responsavel_user_id', agent.user_id);
```

- [ ] **Step 2: Add `config_id` parameter handling**

At the top of the `serve` handler, after destructuring `{ organization_id }` (line 22), add `config_id`:

```typescript
    const { organization_id, config_id } = await req.json();
```

- [ ] **Step 3: Add batch creation after fetching configs**

After the configs are fetched (after line 75), insert batch creation logic. Find this block:

```typescript
    if (!configs || configs.length === 0) {
      return new Response(
        JSON.stringify({ success: false, redistributed_count: 0, total: totalCount || 0, has_more: false, message: 'Nenhuma roleta ativa encontrada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
```

After it, add batch creation:

```typescript
    // 2.5. Criar registro de lote
    const { data: batchRecord, error: batchError } = await supabase
      .from('redistribution_batches')
      .insert({
        organization_id,
        config_id: config_id || null,
        created_by: null, // Edge function não tem user context direto
        batch_type: 'manual',
        total_leads: 0,
        status: 'completed',
      })
      .select('id')
      .single();

    const batchId = batchRecord?.id || null;

    if (batchError) {
      console.error('⚠️ Erro ao criar lote (não crítico):', batchError);
    }
```

- [ ] **Step 4: Override config selection when config_id is provided**

Find the section where leads are grouped by config (around line 132). Before the `for (const lead of unassignedLeads)` loop, add config override logic:

```typescript
    // Se config_id foi fornecido, usar essa roleta ao invés de findBestConfig
    const effectiveConfig = config_id
      ? configs.find(c => c.id === config_id) || null
      : null;
```

Then inside the loop, replace:

```typescript
      const config = findBestConfig(configs, lead);
```

With:

```typescript
      const config = effectiveConfig || findBestConfig(configs, lead);
```

- [ ] **Step 5: Add batch_id to history records**

Find the history records preparation (around line 213-221):

```typescript
          historyRecords.push({
            lead_id: item.id,
            organization_id,
            config_id: configId,
            to_user_id: agentId,
            distribution_method: config.distribution_method,
            trigger_source: 'manual',
            is_redistribution: true,
          });
```

Add `batch_id`:

```typescript
          historyRecords.push({
            lead_id: item.id,
            organization_id,
            config_id: configId,
            batch_id: batchId,
            to_user_id: agentId,
            distribution_method: config.distribution_method,
            trigger_source: 'manual',
            is_redistribution: true,
          });
```

- [ ] **Step 6: Update batch total_leads after processing**

After the batch insert of history records (after the `if (historyRecords.length > 0)` block), add:

```typescript
    // 8.5. Atualizar total_leads do lote
    if (batchId && redistributedCount > 0) {
      await supabase
        .from('redistribution_batches')
        .update({ total_leads: redistributedCount })
        .eq('id', batchId);
    }
```

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/redistribute-unassigned-leads/index.ts
git commit -m "fix: add org filter to capacity query, accept config_id, add batch tracking"
```

---

### Task 3: Create redistribute-batch Edge Function

**Files:**
- Create: `supabase/functions/redistribute-batch/index.ts`

- [ ] **Step 1: Create the Edge Function**

```typescript
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

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

    const { batch_id, config_id, organization_id } = await req.json();

    if (!batch_id || !config_id || !organization_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'batch_id, config_id e organization_id são obrigatórios' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`🔄 [redistribute-batch] Iniciando: batch=${batch_id}, config=${config_id}`);

    // 1. Validar lote
    const { data: batch, error: batchError } = await supabase
      .from('redistribution_batches')
      .select('*')
      .eq('id', batch_id)
      .eq('organization_id', organization_id)
      .single();

    if (batchError || !batch) {
      return new Response(
        JSON.stringify({ success: false, error: 'Lote não encontrado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    if (batch.status !== 'completed') {
      return new Response(
        JSON.stringify({ success: false, error: 'Este lote já foi redistribuído' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // 2. Buscar roleta escolhida
    const { data: config, error: configError } = await supabase
      .from('lead_distribution_configs')
      .select('*')
      .eq('id', config_id)
      .eq('organization_id', organization_id)
      .eq('is_active', true)
      .single();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ success: false, error: 'Roleta não encontrada ou inativa' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // 3. Buscar leads do lote via histórico
    const { data: historyRecords, error: histError } = await supabase
      .from('lead_distribution_history')
      .select('lead_id, to_user_id')
      .eq('batch_id', batch_id);

    if (histError) throw histError;

    if (!historyRecords || historyRecords.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum lead encontrado neste lote' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Mapa: lead_id → to_user_id original (para verificar se ainda está com o mesmo colaborador)
    const originalAssignment = new Map(
      historyRecords.map((r: any) => [r.lead_id, r.to_user_id])
    );

    const leadIds = [...originalAssignment.keys()];

    // 4. Buscar leads atuais (excluindo won/lost)
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, responsavel_user_id, funnel_stage_id')
      .in('id', leadIds)
      .eq('organization_id', organization_id);

    if (leadsError) throw leadsError;

    // Filtrar: só leads que ainda estão com o mesmo colaborador E não estão em won/lost
    const activeLeads = (leads || []).filter((lead: any) => {
      // Lead foi movido manualmente para outro colaborador — não redistribuir
      if (lead.responsavel_user_id !== originalAssignment.get(lead.id)) {
        return false;
      }
      // Lead sem estágio — ok para redistribuir
      if (!lead.funnel_stage_id) return true;

      // Buscar stage_type seria necessário aqui, mas para performance
      // vamos incluir e filtrar depois via batch
      return true;
    });

    if (activeLeads.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum lead elegível para redistribuição neste lote' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Filtrar leads em won/lost stages
    const stageIds = [...new Set(activeLeads.map((l: any) => l.funnel_stage_id).filter(Boolean))];
    const wonLostStages = new Set<string>();

    if (stageIds.length > 0) {
      const { data: stages } = await supabase
        .from('funnel_stages')
        .select('id')
        .in('id', stageIds)
        .in('stage_type', ['won', 'lost']);

      (stages || []).forEach((s: any) => wonLostStages.add(s.id));
    }

    const eligibleLeads = activeLeads.filter((l: any) => !wonLostStages.has(l.funnel_stage_id));

    if (eligibleLeads.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Todos os leads estão em estágios ganho/perdido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // 5. Buscar colaboradores da roleta escolhida (direto, sem regras de capacidade/horário)
    const eligibleAgentIds = config.eligible_agents as string[] | null;

    let agents: any[] = [];
    if (eligibleAgentIds && eligibleAgentIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', eligibleAgentIds);

      const { data: members } = await supabase
        .from('organization_members')
        .select('user_id, email')
        .in('user_id', eligibleAgentIds)
        .eq('organization_id', organization_id)
        .eq('is_active', true);

      const profilesMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      const membersMap = new Map((members || []).map((m: any) => [m.user_id, m]));

      agents = (eligibleAgentIds || [])
        .filter(id => membersMap.has(id)) // Só membros ativos da org
        .map(id => ({
          user_id: id,
          full_name: profilesMap.get(id)?.full_name,
          email: membersMap.get(id)?.email,
        }));
    }

    if (agents.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum colaborador encontrado na roleta selecionada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // 6. Criar novo lote de redistribuição
    const { data: newBatch, error: newBatchError } = await supabase
      .from('redistribution_batches')
      .insert({
        organization_id,
        config_id,
        created_by: null,
        batch_type: 'redistribution',
        total_leads: 0,
        status: 'completed',
      })
      .select('id')
      .single();

    if (newBatchError) {
      console.error('Erro ao criar novo lote:', newBatchError);
    }

    const newBatchId = newBatch?.id || null;

    // 7. Distribuir leads em round-robin direto
    let agentIndex = 0;
    const updates: Array<{ leadId: string; agentId: string }> = [];
    const newHistoryRecords: any[] = [];

    for (const lead of eligibleLeads) {
      const agent = agents[agentIndex];
      agentIndex = (agentIndex + 1) % agents.length;

      updates.push({ leadId: lead.id, agentId: agent.user_id });

      newHistoryRecords.push({
        lead_id: lead.id,
        organization_id,
        config_id,
        batch_id: newBatchId,
        from_user_id: originalAssignment.get(lead.id),
        to_user_id: agent.user_id,
        distribution_method: config.distribution_method,
        trigger_source: 'manual',
        is_redistribution: true,
        redistribution_reason: `Re-distribuição do lote ${batch_id}`,
      });
    }

    // 8. Batch update leads (por agente para eficiência)
    const agentLeadMap = new Map<string, string[]>();
    for (const u of updates) {
      if (!agentLeadMap.has(u.agentId)) agentLeadMap.set(u.agentId, []);
      agentLeadMap.get(u.agentId)!.push(u.leadId);
    }

    // Buscar nomes dos agentes para o campo responsavel
    const agentNameMap = new Map(agents.map(a => [a.user_id, a.full_name || a.email]));

    let redistributedCount = 0;
    for (const [agentId, leadIds] of agentLeadMap) {
      const { error: updateError } = await supabase
        .from('leads')
        .update({
          responsavel_user_id: agentId,
          responsavel: agentNameMap.get(agentId),
        })
        .in('id', leadIds);

      if (updateError) {
        console.error(`Erro ao atualizar leads:`, updateError);
        continue;
      }

      redistributedCount += leadIds.length;
    }

    // 9. Inserir histórico
    if (newHistoryRecords.length > 0) {
      const { error: histInsertError } = await supabase
        .from('lead_distribution_history')
        .insert(newHistoryRecords);

      if (histInsertError) {
        console.error('Erro ao inserir histórico:', histInsertError);
      }
    }

    // 10. Marcar lote original como redistributed
    await supabase
      .from('redistribution_batches')
      .update({ status: 'redistributed' })
      .eq('id', batch_id);

    // 11. Atualizar total_leads do novo lote
    if (newBatchId && redistributedCount > 0) {
      await supabase
        .from('redistribution_batches')
        .update({ total_leads: redistributedCount })
        .eq('id', newBatchId);
    }

    console.log(`✅ [redistribute-batch] ${redistributedCount}/${eligibleLeads.length} leads redistribuídos`);

    return new Response(
      JSON.stringify({
        success: true,
        redistributed_count: redistributedCount,
        total_eligible: eligibleLeads.length,
        new_batch_id: newBatchId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('❌ Erro em redistribute-batch:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
```

- [ ] **Step 2: Deploy the Edge Function**

Deploy via Supabase MCP `deploy_edge_function` tool with project_id, name `redistribute-batch`, verify_jwt: true.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/redistribute-batch/index.ts
git commit -m "feat: add redistribute-batch Edge Function for re-distributing past batches"
```

---

### Task 4: Create RedistributeBatchDialog Component

**Files:**
- Create: `src/components/RedistributeBatchDialog.tsx`

- [ ] **Step 1: Create the reusable roulette selector dialog**

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { RefreshCw, Users, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface DistributionConfig {
  id: string;
  name: string;
  distribution_method: string;
  eligible_agents: string[] | null;
}

interface RedistributeBatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | null | undefined;
  /** Called with the chosen config_id. null means "automático" */
  onConfirm: (configId: string | null) => void;
  isPending?: boolean;
  /** If true, shows the "Automático" option */
  showAutoOption?: boolean;
  title?: string;
  description?: string;
}

const methodLabels: Record<string, string> = {
  round_robin: "Rodízio",
  weighted: "Ponderado",
  load_based: "Por Carga",
  random: "Aleatório",
};

export function RedistributeBatchDialog({
  open,
  onOpenChange,
  organizationId,
  onConfirm,
  isPending = false,
  showAutoOption = true,
  title = "Escolha a Roleta",
  description = "Selecione qual roleta usar para a redistribuição dos leads.",
}: RedistributeBatchDialogProps) {
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);

  const { data: configs } = useQuery({
    queryKey: ["active-distribution-configs", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("lead_distribution_configs")
        .select("id, name, distribution_method, eligible_agents")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as DistributionConfig[];
    },
    enabled: !!organizationId && open,
    staleTime: 2 * 60 * 1000,
  });

  const hasConfigs = configs && configs.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {!hasConfigs ? (
          <div className="flex items-center gap-2 p-4 text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded-md">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm">Nenhuma roleta ativa encontrada.</p>
          </div>
        ) : (
          <RadioGroup
            value={selectedConfigId || ""}
            onValueChange={setSelectedConfigId}
            className="space-y-2 max-h-64 overflow-y-auto"
          >
            {showAutoOption && (
              <div className="flex items-center space-x-3 p-3 rounded-md border bg-muted/30">
                <RadioGroupItem value="" id="auto" />
                <Label htmlFor="auto" className="flex-1 cursor-pointer">
                  <div className="font-medium">Automático</div>
                  <div className="text-sm text-muted-foreground">
                    O sistema escolhe a melhor roleta para cada lead
                  </div>
                </Label>
              </div>
            )}
            {configs.map((config) => {
              const agentCount = config.eligible_agents?.length ?? 0;
              return (
                <div key={config.id} className="flex items-center space-x-3 p-3 rounded-md border">
                  <RadioGroupItem value={config.id} id={config.id} />
                  <Label htmlFor={config.id} className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{config.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {methodLabels[config.distribution_method] || config.distribution_method}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Users className="h-3 w-3" />
                      {agentCount === 0
                        ? "Todos os colaboradores ativos"
                        : `${agentCount} colaborador${agentCount !== 1 ? "es" : ""}`}
                    </div>
                  </Label>
                </div>
              );
            })}
          </RadioGroup>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (!selectedConfigId && showAutoOption) {
                onConfirm(null);
              } else if (selectedConfigId) {
                onConfirm(selectedConfigId);
              } else {
                toast.error("Selecione uma roleta");
                return;
              }
              onOpenChange(false);
            }}
            disabled={isPending || (!selectedConfigId && !showAutoOption)}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isPending ? "animate-spin" : ""}`} />
            {isPending ? "Redistribuindo..." : "Redistribuir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/RedistributeBatchDialog.tsx
git commit -m "feat: add RedistributeBatchDialog for roulette selection"
```

---

### Task 5: Create RedistributionBatches Component

**Files:**
- Create: `src/components/RedistributionBatches.tsx`

- [ ] **Step 1: Create the batches list component**

```tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Calendar, Users, GitFork } from "lucide-react";
import { toast } from "sonner";
import { RedistributeBatchDialog } from "./RedistributeBatchDialog";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface RedistributionBatch {
  id: string;
  config_id: string | null;
  created_by: string | null;
  batch_type: string;
  total_leads: number;
  status: string;
  created_at: string;
}

interface ConfigMap {
  [key: string]: string;
}

const batchTypeLabels: Record<string, string> = {
  manual: "Manual",
  auto: "Automático",
  redistribution: "Redistribuição",
};

const batchTypeColors: Record<string, string> = {
  manual: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  auto: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  redistribution: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
};

export function RedistributionBatches() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const { data: organizationId } = useQuery({
    queryKey: ["user-organization", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .single();
      return data?.organization_id;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: batches, isLoading } = useQuery({
    queryKey: ["redistribution-batches", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("redistribution_batches")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as RedistributionBatch[];
    },
    enabled: !!organizationId,
    staleTime: 2 * 60 * 1000,
  });

  // Buscar nomes das roletas
  const { data: configsMap } = useQuery({
    queryKey: ["distribution-configs-map", organizationId],
    queryFn: async () => {
      if (!organizationId) return {} as ConfigMap;
      const { data, error } = await supabase
        .from("lead_distribution_configs")
        .select("id, name")
        .eq("organization_id", organizationId);

      if (error) throw error;
      const map: ConfigMap = {};
      (data || []).forEach((c: any) => { map[c.id] = c.name; });
      return map;
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  const redistributeBatchMutation = useMutation({
    mutationFn: async ({ batchId, configId }: { batchId: string; configId: string }) => {
      const { data, error } = await supabase.functions.invoke("redistribute-batch", {
        body: {
          batch_id: batchId,
          config_id: configId,
          organization_id: organizationId,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["redistribution-batches"] });
      queryClient.invalidateQueries({ queryKey: ["unassigned-leads-count"] });
      toast.success(`${data.redistributed_count || 0} leads redistribuídos com sucesso!`);
    },
    onError: (error: any) => {
      console.error("Erro ao re-distribuir lote:", error);
      toast.error(error?.message || "Erro ao re-distribuir lote");
    },
  });

  const handleRedistribute = (batchId: string) => {
    setSelectedBatchId(batchId);
    setDialogOpen(true);
  };

  const handleDialogConfirm = (configId: string | null) => {
    if (!selectedBatchId || !configId) return;
    redistributeBatchMutation.mutate({ batchId: selectedBatchId, configId });
  };

  if (isLoading) {
    return <LoadingAnimation text="Carregando redistribuições" />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Histórico de Redistribuições</h2>
        <p className="text-muted-foreground">
          Lotes de redistribuição anteriores. Re-distribua usando uma roleta diferente.
        </p>
      </div>

      {!batches || batches.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              Nenhuma redistribuição registrada ainda
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {batches.map((batch) => {
            const configName = batch.config_id && configsMap
              ? configsMap[batch.config_id]
              : null;
            const isCompleted = batch.status === "completed";

            return (
              <Card key={batch.id} className={!isCompleted ? "opacity-60" : ""}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(batch.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </div>

                      <Badge className={batchTypeColors[batch.batch_type] || ""}>
                        {batchTypeLabels[batch.batch_type] || batch.batch_type}
                      </Badge>

                      {configName ? (
                        <Badge variant="outline" className="gap-1 text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-400">
                          <GitFork className="h-3 w-3" />
                          {configName}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600">Automático</Badge>
                      )}

                      <div className="flex items-center gap-1 text-sm">
                        <Users className="h-3.5 w-3.5" />
                        <span className="font-medium">{batch.total_leads} leads</span>
                      </div>

                      <Badge
                        variant="outline"
                        className={
                          isCompleted
                            ? "text-green-600 border-green-300 bg-green-50 dark:bg-green-950 dark:border-green-700 dark:text-green-400"
                            : "text-muted-foreground"
                        }
                      >
                        {isCompleted ? "Concluído" : "Redistribuído"}
                      </Badge>
                    </div>

                    {isCompleted && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRedistribute(batch.id)}
                        disabled={redistributeBatchMutation.isPending}
                      >
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        Re-distribuir
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <RedistributeBatchDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        organizationId={organizationId}
        onConfirm={handleDialogConfirm}
        isPending={redistributeBatchMutation.isPending}
        showAutoOption={false}
        title="Re-distribuir Lote"
        description="Escolha a roleta para redistribuir os leads deste lote."
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/RedistributionBatches.tsx
git commit -m "feat: add RedistributionBatches component for batch history tab"
```

---

### Task 6: Add Roulette Selector to LeadDistributionList

**Files:**
- Modify: `src/components/LeadDistributionList.tsx`

This adds the roulette selector when the user clicks "Redistribuir agora" for unassigned leads.

- [ ] **Step 1: Add import for RedistributeBatchDialog**

At the top of `LeadDistributionList.tsx`, add the import after the existing imports:

```typescript
import { RedistributeBatchDialog } from "./RedistributeBatchDialog";
```

- [ ] **Step 2: Add state for the dialog**

Inside the `LeadDistributionList` component, after the existing `useState` declarations (around line 46-48), add:

```typescript
  const [rouletteDialogOpen, setRouletteDialogOpen] = useState(false);
```

- [ ] **Step 3: Modify the redistribute mutation to accept config_id**

Find the `redistributeMutation` (around line 124). Change the mutation function to accept a config_id parameter:

Replace:

```typescript
  const redistributeMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Organizacao nao encontrada");
```

With:

```typescript
  const redistributeMutation = useMutation({
    mutationFn: async (selectedConfigId: string | null) => {
      if (!organizationId) throw new Error("Organizacao nao encontrada");
```

Then inside the mutation body, find the `supabase.functions.invoke` call (around line 139) and add the config_id:

Replace:

```typescript
        const { data, error } = await supabase.functions.invoke("redistribute-unassigned-leads", {
          body: { organization_id: organizationId },
        });
```

With:

```typescript
        const body: Record<string, any> = { organization_id: organizationId };
        if (selectedConfigId) body.config_id = selectedConfigId;
        const { data, error } = await supabase.functions.invoke("redistribute-unassigned-leads", {
          body,
        });
```

- [ ] **Step 4: Add handler for dialog confirm**

After the `redistributeMutation` definition, add:

```typescript
  const handleRedistributeConfirm = (configId: string | null) => {
    redistributeMutation.mutate(configId);
  };
```

- [ ] **Step 5: Modify the "Redistribuir agora" button**

Find the "Redistribuir agora" button (around line 301-308). Replace the `onClick` handler:

Replace:

```typescript
                <Button
                  onClick={() => redistributeMutation.mutate()}
                  disabled={redistributeMutation.isPending}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${redistributeMutation.isPending ? "animate-spin" : ""}`} />
                  {redistributeMutation.isPending ? "Redistribuindo..." : "Redistribuir agora"}
                </Button>
```

With:

```typescript
                <Button
                  onClick={() => setRouletteDialogOpen(true)}
                  disabled={redistributeMutation.isPending}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${redistributeMutation.isPending ? "animate-spin" : ""}`} />
                  {redistributeMutation.isPending ? "Redistribuindo..." : "Redistribuir agora"}
                </Button>
```

- [ ] **Step 6: Add the dialog component**

Before the closing `</div>` of the component (before the `<LeadDistributionConfigModal>` tag), add:

```tsx
      <RedistributeBatchDialog
        open={rouletteDialogOpen}
        onOpenChange={setRouletteDialogOpen}
        organizationId={organizationId}
        onConfirm={handleRedistributeConfirm}
        isPending={redistributeMutation.isPending}
        showAutoOption={true}
        title="Redistribuir Leads sem Responsável"
        description="Escolha qual roleta usar para redistribuir os leads."
      />
```

- [ ] **Step 7: Commit**

```bash
git add src/components/LeadDistributionList.tsx
git commit -m "feat: add roulette selector dialog to unassigned leads redistribution"
```

---

### Task 7: Add Redistribuições Tab to LeadDistribution Page

**Files:**
- Modify: `src/pages/LeadDistribution.tsx`

- [ ] **Step 1: Add imports**

At the top of `LeadDistribution.tsx`, add after the existing imports:

```typescript
import { RedistributionBatches } from "@/components/RedistributionBatches";
import { RefreshCw } from "lucide-react";
```

- [ ] **Step 2: Add the new tab trigger**

Find the `TabsList` section (line 23-38). After the "Histórico" `TabsTrigger` (line 34-37), add:

```tsx
          {permissions.canCreateRoulettes && (
            <TabsTrigger value="redistributions" className="flex items-center gap-2 rounded-none px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200">
              <RefreshCw className="h-4 w-4" />
              Redistribuições
            </TabsTrigger>
          )}
```

- [ ] **Step 3: Add the tab content**

After the `<TabsContent value="history">` block (lines 50-52), add:

```tsx
        {permissions.canCreateRoulettes && (
          <TabsContent value="redistributions">
            <RedistributionBatches />
          </TabsContent>
        )}
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/LeadDistribution.tsx
git commit -m "feat: add Redistribuições tab to Lead Distribution page"
```

---

## Self-Review Checklist

### Spec Coverage
- [x] Seção 1 (Bug fix): Task 2 covers capacity query fix and config_id parameter
- [x] Seção 2 (Data model): Task 1 creates the table, index, and batch_id column
- [x] Seção 3 (Edge Functions): Task 2 modifies redistribute-unassigned-leads, Task 3 creates redistribute-batch
- [x] Seção 4 (Frontend): Tasks 4-7 cover dialog, batches list, selector in LeadDistributionList, and new tab
- [x] Seção 5 (Edge cases): Task 3 handles won/lost, manual re-assignment, empty agents, concurrency

### Placeholder Scan
- No TBDs, TODOs, or vague "implement later" instructions found
- Every step has complete code

### Type Consistency
- `RedistributeBatchDialogProps.onConfirm` passes `string | null` — consistent with `handleRedistributeConfirm` and `handleDialogConfirm` in Task 5 and Task 6
- `redistribution_batches` columns match between migration (Task 1) and Edge Function usage (Tasks 2 and 3)
- `batch_id` added to history records in both Task 2 and Task 3
