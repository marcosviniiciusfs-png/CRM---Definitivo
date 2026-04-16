import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { getInitials, getAvatarColor } from "./utils";
import { Download, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TimelineItem {
  id: string;
  leadName: string;
  agentName: string;
  fromAgentName: string | null;
  source: string;
  method: string;
  funnelName: string | null;
  createdAt: string;
  isRedistribution: boolean;
}

type FilterType = "all" | "whatsapp" | "facebook" | "webhook" | "redistribution";

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: "all", label: "Tudo" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "facebook", label: "Facebook" },
  { value: "webhook", label: "Webhook" },
  { value: "redistribution", label: "Redistribuicoes" },
];

const PAGE_SIZE = 50;

export function DistributionTimeline() {
  const { organizationId } = useOrganization();
  const [filter, setFilter] = useState<FilterType>("all");
  const [page, setPage] = useState(0);
  const [allItems, setAllItems] = useState<TimelineItem[]>([]);

  const { data: items = [], isLoading, isFetching } = useQuery({
    queryKey: ["distribution-timeline", organizationId, page],
    queryFn: async () => {
      if (!organizationId) return [];

      const offset = page * PAGE_SIZE;
      const { data, error } = await supabase
        .from("lead_distribution_history")
        .select("id, lead_id, to_user_id, from_user_id, source_type, created_at, config_id, is_redistribution")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw error;
      if (!data?.length) return [];

      // Batch fetch names
      const leadIds = [...new Set(data.map(d => d.lead_id).filter(Boolean))];
      const userIds = [...new Set([
        ...data.map(d => d.to_user_id).filter(Boolean),
        ...data.map(d => d.from_user_id).filter(Boolean),
      ])];

      const [leadsRes, profilesRes] = await Promise.all([
        leadIds.length ? supabase.from("leads").select("id, nome_lead, source").in("id", leadIds) : { data: [] },
        userIds.length ? supabase.from("profiles").select("user_id, full_name").in("user_id", userIds) : { data: [] },
      ]);

      const leadMap = new Map((leadsRes.data || []).map((l: any) => [l.id, l]));
      const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.user_id, p.full_name]));

      return data.map(row => ({
        id: row.id,
        leadName: leadMap.get(row.lead_id)?.nome_lead || "Lead desconhecido",
        agentName: profileMap.get(row.to_user_id) || "Sem agente",
        fromAgentName: row.from_user_id ? (profileMap.get(row.from_user_id) || null) : null,
        source: row.source_type || leadMap.get(row.lead_id)?.source || "",
        method: "",
        funnelName: null,
        createdAt: row.created_at,
        isRedistribution: row.is_redistribution || !!row.from_user_id,
      })) as TimelineItem[];
    },
    enabled: !!organizationId,
    staleTime: 30_000,
  });

  // Merge new items into allItems
  const merged = page === 0 ? items : [...allItems, ...items];

  // Apply client-side filter
  const filtered = merged.filter(item => {
    if (filter === "all") return true;
    if (filter === "redistribution") return item.isRedistribution;
    return item.source === filter;
  });

  const exportCSV = () => {
    const headers = "Lead,Agente,Origem,Data,Redistribuicao\n";
    const rows = filtered.map(i =>
      `"${i.leadName}","${i.agentName}","${i.source}","${new Date(i.createdAt).toLocaleString("pt-BR")}",${i.isRedistribution ? "Sim" : "Nao"}`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `distribuicoes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading && page === 0) return <LoadingAnimation text="Carregando historico" />;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {FILTER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                filter === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </Button>
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma distribuicao encontrada</p>
        </div>
      ) : (
        <div className="relative pl-6">
          {/* Vertical connector */}
          <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />

          <div className="space-y-4">
            {filtered.map(item => (
              <div key={item.id} className="relative flex items-start gap-3">
                {/* Dot */}
                <div className={`absolute -left-6 top-1.5 h-[10px] w-[10px] rounded-full border-2 border-background ${
                  item.isRedistribution ? "bg-amber-400" : "bg-emerald-500"
                }`} />

                <div className="flex-1 rounded-lg border bg-card p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {item.isRedistribution ? (
                        <span className="text-sm font-medium">
                          {item.leadName}: {item.fromAgentName || "?"} → {item.agentName}
                        </span>
                      ) : (
                        <span className="text-sm font-medium">
                          {item.leadName} → {item.agentName}
                        </span>
                      )}
                      {item.isRedistribution && (
                        <span className="text-[10px] font-medium rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 px-2 py-0.5">
                          Redistribuicao
                        </span>
                      )}
                      {item.source && (
                        <span className="text-[10px] font-medium rounded-full bg-secondary text-secondary-foreground px-2 py-0.5">
                          {item.source}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground shrink-0 ml-2">
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Load more */}
      {items.length === PAGE_SIZE && (
        <div className="text-center">
          <Button
            variant="outline"
            onClick={() => { setAllItems(merged); setPage(p => p + 1); }}
            disabled={isFetching}
          >
            {isFetching ? "Carregando..." : "Carregar mais"}
          </Button>
        </div>
      )}
    </div>
  );
}
