import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Edit,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Pause,
  MessageSquare,
  Globe,
  Phone,
  Mail,
  Zap,
  GitFork,
  Calendar,
  Clock,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { getInitials, getAvatarColor } from "./utils";

interface DistributionConfig {
  id: string;
  name: string;
  description?: string;
  source_type: string;
  distribution_method: string;
  is_active: boolean;
  eligible_agents?: string[];
  funnel_id?: string | null;
  filter_rules?: any;
  auto_redistribute: boolean;
  triggers: any;
}

interface AgentSetting {
  user_id: string;
  full_name: string;
  max_capacity: number;
  currentLoad: number;
  is_paused: boolean;
  capacity_enabled: boolean;
}

interface RouletteCardProps {
  config: DistributionConfig;
  funnelName: string | null;
  onEdit: () => void;
  onDelete: () => void;
  canDelete: boolean;
}

function getSourceIcon(source: string) {
  switch (source) {
    case "whatsapp": return <MessageSquare className="h-4 w-4" />;
    case "facebook": return <Globe className="h-4 w-4" />;
    case "webhook": return <Mail className="h-4 w-4" />;
    default: return <Phone className="h-4 w-4" />;
  }
}

function getMethodLabel(method: string): string {
  const labels: Record<string, string> = { round_robin: "Rodizio", weighted: "Ponderado", load_based: "Por Carga", random: "Aleatorio", conversion_priority: "Smart AI" };
  return labels[method] || method;
}

function getLoadColor(pct: number): string {
  if (pct >= 80) return "bg-red-500";
  if (pct >= 50) return "bg-amber-400";
  return "bg-emerald-500";
}

