import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Plus,
  Edit,
  Trash2,
  ToggleLeft,
  ToggleRight,
  GitFork,
  Users,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Zap,
  MoreVertical,
  Clock,
  Calendar,
  CheckCircle2,
  MessageSquare,
  Phone,
  Mail,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import { LeadDistributionConfigModal } from "./LeadDistributionConfigModal";
import { RedistributeBatchDialog } from "./RedistributeBatchDialog";
import { ConversionSparkline } from "./distribution/ConversionSparkline";
import { FilterRuleChips } from "./distribution/FilterRuleChips";
import { usePermissions } from "@/hooks/usePermissions";
import { LoadingAnimation } from "@/components/LoadingAnimation";

interface DistributionConfig {
  id: string;
  name: string;
  description?: string;
  source_type: string;
  source_identifiers: any;
  distribution_method: string;
  is_active: boolean;
  triggers: any;
  auto_redistribute: boolean;
  redistribution_timeout_minutes?: number;
  eligible_agents?: string[];
  team_id?: string | null;
  funnel_id?: string | null;
  funnel_stage_id?: string | null;
  filter_rules?: any;
  created_at?: string;
}

interface Funnel {
  id: string;
  name: string;
}

interface RedistributionProgress {
  total: number;
  processed: number;
  isRunning: boolean;
}

interface CapacityAlert {
  configId: string;
  configName: string;
  sourceType: string;
  totalAgents: number;
  agentsAtCapacity: number;
}

