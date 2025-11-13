import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Phone, MessageSquare, Loader2, X, Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Lead } from "@/types/chat";
import { useToast } from "@/hooks/use-toast";
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

const statusConfig: Record<string, { label: string; color: string }> = {
  NOVO: { label: "Novo", color: "bg-blue-500" },
  EM_ATENDIMENTO: { label: "Em Atendimento", color: "bg-yellow-500" },
  FECHADO: { label: "Fechado", color: "bg-green-500" },
  PERDIDO: { label: "Perdido", color: "bg-red-500" },
};

const Leads = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);
  // Carregar leads do Supabase
  useEffect(() => {
    loadLeads();

    // Configurar realtime para atualizações automáticas
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
          loadLeads();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadLeads = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setLeads(data || []);
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

  const filteredLeads = leads.filter(
    (lead) =>
      lead.nome_lead.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.telefone_lead.includes(searchQuery)
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return 'Hoje';
    } else if (diffDays === 1) {
      return 'Ontem';
    } else if (diffDays < 7) {
      return `${diffDays} dias atrás`;
    }
    
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const openChat = (lead: Lead) => {
    navigate('/chat', { state: { selectedLead: lead } });
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Gerenciamento de Leads</h1>
          <p className="text-muted-foreground">Gerencie todos os seus leads em um só lugar</p>
        </div>
      </div>

      {/* Barra de pesquisa */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input 
          placeholder="Buscar por nome, email ou empresa..." 
          className="pl-10 h-12 text-base"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Lista de Leads */}
      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredLeads.length === 0 ? (
        <Card className="p-12">
          <div className="text-center text-muted-foreground">
            <p className="text-lg">Nenhum lead encontrado</p>
            {searchQuery && (
              <p className="text-sm mt-2">Tente ajustar sua busca</p>
            )}
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredLeads.map((lead) => {
            const statusInfo = statusConfig[lead.stage || 'NOVO'] || statusConfig.NOVO;
            
            return (
              <Card 
                key={lead.id} 
                className="hover:shadow-lg transition-all duration-200 border-l-4 hover:border-l-primary"
                style={{ borderLeftColor: statusInfo.color }}
              >
                <CardContent className="p-5">
                  <div className="flex items-center justify-between gap-4">
                    {/* Informações do Lead */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-3">
                        <h3 className="font-semibold text-lg text-foreground truncate">
                          {lead.nome_lead}
                        </h3>
                        <Badge 
                          className={`${statusInfo.color} text-white border-none shrink-0`}
                        >
                          {statusInfo.label}
                        </Badge>
                      </div>
                      
                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 shrink-0" />
                          <span>{lead.telefone_lead}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 shrink-0" />
                          <span>{lead.source || 'WhatsApp'}</span>
                        </div>
                        {lead.last_message_at && (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 shrink-0" />
                            <span>{formatDate(lead.last_message_at)}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button 
                        size="default"
                        onClick={() => openChat(lead)}
                        className="gap-2"
                      >
                        <MessageSquare className="h-4 w-4" />
                        Abrir Chat
                      </Button>
                      <Button 
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLeadToDelete(lead);
                        }}
                      >
                        <X className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
    </div>
  );
};

export default Leads;