export function RouletteCard({ config, funnelName, onEdit, onDelete, canDelete }: RouletteCardProps) {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();

  // Fetch agents info
  const { data: agents = [] } = useQuery({
    queryKey: ["roulette-agents", config.id, config.eligible_agents],
    queryFn: async () => {
      const agentIds = config.eligible_agents?.length ? config.eligible_agents : [];
      if (!organizationId) return [];

      // If no eligible_agents set, get all active agents
      let targetIds = agentIds;
      if (!targetIds.length) {
        const { data: allAgents } = await supabase
          .from("agent_distribution_settings")
          .select("user_id")
          .eq("organization_id", organizationId)
          .eq("is_active", true);
        targetIds = (allAgents || []).map(a => a.user_id);
      }

      if (!targetIds.length) return [];

      const [profilesRes, settingsRes, leadsRes] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name").in("user_id", targetIds),
        supabase.from("agent_distribution_settings").select("user_id, max_capacity, is_paused, capacity_enabled").in("user_id", targetIds),
        supabase.from("leads").select("responsavel_user_id").in("responsavel_user_id", targetIds).not("stage", "in", "(ganho,perdido)"),
      ]);

      const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.user_id, p.full_name]));
      const settingsMap = new Map((settingsRes.data || []).map((s: any) => [s.user_id, s]));
      const loadCounts = new Map<string, number>();
      for (const row of leadsRes.data || []) {
        const uid = row.responsavel_user_id;
        loadCounts.set(uid, (loadCounts.get(uid) || 0) + 1);
      }

      return targetIds.map(id => ({
        user_id: id,
        full_name: profileMap.get(id) || "Agente",
        max_capacity: settingsMap.get(id)?.max_capacity || 50,
        currentLoad: loadCounts.get(id) || 0,
        is_paused: settingsMap.get(id)?.is_paused || false,
        capacity_enabled: settingsMap.get(id)?.capacity_enabled || false,
      })) as AgentSetting[];
    },
    staleTime: 5 * 60_000,
    enabled: !!organizationId,
    refetchOnWindowFocus: false,
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ["roulette-stats", config.id],
    queryFn: async () => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString();

      const [todayRes, weekRes, lastRes] = await Promise.all([
        supabase.from("lead_distribution_history").select("id", { count: "exact" }).eq("config_id", config.id).gte("created_at", todayStart),
        supabase.from("lead_distribution_history").select("id", { count: "exact" }).eq("config_id", config.id).gte("created_at", weekStart),
        supabase.from("lead_distribution_history").select("to_user_id, created_at").eq("config_id", config.id).order("created_at", { ascending: false }).limit(1),
      ]);

      let nextAgentName = "—";
      if (agents.length > 0 && config.distribution_method === "round_robin") {
        const lastUserId = lastRes.data?.[0]?.to_user_id;
        if (lastUserId) {
          const idx = agents.findIndex(a => a.user_id === lastUserId);
          const nextIdx = (idx + 1) % agents.length;
          nextAgentName = agents[nextIdx].full_name;
        } else {
          nextAgentName = agents[0].full_name;
        }
      } else if (agents.length > 0) {
        nextAgentName = agents[0].full_name;
      }

      return {
        today: todayRes.count || 0,
        week: weekRes.count || 0,
        lastAt: lastRes.data?.[0]?.created_at || null,
        nextAgent: nextAgentName,
      };
    },
    staleTime: 5 * 60_000,
    enabled: !!config.id,
    refetchOnWindowFocus: false,
  });

  const toggleMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("lead_distribution_configs")
        .update({ is_active: !config.is_active })
        .eq("id", config.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-distribution-configs"] });
      toast.success(config.is_active ? "Roleta pausada" : "Roleta ativada");
    },
    onError: () => toast.error("Erro ao alterar status"),
  });

  return (
    <div className={`rounded-lg border bg-card shadow-sm transition-all duration-200 hover:shadow-md ${!config.is_active ? "opacity-70" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <div className={`flex h-6 w-6 items-center justify-center rounded-md shrink-0 ${
            config.is_active ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-muted text-muted-foreground"
          }`}>
            {getSourceIcon(config.source_type)}
          </div>
          <h3 className="text-[13px] font-semibold truncate">{config.name}</h3>
          {config.is_active ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Ativa
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Inativa
            </span>
          )}
          {config.distribution_method === "conversion_priority" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-500/10 dark:text-violet-400">
              <Zap className="h-3 w-3" /> Smart AI
            </span>
          )}
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
            {config.source_type === "all" ? "Todos" : config.source_type}
          </span>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
            {getMethodLabel(config.distribution_method)}
          </span>
          {funnelName && (
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
              <GitFork className="h-3 w-3" /> {funnelName}
            </span>
          )}
          {!funnelName && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Generica
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0 ml-2">
          <button onClick={() => toggleMutation.mutate()} className="p-1 rounded-md hover:bg-accent transition-colors" title={config.is_active ? "Pausar" : "Ativar"}>
            {config.is_active ? <ToggleRight className="h-4 w-4 text-emerald-500" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
          </button>
          <button onClick={onEdit} className="p-1 rounded-md hover:bg-accent transition-colors" title="Editar">
            <Edit className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          {canDelete && (
            <button onClick={onDelete} className="p-1 rounded-md hover:bg-destructive/10 transition-colors" title="Excluir">
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
            </button>
          )}
        </div>
      </div>

      {/* Agent chips */}
      {agents.length > 0 && (
        <div className="px-3 pb-2">
          <div className="flex flex-wrap gap-1.5">
            {agents.map(agent => {
              const pct = agent.capacity_enabled ? Math.round((agent.currentLoad / agent.max_capacity) * 100) : 0;
              return (
                <div
                  key={agent.user_id}
                  className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] ${agent.is_paused ? "opacity-50" : ""}`}
                >
                  <div className={`h-4 w-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white ${getAvatarColor(agent.full_name)}`}>
                    {getInitials(agent.full_name)}
                  </div>
                  <span className="font-medium max-w-[60px] truncate">{agent.full_name.split(" ")[0]}</span>
                  {agent.capacity_enabled && (
                    <div className="w-6 h-1 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${getLoadColor(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  )}
                  {agent.is_paused && <Pause className="h-2.5 w-2.5 text-muted-foreground" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats footer */}
      <div className="grid grid-cols-4 border-t divide-x text-center">
        <div className="py-2 px-1.5">
          <div className="text-[9px] text-muted-foreground mb-0.5">Hoje</div>
          <div className="text-xs font-bold">{stats?.today ?? 0}</div>
        </div>
        <div className="py-2 px-1.5">
          <div className="text-[9px] text-muted-foreground mb-0.5">Semana</div>
          <div className="text-xs font-bold">{stats?.week ?? 0}</div>
        </div>
        <div className="py-2 px-1.5">
          <div className="text-[9px] text-muted-foreground mb-0.5">Proximo</div>
          <div className="text-[10px] font-semibold truncate">{stats?.nextAgent ?? "—"}</div>
        </div>
        <div className="py-2 px-1.5">
          <div className="text-[9px] text-muted-foreground mb-0.5">Ultima</div>
          <div className="text-[10px] font-medium">
            {stats?.lastAt
              ? formatDistanceToNow(new Date(stats.lastAt), { addSuffix: true, locale: ptBR })
              : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
