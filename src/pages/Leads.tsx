import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Search, Plus, ArrowUpDown, Edit, Trash2, Loader2, Download, X, CalendarIcon, Filter } from "lucide-react";
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
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";

const statusConfig: Record<string, { label: string; color: string }> = {
  NOVO: { label: "Novo", color: "bg-blue-500" },
  EM_ATENDIMENTO: { label: "Em Atendimento", color: "bg-yellow-500" },
  FECHADO: { label: "Fechado", color: "bg-green-500" },
  PERDIDO: { label: "Perdido", color: "bg-red-500" },
};

type SortColumn = "nome_lead" | "email" | "telefone_lead" | "stage" | "source" | "valor";
type SortOrder = "asc" | "desc";

const Leads = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const permissions = usePermissions();
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
  const [leadToEdit, setLeadToEdit] = useState<Lead | null>(null);
  const [userProfile, setUserProfile] = useState<{ full_name: string | null } | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);
  const LEADS_PER_PAGE = 50;
  
  // Fase 2: Seleção múltipla
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [showBulkActions, setShowBulkActions] = useState(false);
  
  // Fase 3: Filtros avançados
  const [responsibleFilter, setResponsibleFilter] = useState<string>("all");
  const [funnelFilter, setFunnelFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [funnels, setFunnels] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [availableTags, setAvailableTags] = useState<any[]>([]);
  
  // Carregar perfil do usuário para filtrar leads de membros
  useEffect(() => {
    const loadUserProfile = async () => {
      if (!user || permissions.canViewAllLeads) return;
      
      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', user.id)
        .single();
      
      setUserProfile(data);
    };
    
    loadUserProfile();
  }, [user, permissions.canViewAllLeads]);
  
  // Carregar dados para filtros avançados
  useEffect(() => {
    const loadFilterData = async () => {
      try {
        // Carregar colaboradores
        const { data: members } = await supabase
          .from('organization_members')
          .select('user_id, email')
          .order('email');
        
        if (members) {
          const userIds = members.filter(m => m.user_id).map(m => m.user_id);
          const { data: profiles } = await supabase
            .from('profiles')
            .select('user_id, full_name')
            .in('user_id', userIds);
          
          const profilesMap = profiles?.reduce((acc, p) => {
            if (p.user_id) acc[p.user_id] = p.full_name;
            return acc;
          }, {} as any) || {};
          
          const colabsWithNames = members.map(m => ({
            user_id: m.user_id,
            email: m.email,
            full_name: m.user_id && profilesMap[m.user_id] ? profilesMap[m.user_id] : null,
          }));
          
          setColaboradores(colabsWithNames);
        }
        
        // Carregar funis
        const { data: funnelsData } = await supabase
          .from('sales_funnels')
          .select('id, name')
          .eq('is_active', true)
          .order('name');
        
        setFunnels(funnelsData || []);
        
        // Carregar tags
        const { data: tagsData } = await supabase
          .from('lead_tags')
          .select('id, name, color')
          .order('name');
        
        setAvailableTags(tagsData || []);
      } catch (error) {
        console.error('Erro ao carregar dados de filtros:', error);
      }
    };
    
    loadFilterData();
  }, []);

  // Carregar etapas quando funil é selecionado
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

  // Carregar leads do Supabase
  useEffect(() => {
    // Aguardar permissões e perfil carregarem
    if (permissions.loading) return;
    if (!permissions.canViewAllLeads && !userProfile?.full_name) return;

    loadLeads(true);
    setSelectedLeads([]); // Limpar seleção ao recarregar

    // Otimizado: debouncing em realtime para evitar recargas excessivas
    let reloadTimeout: NodeJS.Timeout;
    const channel = supabase
      .channel('leads-changes')
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
            loadLeads(true);
            setSelectedLeads([]); // Limpar seleção ao atualizar
          }, 500); // Aguardar 500ms antes de recarregar
        }
      )
      .subscribe();

    return () => {
      clearTimeout(reloadTimeout);
      supabase.removeChannel(channel);
    };
  }, [permissions.loading, permissions.canViewAllLeads, userProfile?.full_name]);
  
  const loadLeads = async (reset = false) => {
    if (reset) {
      setLoading(true);
      setPage(0);
      setHasMore(true);
    } else {
      setLoadingMore(true);
    }
    
    try {
      const startRange = reset ? 0 : page * LEADS_PER_PAGE;
      const endRange = startRange + LEADS_PER_PAGE - 1;
      
      let query = supabase
        .from("leads")
        .select("id, nome_lead, email, telefone_lead, responsavel, stage, source, valor, updated_at, created_at, funnel_id, funnel_stage_id");

      // SEGURANÇA: Members só veem leads atribuídos a eles (filtro no backend)
      if (!permissions.canViewAllLeads && userProfile?.full_name) {
        query = query.eq("responsavel", userProfile.full_name);
      }

      const { data, error } = await query
        .order("updated_at", { ascending: false })
        .range(startRange, endRange);

      if (error) throw error;
      
      if (reset) {
        setLeads(data || []);
      } else {
        setLeads(prev => [...prev, ...(data || [])]);
      }
      
      setHasMore((data || []).length === LEADS_PER_PAGE);
      if (!reset) setPage(prev => prev + 1);
    } catch (error) {
      console.error("Erro ao carregar leads:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os leads",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };
  
  // Função para carregar mais leads (infinite scroll)
  const loadMoreLeads = useCallback(() => {
    if (!loadingMore && hasMore) {
      loadLeads(false);
    }
  }, [loadingMore, hasMore, page]);
  
  // Intersection Observer para infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMoreLeads();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, loadingMore, loadMoreLeads]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortOrder("asc");
    }
  };

  // Otimizado: useMemo para evitar recalcular filtros a cada render
  const filteredLeads = useMemo(() => {
    return leads
      .filter((lead) => {
        const matchesSearch =
          lead.nome_lead.toLowerCase().includes(searchQuery.toLowerCase()) ||
          lead.telefone_lead.includes(searchQuery) ||
          (lead.email || "").toLowerCase().includes(searchQuery.toLowerCase());
        
        const matchesStatus = statusFilter === "all" || (lead.stage || "NOVO") === statusFilter;
        const matchesSource = sourceFilter === "all" || (lead.source || "WhatsApp") === sourceFilter;
        
        // Filtro de responsável
        const matchesResponsibleFilter = responsibleFilter === "all" || lead.responsavel === responsibleFilter;
        
        // Filtro de funil
        const matchesFunnel = funnelFilter === "all" || lead.funnel_id === funnelFilter;
        
        // Filtro de etapa
        const matchesStage = stageFilter === "all" || lead.funnel_stage_id === stageFilter;
        
        // Filtro de data
        const leadDate = new Date(lead.created_at);
        const matchesDateRange = 
          (!dateRange.from || leadDate >= dateRange.from) &&
          (!dateRange.to || leadDate <= dateRange.to);
        
        // Membros só veem leads onde são responsáveis
        const matchesResponsible = permissions.canViewAllLeads || 
          (userProfile?.full_name && lead.responsavel === userProfile.full_name);
        
        return matchesSearch && matchesStatus && matchesSource && matchesResponsibleFilter && 
               matchesFunnel && matchesStage && matchesDateRange && matchesResponsible;
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
  
  // Fase 2: Funções de seleção múltipla
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedLeads(filteredLeads.map(lead => lead.id));
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
  
  const handleBulkAssign = async (responsibleName: string) => {
    if (selectedLeads.length === 0) return;
    
    try {
      const { error } = await supabase
        .from("leads")
        .update({ responsavel: responsibleName })
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
  
  // Fase 5: Exportação CSV
  const handleExportCSV = () => {
    const headers = ["Nome", "Email", "Telefone", "Responsável", "Status", "Origem", "Valor", "Criado em"];
    const csvContent = [
      headers.join(","),
      ...filteredLeads.map(lead => [
        `"${lead.nome_lead}"`,
        `"${lead.email || ""}"`,
        `"${lead.telefone_lead}"`,
        `"${lead.responsavel || ""}"`,
        `"${statusConfig[lead.stage || 'NOVO']?.label || 'Novo'}"`,
        `"${lead.source || 'WhatsApp'}"`,
        `"${formatCurrency(lead.valor || 0)}"`,
        `"${format(new Date(lead.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}"`,
      ].join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `leads_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Exportação concluída",
      description: `${filteredLeads.length} leads exportados com sucesso`,
    });
  };
  
  // Atualizar visibilidade da barra de ações
  useEffect(() => {
    setShowBulkActions(selectedLeads.length > 0);
  }, [selectedLeads]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Gerenciamento de Leads</h1>
          <p className="text-muted-foreground">Gerencie todos os seus leads em um só lugar</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            className="gap-2"
            onClick={handleExportCSV}
          >
            <Download className="h-4 w-4" />
            Exportar
          </Button>
          {(permissions.canViewAllLeads) && (
            <Button 
              className="gap-2 bg-primary hover:bg-primary/90"
              onClick={() => setShowAddModal(true)}
            >
              <Plus className="h-4 w-4" />
              Adicionar Lead
            </Button>
          )}
        </div>
      </div>

      {/* Filtros e Pesquisa */}
      <div className="flex flex-col gap-4">
        {/* Linha 1: Busca e filtros básicos */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por nome, email ou telefone..." 
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-[200px] bg-background">
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
            <SelectTrigger className="w-full md:w-[200px] bg-background">
              <SelectValue placeholder="Todas as Origens" />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value="all">Todas as Origens</SelectItem>
              <SelectItem value="WhatsApp">WhatsApp</SelectItem>
              <SelectItem value="Manual">Manual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {/* Linha 2: Filtros avançados */}
        <div className="flex flex-col md:flex-row gap-4">
          <Select value={responsibleFilter} onValueChange={setResponsibleFilter}>
            <SelectTrigger className="w-full md:w-[200px] bg-background">
              <SelectValue placeholder="Todos Responsáveis" />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value="all">Todos Responsáveis</SelectItem>
              {colaboradores.map((colab) => (
                <SelectItem key={colab.user_id || colab.email} value={colab.full_name || colab.email || ''}>
                  {colab.full_name || colab.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={funnelFilter} onValueChange={setFunnelFilter}>
            <SelectTrigger className="w-full md:w-[200px] bg-background">
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
          
          {funnelFilter !== "all" && stages.length > 0 && (
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-full md:w-[200px] bg-background">
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
          )}
          
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full md:w-[240px] justify-start text-left font-normal",
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
      </div>
      
      {/* Barra de ações em lote */}
      {showBulkActions && permissions.canViewAllLeads && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 flex items-center justify-between animate-in slide-in-from-top">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">
              {selectedLeads.length} lead{selectedLeads.length > 1 ? 's' : ''} selecionado{selectedLeads.length > 1 ? 's' : ''}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedLeads([])}
            >
              <X className="h-4 w-4 mr-2" />
              Limpar seleção
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            <Select onValueChange={handleBulkStatusChange}>
              <SelectTrigger className="w-[180px] h-9 bg-background">
                <SelectValue placeholder="Alterar Status" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="NOVO">Novo</SelectItem>
                <SelectItem value="EM_ATENDIMENTO">Em Atendimento</SelectItem>
                <SelectItem value="FECHADO">Fechado</SelectItem>
                <SelectItem value="PERDIDO">Perdido</SelectItem>
              </SelectContent>
            </Select>
            
            <Select onValueChange={handleBulkAssign}>
              <SelectTrigger className="w-[180px] h-9 bg-background">
                <SelectValue placeholder="Atribuir a" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {colaboradores.map((colab) => (
                  <SelectItem key={colab.user_id || colab.email} value={colab.full_name || colab.email || ''}>
                    {colab.full_name || colab.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {permissions.canDeleteLeads && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Tabela de Leads */}
      {loading ? (
        <LoadingAnimation text="Carregando leads..." />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {permissions.canViewAllLeads && (
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={selectedLeads.length === filteredLeads.length && filteredLeads.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                )}
                <TableHead 
                  className="cursor-pointer select-none"
                  onClick={() => handleSort("nome_lead")}
                >
                  <div className="flex items-center gap-2">
                    Nome
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Colaborador</TableHead>
                <TableHead 
                  className="cursor-pointer select-none"
                  onClick={() => handleSort("stage")}
                >
                  <div className="flex items-center gap-2">
                    Status
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer select-none"
                  onClick={() => handleSort("source")}
                >
                  <div className="flex items-center gap-2">
                    Origem
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer select-none text-right"
                  onClick={() => handleSort("valor")}
                >
                  <div className="flex items-center justify-end gap-2">
                    Valor
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </TableHead>
                <TableHead className="text-center">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={permissions.canViewAllLeads ? 9 : 8} className="text-center py-8 text-muted-foreground">
                    Nenhum lead encontrado
                    {searchQuery && <p className="text-sm mt-2">Tente ajustar sua busca ou filtros</p>}
                  </TableCell>
                </TableRow>
              ) : (
                filteredLeads.map((lead) => {
                  const statusInfo = statusConfig[lead.stage || 'NOVO'] || statusConfig.NOVO;
                  const isSelected = selectedLeads.includes(lead.id);
                  
                  return (
                    <TableRow key={lead.id} className={cn("hover:bg-muted/50", isSelected && "bg-primary/5")}>
                      {permissions.canViewAllLeads && (
                        <TableCell>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => handleSelectLead(lead.id, checked as boolean)}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-medium">{lead.nome_lead}</TableCell>
                      <TableCell className="text-muted-foreground">{lead.email || "-"}</TableCell>
                      <TableCell className="text-primary">{formatPhoneNumber(lead.telefone_lead)}</TableCell>
                      <TableCell>
                        <LeadResponsibleSelect
                          leadId={lead.id}
                          currentResponsible={lead.responsavel}
                          onUpdate={loadLeads}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge className={`${statusInfo.color} text-white border-none`}>
                          {statusInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell>{lead.source || "WhatsApp"}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(lead.valor || 0)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          {permissions.canViewAllLeads && (
                            <>
                              <Button 
                                size="icon" 
                                variant="ghost"
                                className="h-8 w-8 text-muted-foreground hover:text-primary"
                                onClick={() => handleEditLead(lead)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              {permissions.canDeleteLeads && (
                                <Button 
                                  size="icon" 
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => setLeadToDelete(lead)}
                                >
                                  <Trash2 className="h-4 w-4" />
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
          
          {/* Elemento observador para infinite scroll */}
          <div ref={observerTarget} className="h-4" />
          
          {/* Loading indicator para carregamento de mais leads */}
          {loadingMore && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
        </div>
      )}

      {/* Dialog de confirmação de exclusão */}
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

      {/* Modal de adicionar lead */}
      <AddLeadModal 
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={loadLeads}
      />

      {/* Modal de editar lead */}
      {leadToEdit && (
        <EditLeadModal 
          open={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setLeadToEdit(null);
          }}
          onUpdate={loadLeads}
          lead={leadToEdit}
        />
      )}
    </div>
  );
};

export default Leads;
