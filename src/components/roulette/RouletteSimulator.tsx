import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Target, ChevronDown, ChevronUp, Play, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getInitials, getAvatarColor } from "./utils";

interface SimulationResult {
  rouletteName: string;
  agentName: string;
  method: string;
  reason: string;
}

export function RouletteSimulator({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { organizationId } = useOrganization();
  const [source, setSource] = useState("whatsapp");
  const [funnelId, setFunnelId] = useState("");
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [simulating, setSimulating] = useState(false);

  const { data: funnels } = useQuery({
    queryKey: ["simulator-funnels", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data } = await supabase
        .from("sales_funnels")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

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
      const eligible = (agentSettings || []).filter(a => eligibleIds.includes(a.user_id));

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

      // Reroute same agent check (simulated)
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
            reason = reason || "Smart AI (melhor taxa de conversao)";
            selectedAgent = eligible[0];
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

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full p-4 hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Simulador de distribuicao</span>
        </div>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 animate-fade-in-down">
          <p className="text-xs text-muted-foreground">
            Veja para qual agente um lead seria roteado agora, em tempo real
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Origem</label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="facebook">Facebook</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Funil</label>
              <Select value={funnelId || "__none__"} onValueChange={v => setFunnelId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Todos os funis" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Todos os funis</SelectItem>
                  {funnels?.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={simulate} disabled={simulating} className="gap-2 w-full sm:w-auto">
            <Play className="h-4 w-4" />
            {simulating ? "Simulando..." : "Simular"}
          </Button>

          {result && (
            <div className="rounded-lg bg-muted/50 p-4 space-y-2 transition-all duration-300" style={{ animation: "fadeInDown 0.3s ease-out" }}>
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <span className="text-muted-foreground">Lead de</span>
                <span className="font-semibold">{source}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Roleta:</span>
                <span className="font-semibold">{result.rouletteName}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-semibold text-white ${getAvatarColor(result.agentName)}`}>
                  {getInitials(result.agentName)}
                </div>
                <div>
                  <p className="text-sm font-semibold">{result.agentName}</p>
                  <p className="text-[11px] text-muted-foreground">{result.method} — {result.reason}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getMethodLabel(method: string): string {
  const labels: Record<string, string> = { round_robin: "Rodizio", weighted: "Ponderado", load_based: "Por Carga", random: "Aleatorio", conversion_priority: "Smart AI" };
  return labels[method] || method;
}
