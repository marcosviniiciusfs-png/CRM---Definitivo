import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingAnimation } from "@/components/LoadingAnimation";
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
import { Search, Plus, ArrowUpDown, Edit, Trash2, Loader2 } from "lucide-react";
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

  // Carregar leads do Supabase
  useEffect(() => {
    loadLeads(true);

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
          }, 500); // Aguardar 500ms antes de recarregar
        }
      )
      .subscribe();

    return () => {
      clearTimeout(reloadTimeout);
      supabase.removeChannel(channel);
    };
  }, []);
  
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
      
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome_lead, email, telefone_lead, responsavel, stage, source, valor, updated_at, created_at")
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
        
        // Membros só veem leads onde são responsáveis
        const matchesResponsible = permissions.canViewAllLeads || 
          (userProfile?.full_name && lead.responsavel === userProfile.full_name);
        
        return matchesSearch && matchesStatus && matchesSource && matchesResponsible;
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
  }, [leads, searchQuery, statusFilter, sourceFilter, sortColumn, sortOrder, permissions.canViewAllLeads, userProfile?.full_name]);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Gerenciamento de Leads</h1>
          <p className="text-muted-foreground">Gerencie todos os seus leads em um só lugar</p>
        </div>
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

      {/* Filtros e Pesquisa */}
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

      {/* Tabela de Leads */}
      {loading ? (
        <LoadingAnimation text="Carregando leads..." />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
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
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Nenhum lead encontrado
                    {searchQuery && <p className="text-sm mt-2">Tente ajustar sua busca ou filtros</p>}
                  </TableCell>
                </TableRow>
              ) : (
                filteredLeads.map((lead) => {
                  const statusInfo = statusConfig[lead.stage || 'NOVO'] || statusConfig.NOVO;
                  
                  return (
                    <TableRow key={lead.id} className="hover:bg-muted/50">
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
