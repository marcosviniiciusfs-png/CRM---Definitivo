import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { Separator } from "@/components/ui/separator";
import { DollarSign, FileText, Clock, User, Paperclip, Calendar, RefreshCw, Globe, MessageCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FacebookFormData } from "@/components/FacebookFormData";
import { CreateEventModal } from "@/components/CreateEventModal";
import type { Json } from "@/integrations/supabase/types";

interface LeadDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName: string;
}

interface DuplicateAttempt {
  source: string;
  attempted_at: string;
  form_name?: string;
  campaign_name?: string;
  webhook_token?: string;
}

interface LeadDetails {
  valor: number | null;
  descricao_negocio: string | null;
  responsavel: string | null;
  data_inicio: string | null;
  data_conclusao: string | null;
  additional_data: Json | null;
  email: string | null;
  duplicate_attempts_count: number | null;
  duplicate_attempts_history: Json | null;
}

interface Activity {
  id: string;
  activity_type: string;
  content: string;
  created_at: string;
  user_id: string;
  attachment_name: string | null;
  attachment_url: string | null;
}

interface ActivityWithUser extends Activity {
  user_name: string | null;
}

export const LeadDetailsDialog = ({ open, onOpenChange, leadId, leadName }: LeadDetailsDialogProps) => {
  const [details, setDetails] = useState<LeadDetails | null>(null);
  const [activities, setActivities] = useState<ActivityWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEventModal, setShowEventModal] = useState(false);

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
        .select("responsavel, data_inicio, data_conclusao, descricao_negocio, valor, additional_data, email, duplicate_attempts_count, duplicate_attempts_history")
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

      // Buscar nomes dos usuários que criaram as atividades
      if (activitiesData && activitiesData.length > 0) {
        const userIds = [...new Set(activitiesData.map(a => a.user_id))];
        
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", userIds);

        if (profilesError) throw profilesError;

        // Mapear atividades com nomes de usuários
        const activitiesWithUsers: ActivityWithUser[] = activitiesData.map(activity => ({
          ...activity,
          user_name: profilesData?.find(p => p.user_id === activity.user_id)?.full_name || null
        }));

        setActivities(activitiesWithUsers);
      } else {
        setActivities([]);
      }
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
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl">{leadName}</DialogTitle>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setShowEventModal(true)}
            >
              <Calendar className="h-4 w-4" />
              Agendar
            </Button>
          </div>
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

            {/* Histórico de Tentativas de Duplicação */}
            {details?.duplicate_attempts_count && details.duplicate_attempts_count > 0 && (
              <>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-amber-600">
                    <RefreshCw className="h-4 w-4" />
                    <h3 className="font-semibold text-sm">
                      Tentativas de Retorno ({details.duplicate_attempts_count})
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Este lead tentou entrar como novo {details.duplicate_attempts_count} vez{details.duplicate_attempts_count > 1 ? 'es' : ''} após a criação original.
                  </p>
                  <div className="space-y-2">
                    {Array.isArray(details.duplicate_attempts_history) && (details.duplicate_attempts_history as unknown as DuplicateAttempt[]).map((attempt, index) => (
                      <div key={index} className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                        <div className="flex items-center gap-2 mb-1">
                          {attempt.source === 'Facebook' && (
                            <svg className="h-3.5 w-3.5 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                            </svg>
                          )}
                          {attempt.source === 'WhatsApp' && (
                            <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                          )}
                          {attempt.source === 'Webhook' && (
                            <Globe className="h-3.5 w-3.5 text-purple-600" />
                          )}
                          <span className="text-xs font-medium">{attempt.source}</span>
                          <span className="text-xs text-muted-foreground ml-auto">
                            {format(new Date(attempt.attempted_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        {attempt.form_name && (
                          <p className="text-xs text-muted-foreground">Formulário: {attempt.form_name}</p>
                        )}
                        {attempt.campaign_name && (
                          <p className="text-xs text-muted-foreground">Campanha: {attempt.campaign_name}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Dados do Formulário Facebook (se existir) */}
            {details?.descricao_negocio?.includes('=== INFORMAÇÕES DO FORMULÁRIO ===') && (
              <>
                <FacebookFormData description={details.descricao_negocio} />
                <Separator />
              </>
            )}

            {/* Dados Adicionais do Webhook (se existir) */}
            {details?.additional_data && typeof details.additional_data === 'object' && !Array.isArray(details.additional_data) && Object.keys(details.additional_data).length > 0 && (
              <>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    <h3 className="font-semibold text-sm">Informações do Formulário</h3>
                  </div>
                  <div className="grid gap-3">
                    {Object.entries(details.additional_data as Record<string, any>).map(([key, value]) => (
                      <div key={key} className="p-3 rounded-lg bg-muted/30 border border-border/50">
                        <span className="text-xs font-medium text-muted-foreground block mb-1">
                          {key}
                        </span>
                        <p className="text-sm font-medium">
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <Separator />
              </>
            )}

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
                
                {/* Mostrar descrição apenas se NÃO for lead do Facebook */}
                {!details?.descricao_negocio?.includes('=== INFORMAÇÕES DO FORMULÁRIO ===') && (
                  <div>
                    <span className="text-muted-foreground">Descrição:</span>
                    <p className="font-medium whitespace-pre-wrap">
                      {details?.descricao_negocio || "Sem descrição"}
                    </p>
                  </div>
                )}
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
                      className="p-3 rounded-lg bg-muted/50 border border-border space-y-2"
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
                      
                      {/* Anexo */}
                      {activity.attachment_name && activity.attachment_url && (
                        <a
                          href={activity.attachment_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-primary hover:underline"
                        >
                          <Paperclip className="h-4 w-4" />
                          <span>{activity.attachment_name}</span>
                        </a>
                      )}
                      
                      {/* Criado por */}
                      {activity.user_name && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                          <User className="h-3 w-3" />
                          <span>Criada por {activity.user_name}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>

      <CreateEventModal
        open={showEventModal}
        onOpenChange={setShowEventModal}
        leadId={leadId}
        leadName={leadName}
        leadEmail={details?.email || undefined}
      />
    </Dialog>
  );
};
