import { useState, useEffect, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Search, Plus, ArrowUpDown, Edit, Trash2, Download, Upload, X, CalendarIcon, Filter, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Lead } from "@/types/chat";
import { useToast } from "@/hooks/use-toast";
import { formatPhoneNumber } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LeadResponsibleSelect } from "@/components/LeadResponsibleSelect";
import { AddLeadModal } from "@/components/AddLeadModal";
import { EditLeadModal } from "@/components/EditLeadModal";
import { ImportLeadsModal } from "@/components/ImportLeadsModal";
import { usePermissions } from "@/hooks/usePermissions";
import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { useLeadsParallelQueries } from "@/hooks/useParallelQueries";

const statusConfig: Record<string, { label: string; color: string; textColor: string }> = {
  NOVO: { label: "Novo", color: "bg-blue-100 dark:bg-blue-500/20", textColor: "text-blue-700 dark:text-blue-300" },
  EM_ATENDIMENTO: { label: "Em Atendimento", color: "bg-amber-100 dark:bg-amber-500/20", textColor: "text-amber-700 dark:text-amber-300" },
  FECHADO: { label: "Fechado", color: "bg-emerald-100 dark:bg-emerald-500/20", textColor: "text-emerald-700 dark:text-emerald-300" },
  PERDIDO: { label: "Perdido", color: "bg-red-100 dark:bg-red-500/20", textColor: "text-red-700 dark:text-red-300" },
};

type SortColumn = "nome_lead" | "email" | "telefone_lead" | "stage" | "source" | "valor";
type SortOrder = "asc" | "desc";

