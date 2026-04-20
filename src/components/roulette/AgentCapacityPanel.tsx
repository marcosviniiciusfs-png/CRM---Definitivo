import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { AgentDistributionSettings } from "@/components/AgentDistributionSettings";
import { getInitials, getAvatarColor } from "./utils";
import { toast } from "sonner";
import { useState } from "react";
import { Settings, Users, Pause, Play, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AgentInfo {
  user_id: string;
  full_name: string;
  max_capacity: number;
  currentLoad: number;
  is_paused: boolean;
  capacity_enabled: boolean;
  priority_weight: number;
  pause_until: string | null;
}

function getStatus(agent: AgentInfo): { label: string; dot: string } {
  if (agent.is_paused) return { label: "Ausente", dot: "bg-muted-foreground" };
  return { label: "Online", dot: "bg-emerald-500" };
}

export function AgentCapacityPanel() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  const [showSettings, setShowSettings] = useState(false);

  const { data: agents = [] } = useQuery({
    queryKey: ["roulette-agent-capacity", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data: settings } = await supabase
        .from("agent_distribution_settings")
        .select("user_id, max_capacity, is_paused, capacity_enabled, priority_weight, pause_until")
        .eq("organization_id", organizationId);
      if (!settings?.length) return [];

      const userIds = settings.map(s => s.user_id);
      const [profilesRes, leadsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name").in("user_id", userIds),
        supabase.from("leads").select("responsavel_user_id").eq("organization_id", organizationId).in("responsavel_user_id", userIds),
      ]);

      const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.user_id, p.full_name]));
      const loadCounts = new Map<string, number>();
      for (const row of leadsRes.data || []) {
        loadCounts.set(row.responsavel_user_id, (loadCounts.get(row.responsavel_user_id) || 0) + 1);
      }

      return settings.map(s => ({
        user_id: s.user_id,
        full_name: profileMap.get(s.user_id) || "Agente",
        max_capacity: 0,
        currentLoad: loadCounts.get(s.user_id) || 0,
        is_paused: s.is_paused || false,
        capacity_enabled: false,
        priority_weight: s.priority_weight || 1,
        pause_until: s.pause_until,
      })) as AgentInfo[];
    },
    staleTime: 30_000,
    enabled: !!organizationId,
  });

  const pauseMutation = useMutation({
    mutationFn: async ({ userId, pause }: { userId: string; pause: boolean }) => {
      const updates = pause
        ? { is_paused: true, pause_until: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), pause_reason: "Pausa manual" }
        : { is_paused: false, pause_until: null, pause_reason: null };
      const { error } = await supabase
        .from("agent_distribution_settings")
        .update(updates)
        .eq("user_id", userId)
        .eq("organization_id", organizationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roulette-agent-capacity"] });
      toast.success("Status atualizado");
    },
    onError: () => toast.error("Erro ao atualizar status"),
  });

  if (showSettings) {
    return (
      <div className="space-y-4">
        <button onClick={() => setShowSettings(false)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight className="h-3 w-3 rotate-180" /> Voltar
        </button>
        <AgentDistributionSettings />
      </div>
    );
  }

  const onlineCount = agents.filter(a => !a.is_paused).length;
  const pausedCount = agents.filter(a => a.is_paused).length;
  const totalLoad = agents.reduce((sum, a) => sum + a.currentLoad, 0);

  return (
    <div className="space-y-5">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-card p-3 text-center">
          <div className="text-lg font-bold">{agents.length}</div>
          <div className="text-[10px] text-muted-foreground">Total</div>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{onlineCount}</div>
          <div className="text-[10px] text-muted-foreground">Online</div>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <div className="text-lg font-bold text-muted-foreground">{pausedCount}</div>
          <div className="text-[10px] text-muted-foreground">Pausados</div>
        </div>
      </div>

      {/* Agent list */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agentes da roleta</h3>
          <button onClick={() => setShowSettings(true)} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
            <Settings className="h-3 w-3" /> Configuracoes
          </button>
        </div>

        {agents.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 text-center">
            <Users className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Nenhum agente configurado</p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left font-medium text-muted-foreground px-3 py-2">Agente</th>
                  <th className="text-center font-medium text-muted-foreground px-2 py-2">Peso</th>
                  <th className="text-center font-medium text-muted-foreground px-2 py-2">Leads</th>
                  <th className="text-center font-medium text-muted-foreground px-2 py-2">Status</th>
                  <th className="text-right font-medium text-muted-foreground px-3 py-2">Acao</th>
                </tr>
              </thead>
              <tbody>
                {agents.map(agent => {
                  const status = getStatus(agent);
                  return (
                    <tr key={agent.user_id} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${agent.is_paused ? "opacity-50" : ""}`}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0 ${getAvatarColor(agent.full_name)}`}>
                            {getInitials(agent.full_name)}
                          </div>
                          <span className="font-medium truncate max-w-[120px]">{agent.full_name}</span>
                        </div>
                      </td>
                      <td className="text-center px-2 py-2 text-muted-foreground">{agent.priority_weight}x</td>
                      <td className="text-center px-2 py-2">
                        <span className="text-muted-foreground">{agent.currentLoad}</span>
                      </td>
                      <td className="text-center px-2 py-2">
                        <span className="inline-flex items-center gap-1">
                          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                          <span className="text-muted-foreground">{status.label}</span>
                        </span>
                      </td>
                      <td className="text-right px-3 py-2">
                        <button
                          onClick={() => pauseMutation.mutate({ userId: agent.user_id, pause: !agent.is_paused })}
                          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-accent transition-colors"
                        >
                          {agent.is_paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                          {agent.is_paused ? "Retomar" : "Pausar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
