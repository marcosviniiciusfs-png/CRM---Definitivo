import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { Separator } from "@/components/ui/separator";
import { DollarSign, FileText, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface LeadDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName: string;
}

interface LeadDetails {
  valor: number | null;
  descricao_negocio: string | null;
  responsavel: string | null;
  data_inicio: string | null;
  data_conclusao: string | null;
}

interface Activity {
  id: string;
  activity_type: string;
  content: string;
  created_at: string;
  user_id: string;
}

export const LeadDetailsDialog = ({ open, onOpenChange, leadId, leadName }: LeadDetailsDialogProps) => {
  const [details, setDetails] = useState<LeadDetails | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && leadId) {
      loadLeadDetails();
    }
  }, [open, leadId]);

  const loadLeadDetails = async () => {
    try {
      setLoading(true);
      
      // Buscar detalhes do lead
      const { data: leadData, error: leadError } = await supabase
        .from("leads")
        .select("responsavel, data_inicio, data_conclusao, descricao_negocio, valor")
        .eq("id", leadId)
        .single();

      if (leadError) throw leadError;
      setDetails(leadData);

      // Buscar atividades do lead
      const { data: activitiesData, error: activitiesError } = await supabase
        .from("lead_activities")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });

      if (activitiesError) throw activitiesError;
      setActivities(activitiesData || []);
    } catch (error) {
      console.error("Erro ao carregar detalhes do lead:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number | null) => {
    if (!value) return "R$ 0,00";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatDate = (date: string | null) => {
    if (!date) return "-";
    return format(new Date(date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{leadName}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Valor do Negócio */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <DollarSign className="h-4 w-4" />
                <h3 className="font-semibold text-sm">Valor do Negócio</h3>
              </div>
              <p className="text-2xl font-bold text-primary">
                {formatCurrency(details?.valor || 0)}
              </p>
            </div>

            <Separator />

            {/* Dados do Negócio */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileText className="h-4 w-4" />
                <h3 className="font-semibold text-sm">Dados do Negócio</h3>
              </div>
              
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Responsável:</span>
                  <p className="font-medium">{details?.responsavel || "Não atribuído"}</p>
                </div>
                
                <div>
                  <span className="text-muted-foreground">Data de Início:</span>
                  <p className="font-medium">{formatDate(details?.data_inicio)}</p>
                </div>
                
                {details?.data_conclusao && (
                  <div>
                    <span className="text-muted-foreground">Data de Conclusão:</span>
                    <p className="font-medium">{formatDate(details?.data_conclusao)}</p>
                  </div>
                )}
                
                <div>
                  <span className="text-muted-foreground">Descrição:</span>
                  <p className="font-medium whitespace-pre-wrap">
                    {details?.descricao_negocio || "Sem descrição"}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Histórico de Atividades */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <h3 className="font-semibold text-sm">Histórico de Atividades</h3>
              </div>

              {activities.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  Nenhuma atividade registrada
                </p>
              ) : (
                <div className="space-y-3">
                  {activities.map((activity) => (
                    <div
                      key={activity.id}
                      className="p-3 rounded-lg bg-muted/50 border border-border space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-primary capitalize">
                          {activity.activity_type}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(activity.created_at)}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{activity.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
