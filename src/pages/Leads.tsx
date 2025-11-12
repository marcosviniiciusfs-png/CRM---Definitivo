import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Filter, Phone, MessageSquare, Loader2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Lead } from "@/types/chat";
import { useToast } from "@/hooks/use-toast";

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  NOVO: { label: "Novo", variant: "default" },
  QUALIFICACAO: { label: "Qualificação", variant: "secondary" },
  PROPOSTA: { label: "Proposta", variant: "outline" },
  NEGOCIACAO: { label: "Negociação", variant: "secondary" },
  GANHO: { label: "Ganho", variant: "default" },
  PERDIDO: { label: "Perdido", variant: "outline" },
};

const Leads = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
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
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const openChat = (lead: Lead) => {
    navigate('/chat', { state: { selectedLead: lead } });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
          <p className="text-muted-foreground">Gerencie seus contatos e oportunidades vindos do WhatsApp</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar por nome ou telefone..." 
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">
              <p>Nenhum lead encontrado</p>
              {searchQuery && (
                <p className="text-sm mt-2">Tente ajustar sua busca</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredLeads.map((lead) => (
                <Card 
                  key={lead.id} 
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => openChat(lead)}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold text-lg">{lead.nome_lead}</h3>
                          {lead.stage && statusLabels[lead.stage] && (
                            <Badge variant={statusLabels[lead.stage].variant}>
                              {statusLabels[lead.stage].label}
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Phone className="h-4 w-4" />
                            <span>{lead.telefone_lead}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <MessageSquare className="h-4 w-4" />
                            <span>{lead.source || 'WhatsApp'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Button 
                          size="sm" 
                          onClick={(e) => {
                            e.stopPropagation();
                            openChat(lead);
                          }}
                        >
                          <MessageSquare className="h-4 w-4 mr-2" />
                          Abrir Chat
                        </Button>
                        {lead.last_message_at && (
                          <div className="text-xs text-muted-foreground">
                            Última mensagem: {formatDate(lead.last_message_at)}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Leads;