interface LeadDistributionListProps {
  onNavigateToAgentSettings?: () => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function getSourceIcon(source: string) {
  switch (source) {
    case "whatsapp":
      return <MessageSquare className="h-3.5 w-3.5" />;
    case "facebook":
      return <Globe className="h-3.5 w-3.5" />;
    case "webhook":
      return <Mail className="h-3.5 w-3.5" />;
    default:
      return <Phone className="h-3.5 w-3.5" />;
  }
}

export function LeadDistributionList({ onNavigateToAgentSettings }: LeadDistributionListProps) {
  const { user } = useAuth();
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const [editingConfig, setEditingConfig] = useState<DistributionConfig | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [progress, setProgress] = useState<RedistributionProgress>({
    total: 0,
    processed: 0,
    isRunning: false,
  });
  const [rouletteDialogOpen, setRouletteDialogOpen] = useState(false);
  const [capacityAlertOpen, setCapacityAlertOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

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

  const { data: configs, isLoading } = useQuery({
    queryKey: ["lead-distribution-configs", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("lead_distribution_configs")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as DistributionConfig[];
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: funnelsMap } = useQuery({
    queryKey: ["funnels-map", organizationId],
    queryFn: async () => {
      if (!organizationId) return {} as Record<string, string>;
      const { data, error } = await supabase
        .from("sales_funnels")
        .select("id, name")
        .eq("organization_id", organizationId);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data as Funnel[]).forEach((f) => { map[f.id] = f.name; });
      return map;
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch agent names for eligible_agents
  const { data: agentsMap } = useQuery({
    queryKey: ["all-agents-names", organizationId],
    queryFn: async () => {
      if (!organizationId) return {} as Record<string, string>;
      const { data } = await supabase
        .from("agent_distribution_settings")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("is_active", true);
      if (!data?.length) return {} as Record<string, string>;
      const userIds = data.map((a) => a.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      const map: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { map[p.user_id] = p.full_name || "Agente"; });
      return map;
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch distribution stats per config
  const { data: configStats } = useQuery({
    queryKey: ["config-distribution-stats", organizationId],
    queryFn: async () => {
      if (!organizationId) return {} as Record<string, { today: number; week: number; lastAt: string | null }>;
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("lead_distribution_history")
        .select("config_id, created_at")
        .eq("organization_id", organizationId)
        .gte("created_at", sevenDaysAgo);
      if (!data) return {} as Record<string, { today: number; week: number; lastAt: string | null }>;
      const stats: Record<string, { today: number; week: number; lastAt: string | null }> = {};
      const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
      for (const row of data) {
        if (!stats[row.config_id]) stats[row.config_id] = { today: 0, week: 0, lastAt: null };
        stats[row.config_id].week++;
        if (row.created_at >= todayStart) stats[row.config_id].today++;
        if (!stats[row.config_id].lastAt || row.created_at > stats[row.config_id].lastAt!) {
          stats[row.config_id].lastAt = row.created_at;
        }
      }
      return stats;
    },
    enabled: !!organizationId,
    staleTime: 2 * 60 * 1000,
  });

  const { data: unassignedCount } = useQuery({
    queryKey: ["unassigned-leads-count", organizationId],
    queryFn: async () => {
      if (!organizationId) return 0;
      const { count, error } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .is("responsavel_user_id", null);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: capacityAlerts } = useQuery({
    queryKey: ["capacity-alerts", organizationId],
    queryFn: async () => {
      if (!organizationId || !permissions.canManageAgentSettings) return [] as CapacityAlert[];
      const { data: cappedAgents } = await supabase
        .from("agent_distribution_settings")
        .select("user_id, max_capacity")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .eq("is_paused", false)
        .eq("capacity_enabled", true);
      if (!cappedAgents || cappedAgents.length === 0) return [] as CapacityAlert[];
      const agentIds = cappedAgents.map((a) => a.user_id);
      const { data: leadCounts } = await supabase
        .from("leads")
        .select("responsavel_user_id")
        .eq("organization_id", organizationId)
        .in("responsavel_user_id", agentIds);
      const countMap = new Map<string, number>();
      for (const row of leadCounts || []) {
        countMap.set(row.responsavel_user_id, (countMap.get(row.responsavel_user_id) || 0) + 1);
      }
      const atCapacitySet = new Set<string>();
      for (const agent of cappedAgents) {
        if ((countMap.get(agent.user_id) || 0) >= agent.max_capacity) atCapacitySet.add(agent.user_id);
      }
      if (atCapacitySet.size === 0) return [] as CapacityAlert[];
      const { data: activeConfigs } = await supabase
        .from("lead_distribution_configs")
        .select("id, name, source_type, eligible_agents")
        .eq("organization_id", organizationId)
        .eq("is_active", true);
      if (!activeConfigs || activeConfigs.length === 0) return [] as CapacityAlert[];
      const { data: allActiveAgents } = await supabase
        .from("agent_distribution_settings")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .eq("is_paused", false);
      const allActiveIds = new Set((allActiveAgents || []).map((a) => a.user_id));
      const alerts: CapacityAlert[] = [];
      for (const config of activeConfigs) {
        const eligibleIds: string[] = config.eligible_agents?.length > 0
          ? config.eligible_agents.filter((id: string) => allActiveIds.has(id))
          : [...allActiveIds];
        if (eligibleIds.length === 0) continue;
        const cappedInConfig = eligibleIds.filter((id) => atCapacitySet.has(id));
        if (cappedInConfig.length > 0 && cappedInConfig.length === eligibleIds.filter((id) => cappedAgents.some((a) => a.user_id === id)).length) {
          alerts.push({
            configId: config.id, configName: config.name, sourceType: config.source_type,
            totalAgents: eligibleIds.length, agentsAtCapacity: cappedInConfig.length,
          });
        }
      }
      return alerts;
    },
    enabled: !!organizationId && !!permissions.canManageAgentSettings,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (capacityAlerts && capacityAlerts.length > 0 && permissions.canManageAgentSettings) {
      setCapacityAlertOpen(true);
    }
  }, [capacityAlerts, permissions.canManageAgentSettings]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!openMenuId) return;
    const handler = () => setOpenMenuId(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [openMenuId]);

  const redistributeMutation = useMutation({
    mutationFn: async (selectedConfigId: string | null) => {
      if (!organizationId) throw new Error("Organizacao nao encontrada");
      setProgress({ total: 0, processed: 0, isRunning: true });
      let totalRedistributed = 0;
      let totalLeads = 0;
      let hasMore = true;
      const MAX_ITERATIONS = 50;
      let iteration = 0;
      while (hasMore && iteration < MAX_ITERATIONS) {
        iteration++;
        const body: Record<string, any> = { organization_id: organizationId };
        if (selectedConfigId) body.config_id = selectedConfigId;
        const { data, error } = await supabase.functions.invoke("redistribute-unassigned-leads", { body });
        if (error) throw error;
        totalRedistributed += data?.redistributed_count || 0;
        totalLeads = data?.total || 0;
        hasMore = data?.has_more === true;
        if ((data?.redistributed_count || 0) === 0) hasMore = false;
        setProgress({ total: totalLeads, processed: totalRedistributed, isRunning: hasMore });
      }
      return { redistributed_count: totalRedistributed, total: totalLeads };
    },
    onSuccess: (data) => {
      setProgress((prev) => ({ ...prev, isRunning: false }));
      queryClient.invalidateQueries({ queryKey: ["unassigned-leads-count"] });
      if (data.redistributed_count > 0) {
        toast.success(`${data.redistributed_count} leads redistribuidos com sucesso!`);
      } else {
        toast.info("Nenhum lead para redistribuir");
      }
    },
    onError: (error: any) => {
      toast.error(error?.message || "Erro ao redistribuir leads");
      setProgress((prev) => ({ ...prev, isRunning: false }));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (configId: string) => {
      const { error } = await supabase.from("lead_distribution_configs").delete().eq("id", configId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-distribution-configs"] });
      toast.success("Roleta excluida com sucesso");
    },
    onError: () => { toast.error("Erro ao excluir roleta"); },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ configId, isActive }: { configId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("lead_distribution_configs")
        .update({ is_active: !isActive })
        .eq("id", configId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-distribution-configs"] });
      toast.success("Status atualizado com sucesso");
    },
    onError: () => { toast.error("Erro ao atualizar status"); },
  });

  const getSourceTypeLabel = (sourceType: string) => {
    const labels: Record<string, string> = { all: "Todos", whatsapp: "WhatsApp", facebook: "Facebook", webhook: "Webhook" };
    return labels[sourceType] || sourceType;
  };

  const getMethodLabel = (method: string) => {
    const labels: Record<string, string> = { round_robin: "Rodizio", weighted: "Ponderado", load_based: "Por Carga", random: "Aleatorio", conversion_priority: "Smart AI" };
    return labels[method] || method;
  };

  const handleRedistributeConfirm = (configId: string | null) => {
    redistributeMutation.mutate(configId);
  };

  const handleEdit = (config: DistributionConfig) => { setEditingConfig(config); setIsModalOpen(true); };
  const handleCreate = () => { setEditingConfig(null); setIsModalOpen(true); };
  const handleModalClose = () => { setIsModalOpen(false); setEditingConfig(null); };

  const progressPercent = progress.total > 0 ? Math.min(Math.round((progress.processed / progress.total) * 100), 100) : 0;

  const parseFilterRules = (rules: any) => {
    try {
      if (!rules) return null;
      const parsed = typeof rules === "string" ? JSON.parse(rules) : rules;
      if (parsed?.conditions?.length) return parsed;
      return null;
    } catch { return null; }
  };

  function getRelativeTime(dateStr: string | null | undefined): string {
    if (!dateStr) return "Nunca";
    const diff = Date.now() - new Date(dateStr).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return "agora";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `ha ${minutes}min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `ha ${hours}h`;
    return `ha ${Math.floor(hours / 24)}d`;
  }

  if (isLoading) return <LoadingAnimation text="Carregando roletas" />;

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Roletas de Distribuicao</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure roletas para distribuir leads automaticamente entre sua equipe
          </p>
        </div>
        <Button onClick={handleCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova roleta
        </Button>
      </div>

      {/* Unassigned leads alert */}
      {(unassignedCount !== undefined && unassignedCount > 0) || progress.isRunning ? (
        <div className="rounded-xl border border-orange-200 bg-orange-50 dark:border-orange-500/20 dark:bg-orange-500/5 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-500/10 shrink-0">
                <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">
                  {progress.isRunning
                    ? `Redistribuindo... ${progress.processed}/${progress.total}`
                    : `${unassignedCount} lead${unassignedCount !== 1 ? "s" : ""} sem responsavel`}
                </p>
                <p className="text-xs text-orange-600/70 dark:text-orange-400/60">
                  {progress.isRunning
                    ? "Aguarde enquanto os leads sao distribuidos..."
                    : "Leads recebidos via WhatsApp e Facebook que nao foram distribuidos"}
                </p>
              </div>
            </div>
            {!progress.isRunning && (
              <Button
                variant="outline"
                onClick={() => setRouletteDialogOpen(true)}
                disabled={redistributeMutation.isPending}
                className="gap-2 border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-500/30 dark:text-orange-400 dark:hover:bg-orange-500/10"
              >
                <RefreshCw className="h-4 w-4" />
                Redistribuir agora
              </Button>
            )}
          </div>

          {progress.isRunning && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-orange-700 dark:text-orange-300">{progressPercent}%</span>
                <span className="text-orange-600/70 dark:text-orange-400/60">{progress.processed} de {progress.total} leads</span>
              </div>
              <div className="w-full bg-orange-200 dark:bg-orange-500/10 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-orange-500 h-2.5 rounded-full transition-all duration-700 ease-out relative overflow-hidden"
                  style={{ width: `${progressPercent}%` }}
                >
                  <div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                    style={{ animation: "shimmer 1.5s infinite", transform: "translateX(-100%)" }}
                  />
                </div>
              </div>
            </div>
          )}

          {!progress.isRunning && progress.processed > 0 && (
            <div className="mt-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              <span className="font-medium">{progress.processed} leads redistribuidos com sucesso</span>
            </div>
          )}
        </div>
      ) : null}

      {/* Roulette Cards */}
      <div className="space-y-4">
        {configs?.length === 0 ? (
          <div className="rounded-xl border bg-card py-16 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
              <RefreshCw className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Nenhuma roleta configurada</p>
            <p className="text-xs text-muted-foreground mb-4">
              Crie sua primeira roleta para comecar a distribuir leads automaticamente
            </p>
            <Button onClick={handleCreate} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Criar primeira roleta
            </Button>
          </div>
        ) : (
          configs?.map((config) => {
            const funnelName = config.funnel_id && funnelsMap ? funnelsMap[config.funnel_id] : null;
            const agentCount = config.eligible_agents?.length ?? 0;
            const filterRules = parseFilterRules(config.filter_rules);
            const isSmart = config.distribution_method === "conversion_priority";
            const stats = configStats?.[config.id];
            const maxDisplayAgents = 5;
            const displayAgents = (config.eligible_agents || [])
              .slice(0, maxDisplayAgents)
              .map((id) => ({ id, name: agentsMap?.[id] || "A" }));
            const extraAgents = agentCount - maxDisplayAgents;

            return (
              <div key={config.id} className="rounded-xl border bg-card shadow-sm hover:shadow-md transition-all duration-200 group">
                {/* Card Header */}
                <div className="flex items-start justify-between p-5 pb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      {/* Source icon */}
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${
                        config.is_active
                          ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {getSourceIcon(config.source_type)}
                      </div>
                      {/* Name */}
                      <h3 className="text-sm font-semibold truncate">{config.name}</h3>
                      {/* Status badge */}
                      {config.is_active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Ativa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          Inativa
                        </span>
                      )}
                      {isSmart && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-500/10 dark:text-violet-400">
                          <Zap className="h-3 w-3" />
                          Smart AI
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
                        {getSourceTypeLabel(config.source_type)}
                      </span>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                        {getMethodLabel(config.distribution_method)}
                      </span>
                      {funnelName && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                          <GitFork className="h-3 w-3" />
                          {funnelName}
                        </span>
                      )}
                    </div>
                    {config.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{config.description}</p>
                    )}
                  </div>

                  {/* Toggle + Actions */}
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <button
                      onClick={() => toggleActiveMutation.mutate({ configId: config.id, isActive: config.is_active })}
                      className="p-1.5 rounded-lg hover:bg-accent transition-colors"
                      title={config.is_active ? "Pausar roleta" : "Ativar roleta"}
                    >
                      {config.is_active
                        ? <ToggleRight className="h-5 w-5 text-emerald-500" />
                        : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                    </button>
                    <div className="relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === config.id ? null : config.id); }}
                        className="p-1.5 rounded-lg hover:bg-accent transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <MoreVertical className="h-4 w-4 text-muted-foreground" />
                      </button>
                      {openMenuId === config.id && (
                        <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border bg-popover shadow-lg z-50 py-1">
                          <button
                            onClick={() => { setOpenMenuId(null); handleEdit(config); }}
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent transition-colors"
                          >
                            <Edit className="h-3.5 w-3.5" /> Editar
                          </button>
                          {permissions.canDeleteRoulettes && (
                            <button
                              onClick={() => {
                                setOpenMenuId(null);
                                if (confirm("Tem certeza que deseja excluir esta roleta?")) deleteMutation.mutate(config.id);
                              }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Excluir
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Agent Avatars */}
                {agentCount > 0 && (
                  <div className="px-5 pb-2">
                    <div className="flex items-center gap-1">
                      {displayAgents.map((agent, i) => (
                        <div
                          key={agent.id}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary border-2 border-background -ml-1 first:ml-0"
                          title={agent.name}
                          style={{ zIndex: maxDisplayAgents - i }}
                        >
                          {getInitials(agent.name)}
                        </div>
                      ))}
                      {extraAgents > 0 && (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground border-2 border-background -ml-1">
                          +{extraAgents}
                        </div>
                      )}
                      <span className="text-xs text-muted-foreground ml-2">
                        {agentCount} {agentCount === 1 ? "agente" : "agentes"}
                      </span>
                    </div>
                  </div>
                )}

                {/* Filter rule chips */}
                {filterRules && (
                  <div className="px-5 pb-2">
                    <FilterRuleChips rules={filterRules} />
                  </div>
                )}

                {/* Metrics Footer */}
                <div className="px-5 py-3 border-t bg-muted/30 rounded-b-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-5">
                      <div className="flex items-center gap-1.5 text-xs">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Hoje</span>
                        <span className="font-semibold">{stats?.today ?? 0}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Semana</span>
                        <span className="font-semibold">{stats?.week ?? 0}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Ultima</span>
                        <span className="font-medium">{getRelativeTime(stats?.lastAt)}</span>
                      </div>
                    </div>
                    <ConversionSparkline configId={config.id} />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Dialogs */}
      <RedistributeBatchDialog
        open={rouletteDialogOpen}
        onOpenChange={setRouletteDialogOpen}
        organizationId={organizationId}
        onConfirm={handleRedistributeConfirm}
        isPending={redistributeMutation.isPending}
        showAutoOption={true}
        title="Redistribuir Leads sem Responsavel"
        description="Escolha qual roleta usar para redistribuir os leads."
      />

      <LeadDistributionConfigModal
        open={isModalOpen}
        onOpenChange={handleModalClose}
        config={editingConfig}
        organizationId={organizationId}
      />

      {/* Capacity alert dialog */}
      <Dialog open={capacityAlertOpen} onOpenChange={setCapacityAlertOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Alerta de Capacidade
            </DialogTitle>
            <DialogDescription>
              Alguns agentes com limite ativo estao na capacidade maxima.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {capacityAlerts?.map((alert) => (
              <div key={alert.configId} className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <p className="font-medium">{alert.configName}</p>
                <p className="text-xs text-muted-foreground">Canal: {getSourceTypeLabel(alert.sourceType)}</p>
                <p className="text-xs text-destructive font-medium mt-1">
                  {alert.agentsAtCapacity}/{alert.totalAgents} agentes no limite
                </p>
              </div>
            ))}
            {unassignedCount !== undefined && unassignedCount > 0 && (
              <div className="rounded-lg border border-orange-300 dark:border-orange-500/20 bg-orange-50 dark:bg-orange-500/5 p-3">
                <p className="font-medium text-orange-700 dark:text-orange-400">{unassignedCount} leads sem responsavel acumulados</p>
                <p className="text-xs text-muted-foreground">Estes leads nao estao sendo distribuidos porque agentes com limite estao lotados.</p>
              </div>
            )}
          </div>
          <div className="space-y-2 pt-2">
            <p className="text-xs font-medium">Acoes sugeridas:</p>
            <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
              <li>Aumentar capacidade ou desativar limite nas Configuracoes de Agente</li>
              <li>Adicionar mais colaboradores</li>
              <li>Mover leads atendidos para "Ganho" ou "Perdido"</li>
            </ul>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCapacityAlertOpen(false)}>Fechar</Button>
            {onNavigateToAgentSettings && (
              <Button onClick={() => { setCapacityAlertOpen(false); onNavigateToAgentSettings(); }}>
                Configuracoes de Agente
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