const Leads = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, organizationId, isReady } = useOrganizationReady();
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [sortColumn, setSortColumn] = useState<SortColumn>("nome_lead");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [leadToEdit, setLeadToEdit] = useState<Lead | null>(null);
  const [userProfile, setUserProfile] = useState<{ full_name: string | null } | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  // Parallel queries hook
  const { loadFilterData: loadFilterDataParallel } = useLeadsParallelQueries();

  // Collapsible filters
  const [showFilters, setShowFilters] = useState(false);

  // Selection
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [showBulkActions, setShowBulkActions] = useState(false);

  // Advanced filters
  const [responsibleFilter, setResponsibleFilter] = useState<string>("all");
  const [funnelFilter, setFunnelFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [funnels, setFunnels] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);

  // Count active filters
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (statusFilter !== "all") count++;
    if (sourceFilter !== "all") count++;
    if (responsibleFilter !== "all") count++;
    if (funnelFilter !== "all") count++;
    if (stageFilter !== "all") count++;
    if (dateRange.from || dateRange.to) count++;
    return count;
  }, [statusFilter, sourceFilter, responsibleFilter, funnelFilter, stageFilter, dateRange]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
    setSelectedLeads([]);
  }, [searchQuery, statusFilter, sourceFilter, responsibleFilter, funnelFilter, stageFilter, dateRange, itemsPerPage]);

  // Load user profile for member filtering
  useEffect(() => {
    const loadUserProfile = async () => {
      if (!user || permissions.canViewAllLeads) return;

      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      setUserProfile(data);
    };

    loadUserProfile();
  }, [user, permissions.canViewAllLeads]);

  // Load filter data (OPTIMIZED: parallel queries)
  useEffect(() => {
    const loadAllFilterData = async () => {
      try {
        const result = await loadFilterDataParallel();
        setColaboradores(result.colaboradores);
        setFunnels(result.funnels);
      } catch (error) {
        console.error('Erro ao carregar dados de filtros:', error);
      }
    };

    loadAllFilterData();
  }, [loadFilterDataParallel]);

  // Load stages when funnel is selected
  useEffect(() => {
    const loadStages = async () => {
      if (funnelFilter === "all") {
        setStages([]);
        setStageFilter("all");
        return;
      }

      try {
        const { data } = await supabase
          .from('funnel_stages')
          .select('id, name')
          .eq('funnel_id', funnelFilter)
          .order('position');

        setStages(data || []);
        setStageFilter("all");
      } catch (error) {
        console.error('Erro ao carregar etapas:', error);
      }
    };

    loadStages();
  }, [funnelFilter]);

  // Load all leads from Supabase - with debounce realtime
  useEffect(() => {
    if (permissions.loading) return;
    if (!permissions.canViewAllLeads && !userProfile?.full_name) return;

    loadAllLeads();

    // Realtime with debounce
    let reloadTimeout: NodeJS.Timeout;
    const channel = supabase
      .channel('leads-changes-list')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads'
        },
        () => {
          clearTimeout(reloadTimeout);
          reloadTimeout = setTimeout(() => {
            loadAllLeads();
          }, 500);
        }
      )
      .subscribe();

    return () => {
      clearTimeout(reloadTimeout);
      supabase.removeChannel(channel);
    };
  }, [permissions.loading, permissions.canViewAllLeads, userProfile?.full_name]);

  const loadAllLeads = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("leads")
        .select("id, nome_lead, email, telefone_lead, responsavel, responsavel_user_id, stage, source, valor, updated_at, created_at, funnel_id, funnel_stage_id");

      // SECURITY: Members only see leads assigned to them
      if (!permissions.canViewAllLeads && user?.id) {
        query = query.eq("responsavel_user_id", user.id);
      }

      const { data, error } = await query
        .order("updated_at", { ascending: false });

      if (error) throw error;

      setLeads(data || []);
      // Filter selections to keep only leads that still exist
      setSelectedLeads(prev => {
        if (prev.length === 0) return prev;
        const newIds = new Set((data || []).map(l => l.id));
        return prev.filter(id => newIds.has(id));
      });
    } catch (error) {
      console.error("Erro ao carregar leads:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os leads",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortOrder("asc");
    }
  };

  // Optimized: useMemo for filtering and sorting
  const filteredLeads = useMemo(() => {
    return leads
      .filter((lead) => {
        const matchesSearch =
          lead.nome_lead.toLowerCase().includes(searchQuery.toLowerCase()) ||
          lead.telefone_lead.includes(searchQuery) ||
          (lead.email || "").toLowerCase().includes(searchQuery.toLowerCase());

        const matchesStatus = statusFilter === "all" || (lead.stage || "NOVO") === statusFilter;
        const matchesSource = sourceFilter === "all" || (lead.source || "WhatsApp") === sourceFilter;
        const matchesResponsibleFilter = responsibleFilter === "all" || lead.responsavel_user_id === responsibleFilter;
        const matchesFunnel = funnelFilter === "all" || lead.funnel_id === funnelFilter;
        const matchesStage = stageFilter === "all" || lead.funnel_stage_id === stageFilter;

        const leadDate = new Date(lead.created_at);
        const matchesDateRange =
          (!dateRange.from || leadDate >= dateRange.from) &&
          (!dateRange.to || leadDate <= dateRange.to);

        return matchesSearch && matchesStatus && matchesSource && matchesResponsibleFilter &&
          matchesFunnel && matchesStage && matchesDateRange;
      })
      .sort((a, b) => {
        let aValue: any = a[sortColumn] || "";
        let bValue: any = b[sortColumn] || "";

        if (sortColumn === "valor") {
          aValue = parseFloat(aValue) || 0;
          bValue = parseFloat(bValue) || 0;
        } else {
          aValue = String(aValue).toLowerCase();
          bValue = String(bValue).toLowerCase();
        }

        if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
        if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
  }, [leads, searchQuery, statusFilter, sourceFilter, responsibleFilter, funnelFilter, stageFilter, dateRange, sortColumn, sortOrder, permissions.canViewAllLeads, userProfile?.full_name]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredLeads.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredLeads.slice(indexOfFirstItem, indexOfLastItem);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setSelectedLeads([]);
  };

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
    setSelectedLeads([]);
  };

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("...");

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) pages.push(i);

      if (currentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }

    return pages;
  };

  const formatCurrency = (value: number | string) => {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(numValue || 0);
  };

  const handleEditLead = (lead: Lead) => {
    setLeadToEdit(lead);
    setShowEditModal(true);
  };

  const handleDeleteLead = async () => {
    if (!leadToDelete) return;

    try {
      const { error } = await supabase
        .from("leads")
        .delete()
        .eq("id", leadToDelete.id);

      if (error) throw error;

      toast({
        title: "Lead excluído",
        description: "O lead foi removido com sucesso",
      });

      setLeadToDelete(null);
    } catch (error) {
      console.error("Erro ao excluir lead:", error);
      toast({
        title: "Erro",
        description: "Não foi possível excluir o lead",
        variant: "destructive",
      });
    }
  };

  // Multi-selection functions
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedLeads(currentItems.map(lead => lead.id));
    } else {
      setSelectedLeads([]);
    }
  };

  const handleSelectLead = (leadId: string, checked: boolean) => {
    if (checked) {
      setSelectedLeads(prev => [...prev, leadId]);
    } else {
      setSelectedLeads(prev => prev.filter(id => id !== leadId));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedLeads.length === 0) return;

    try {
      const { error } = await supabase
        .from("leads")
        .delete()
        .in("id", selectedLeads);

      if (error) throw error;

      toast({
        title: "Leads excluídos",
        description: `${selectedLeads.length} leads foram removidos com sucesso`,
      });

      setSelectedLeads([]);
      setShowBulkActions(false);
    } catch (error) {
      console.error("Erro ao excluir leads:", error);
      toast({
        title: "Erro",
        description: "Não foi possível excluir os leads",
        variant: "destructive",
      });
    }
  };

  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedLeads.length === 0) return;

    try {
      const { error } = await supabase
        .from("leads")
        .update({ stage: newStatus })
        .in("id", selectedLeads);

      if (error) throw error;

      toast({
        title: "Status atualizado",
        description: `${selectedLeads.length} leads atualizados com sucesso`,
      });

      setSelectedLeads([]);
    } catch (error) {
      console.error("Erro ao atualizar status:", error);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar os leads",
        variant: "destructive",
      });
    }
  };

  const handleBulkAssign = async (responsibleName: string, responsibleUserId?: string) => {
    if (selectedLeads.length === 0) return;

    try {
      const updateData: any = { responsavel: responsibleName };
      if (responsibleUserId) {
        updateData.responsavel_user_id = responsibleUserId;
      }

      const { error } = await supabase
        .from("leads")
        .update(updateData)
        .in("id", selectedLeads);

      if (error) throw error;

      toast({
        title: "Responsável atribuído",
        description: `${selectedLeads.length} leads atribuídos com sucesso`,
      });

      setSelectedLeads([]);
    } catch (error) {
      console.error("Erro ao atribuir responsável:", error);
      toast({
        title: "Erro",
        description: "Não foi possível atribuir o responsável",
        variant: "destructive",
      });
    }
  };

  // Export XLSX
  const handleExportCSV = () => {
    import("xlsx").then((XLSX) => {
      const data = filteredLeads.map((lead) => ({
        "Nome": lead.nome_lead || "",
        "Email": lead.email || "",
        "Telefone": lead.telefone_lead || "",
        "Responsável": lead.responsavel || "",
        "Status": statusConfig[lead.stage || "NOVO"]?.label || "Novo",
        "Origem": lead.source || "WhatsApp",
        "Valor (R$)": lead.valor ? parseFloat(String(lead.valor)) : 0,
        "Criado em": format(new Date(lead.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
      }));

      const worksheet = XLSX.utils.json_to_sheet(data);

      worksheet["!cols"] = [
        { wch: 30 },
        { wch: 30 },
        { wch: 18 },
        { wch: 25 },
        { wch: 18 },
        { wch: 15 },
        { wch: 15 },
        { wch: 20 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");
      XLSX.writeFile(workbook, `leads_${format(new Date(), "yyyy-MM-dd")}.xlsx`);

      toast({
        title: "Exportação concluída",
        description: `${filteredLeads.length} leads exportados com sucesso`,
      });
    }).catch((err) => {
      console.error("Erro ao exportar:", err);
      toast({
        title: "Erro na exportação",
        description: "Não foi possível gerar o arquivo Excel",
        variant: "destructive",
      });
    });
  };

  // Update bulk actions visibility
  useEffect(() => {
    setShowBulkActions(selectedLeads.length > 0);
  }, [selectedLeads]);

  // Clear all filters
  const clearAllFilters = () => {
    setStatusFilter("all");
    setSourceFilter("all");
    setResponsibleFilter("all");
    setFunnelFilter("all");
    setStageFilter("all");
    setDateRange({ from: undefined, to: undefined });
    setSearchQuery("");
  };

  return (
    <div className="space-y-4 p-1">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Leads
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie todos os seus leads em um só lugar
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleExportCSV}
          >
            <Download className="h-4 w-4" />
            Exportar
          </Button>
          {permissions.canViewAllLeads && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setShowImportModal(true)}
            >
              <Upload className="h-4 w-4" />
              Importar
            </Button>
          )}
          {permissions.canCreateLeads && (
            <Button
              size="sm"
              className="gap-2 bg-primary hover:bg-primary/90"
              onClick={() => setShowAddModal(true)}
            >
              <Plus className="h-4 w-4" />
              Novo Lead
            </Button>
          )}
        </div>
      </div>

      {/* Search bar + Filter toggle */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, email ou telefone..."
            className="pl-10 h-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <Collapsible open={showFilters} onOpenChange={setShowFilters}>
          <CollapsibleTrigger asChild>
            <Button
              variant={activeFiltersCount > 0 ? "default" : "outline"}
              size="sm"
              className="gap-2 shrink-0"
            >
              <Filter className="h-4 w-4" />
              Filtros
              {activeFiltersCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px] bg-background text-foreground"
                >
                  {activeFiltersCount}
                </Badge>
              )}
              <ChevronDown className={cn(
                "h-3.5 w-3.5 transition-transform duration-200",
                showFilters && "rotate-180"
              )} />
            </Button>
          </CollapsibleTrigger>
        </Collapsible>
      </div>

      {/* Active filters summary */}
      {activeFiltersCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Filtros ativos:</span>
          {statusFilter !== "all" && (
            <Badge variant="secondary" className="gap-1 text-xs">
              Status: {statusConfig[statusFilter]?.label}
              <button onClick={() => setStatusFilter("all")}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {sourceFilter !== "all" && (
            <Badge variant="secondary" className="gap-1 text-xs">
              Origem: {sourceFilter}
              <button onClick={() => setSourceFilter("all")}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {responsibleFilter !== "all" && (
            <Badge variant="secondary" className="gap-1 text-xs">
              Responsável: {colaboradores.find(c => c.user_id === responsibleFilter)?.full_name || "Selecionado"}
              <button onClick={() => setResponsibleFilter("all")}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {funnelFilter !== "all" && (
            <Badge variant="secondary" className="gap-1 text-xs">
              Funil: {funnels.find(f => f.id === funnelFilter)?.name || "Selecionado"}
              <button onClick={() => setFunnelFilter("all")}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {stageFilter !== "all" && (
            <Badge variant="secondary" className="gap-1 text-xs">
              Etapa: {stages.find(s => s.id === stageFilter)?.name || "Selecionado"}
              <button onClick={() => setStageFilter("all")}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {(dateRange.from || dateRange.to) && (
            <Badge variant="secondary" className="gap-1 text-xs">
              Período: {dateRange.from ? format(dateRange.from, "dd/MM/yy", { locale: ptBR }) : "..."} - {dateRange.to ? format(dateRange.to, "dd/MM/yy", { locale: ptBR }) : "..."}
              <button onClick={() => setDateRange({ from: undefined, to: undefined })}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-muted-foreground hover:text-foreground"
            onClick={clearAllFilters}
          >
            Limpar tudo
          </Button>
        </div>
      )}

      {/* Collapsible Filters */}
      <Collapsible open={showFilters} onOpenChange={setShowFilters}>
        <CollapsibleContent>
          <div className="rounded-lg border bg-card p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 bg-background">
                  <SelectValue placeholder="Todos os Status" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="all">Todos os Status</SelectItem>
                  <SelectItem value="NOVO">Novo</SelectItem>
                  <SelectItem value="EM_ATENDIMENTO">Em Atendimento</SelectItem>
                  <SelectItem value="FECHADO">Fechado</SelectItem>
                  <SelectItem value="PERDIDO">Perdido</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="h-9 bg-background">
                  <SelectValue placeholder="Todas as Origens" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="all">Todas as Origens</SelectItem>
                  <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                  <SelectItem value="Manual">Manual</SelectItem>
                </SelectContent>
              </Select>

              <Select value={responsibleFilter} onValueChange={setResponsibleFilter}>
                <SelectTrigger className="h-9 bg-background">
                  <SelectValue placeholder="Todos Responsáveis" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="all">Todos Responsáveis</SelectItem>
                  {colaboradores.filter(c => c.user_id).map((colab) => (
                    <SelectItem key={colab.user_id} value={colab.user_id}>
                      {colab.full_name || colab.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={funnelFilter} onValueChange={setFunnelFilter}>
                <SelectTrigger className="h-9 bg-background">
                  <SelectValue placeholder="Todos Funis" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="all">Todos Funis</SelectItem>
                  {funnels.map((funnel) => (
                    <SelectItem key={funnel.id} value={funnel.id}>
                      {funnel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {funnelFilter !== "all" && stages.length > 0 ? (
                <Select value={stageFilter} onValueChange={setStageFilter}>
                  <SelectTrigger className="h-9 bg-background">
                    <SelectValue placeholder="Todas Etapas" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="all">Todas Etapas</SelectItem>
                    {stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "h-9 justify-start text-left font-normal",
                        !dateRange.from && !dateRange.to && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "dd/MM/yy", { locale: ptBR })} -{" "}
                            {format(dateRange.to, "dd/MM/yy", { locale: ptBR })}
                          </>
                        ) : (
                          format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })
                        )
                      ) : (
                        <span>Período de criação</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange.from}
                      selected={{ from: dateRange.from, to: dateRange.to }}
                      onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                      numberOfMonths={2}
                      locale={ptBR}
                    />
                    {(dateRange.from || dateRange.to) && (
                      <div className="p-3 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => setDateRange({ from: undefined, to: undefined })}
                        >
                          Limpar datas
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* Date range filter always shown if stage filter is active */}
            {(funnelFilter !== "all" && stages.length > 0) && (
              <div className="flex items-center gap-3">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-9 justify-start text-left font-normal",
                        !dateRange.from && !dateRange.to && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateRange.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "dd/MM/yy", { locale: ptBR })} -{" "}
                            {format(dateRange.to, "dd/MM/yy", { locale: ptBR })}
                          </>
                        ) : (
                          format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })
                        )
                      ) : (
                        <span>Período de criação</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={dateRange.from}
                      selected={{ from: dateRange.from, to: dateRange.to }}
                      onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                      numberOfMonths={2}
                      locale={ptBR}
                    />
                    {(dateRange.from || dateRange.to) && (
                      <div className="p-3 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => setDateRange({ from: undefined, to: undefined })}
                        >
                          Limpar datas
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Bulk Actions Bar */}
      {showBulkActions && permissions.canViewAllLeads && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg px-4 py-3 flex items-center justify-between animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-3">
            <Badge variant="default" className="gap-1">
              {selectedLeads.length} selecionado{selectedLeads.length > 1 ? 's' : ''}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedLeads([])}
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Limpar
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Select onValueChange={handleBulkStatusChange}>
              <SelectTrigger className="w-[160px] h-8 bg-background text-sm">
                <SelectValue placeholder="Alterar Status" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="NOVO">Novo</SelectItem>
                <SelectItem value="EM_ATENDIMENTO">Em Atendimento</SelectItem>
                <SelectItem value="FECHADO">Fechado</SelectItem>
                <SelectItem value="PERDIDO">Perdido</SelectItem>
              </SelectContent>
            </Select>

            <Select onValueChange={(userId) => {
              const colab = colaboradores.find(c => c.user_id === userId);
              if (colab) {
                handleBulkAssign(colab.full_name || colab.email, colab.user_id);
              }
            }}>
              <SelectTrigger className="w-[160px] h-8 bg-background text-sm">
                <SelectValue placeholder="Atribuir a" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {colaboradores.filter(c => c.user_id).map((colab) => (
                  <SelectItem key={colab.user_id} value={colab.user_id}>
                    {colab.full_name || colab.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {permissions.canDeleteLeads && (
              <Button
                variant="destructive"
                size="sm"
                className="h-8"
                onClick={handleBulkDelete}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Excluir
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Leads Table */}
      {loading ? (
        <LoadingAnimation text="Carregando leads..." />
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent bg-muted/50">
                  {permissions.canViewAllLeads && (
                    <TableHead className="w-[44px] pl-4">
                      <Checkbox
                        checked={currentItems.length > 0 && selectedLeads.length === currentItems.length}
                        data-state={selectedLeads.length > 0 && selectedLeads.length < currentItems.length ? "indeterminate" : undefined}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                  )}
                  <TableHead
                    className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    onClick={() => handleSort("nome_lead")}
                  >
                    <div className="flex items-center gap-1.5">
                      Nome
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </div>
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Telefone</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Colaborador</TableHead>
                  <TableHead
                    className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    onClick={() => handleSort("stage")}
                  >
                    <div className="flex items-center gap-1.5">
                      Status
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    onClick={() => handleSort("source")}
                  >
                    <div className="flex items-center gap-1.5">
                      Origem
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right"
                    onClick={() => handleSort("valor")}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      Valor
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </div>
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={permissions.canViewAllLeads ? 9 : 8} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <p className="text-muted-foreground text-sm">Nenhum lead encontrado</p>
                        {searchQuery && (
                          <p className="text-xs text-muted-foreground">
                            Tente ajustar sua busca ou filtros
                          </p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  currentItems.map((lead) => {
                    const statusInfo = statusConfig[lead.stage || 'NOVO'] || statusConfig.NOVO;
                    const isSelected = selectedLeads.includes(lead.id);

                    return (
                      <TableRow
                        key={lead.id}
                        className={cn(
                          "transition-colors group",
                          isSelected
                            ? "bg-primary/5 hover:bg-primary/10 border-l-2 border-l-primary"
                            : "hover:bg-muted/50 border-l-2 border-l-transparent"
                        )}
                      >
                        {permissions.canViewAllLeads && (
                          <TableCell className="pl-4">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => handleSelectLead(lead.id, checked as boolean)}
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <span className="font-medium text-sm text-foreground">
                            {lead.nome_lead}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {lead.email || "-"}
                        </TableCell>
                        <TableCell className="text-sm text-foreground">
                          {formatPhoneNumber(lead.telefone_lead)}
                        </TableCell>
                        <TableCell>
                          <LeadResponsibleSelect
                            leadId={lead.id}
                            currentResponsible={lead.responsavel}
                            onUpdate={loadAllLeads}
                          />
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-xs font-medium border-0",
                              statusInfo.color,
                              statusInfo.textColor
                            )}
                          >
                            {statusInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {lead.source || "WhatsApp"}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium text-foreground">
                          {formatCurrency(lead.valor || 0)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {permissions.canViewAllLeads && (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                                  onClick={() => handleEditLead(lead)}
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </Button>
                                {permissions.canDeleteLeads && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={() => setLeadToDelete(lead)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                Mostrando{" "}
                <span className="font-medium text-foreground">
                  {filteredLeads.length === 0 ? 0 : indexOfFirstItem + 1}
                </span>
                {" - "}
                <span className="font-medium text-foreground">
                  {Math.min(indexOfLastItem, filteredLeads.length)}
                </span>
                {" de "}
                <span className="font-medium text-foreground">{filteredLeads.length}</span>
                {" leads"}
              </span>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Itens por página:</span>
                <Select value={String(itemsPerPage)} onValueChange={handleItemsPerPageChange}>
                  <SelectTrigger className="w-[72px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <ChevronLeft className="h-3.5 w-3.5 -ml-3" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>

              {getPageNumbers().map((page, index) => (
                typeof page === "number" ? (
                  <Button
                    key={index}
                    variant={currentPage === page ? "default" : "outline"}
                    size="icon"
                    className="h-8 w-8 text-xs"
                    onClick={() => handlePageChange(page)}
                  >
                    {page}
                  </Button>
                ) : (
                  <span key={index} className="px-1 text-xs text-muted-foreground">...</span>
                )
              ))}

              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage >= totalPages}
              >
                <ChevronRight className="h-3.5 w-3.5" />
                <ChevronRight className="h-3.5 w-3.5 -ml-3" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!leadToDelete} onOpenChange={() => setLeadToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lead?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o lead <strong>{leadToDelete?.nome_lead}</strong>?
              Esta ação não pode ser desfeita e todas as mensagens do lead também serão removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteLead}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Lead Modal */}
      <AddLeadModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={loadAllLeads}
      />

      {/* Edit Lead Modal */}
      {leadToEdit && (
        <EditLeadModal
          open={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setLeadToEdit(null);
          }}
          onUpdate={() => loadAllLeads()}
          lead={leadToEdit}
        />
      )}

      {/* Import Leads Modal */}
      <ImportLeadsModal
        open={showImportModal}
        onOpenChange={setShowImportModal}
        organizationId={organizationId}
      />
    </div>
  );
};

export default Leads;
