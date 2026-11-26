import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { Paperclip, Calendar, ExternalLink, Loader2, Copy, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { humanizeFieldName, humanizeFieldValue } from "@/lib/formFields";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FacebookFormData } from "@/components/FacebookFormData";
import { CreateEventModal } from "@/components/CreateEventModal";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { fetchOrganizationMembersSafe } from "@/hooks/useOrganizationMembers";
import { getLeadDuplicateMetadata } from "@/lib/leadDuplicate";
import { isMeetingScheduleActivity, parseMeetingSchedule } from "@/lib/meetingSchedule";
import { useSegmentTerms } from "@/hooks/useOrganizationSegment";
import { formatBRL } from "@/lib/money";

interface LeadDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName: string;
  onEdit?: () => void;
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
  responsavel_user_id: string | null;
  data_inicio: string | null;
  data_conclusao: string | null;
  additional_data: Json | null;
  email: string | null;
  duplicate_attempts_count: number | null;
  duplicate_attempts_history: Json | null;
  calendar_event_id: string | null;
  source: string | null;
  telefone_lead?: string | null;
  created_at?: string | null;
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

interface CalendarEventDetails {
  id: string;
  title: string;
  start: string;
  end: string;
  htmlLink: string;
  description?: string;
}

export const LeadDetailsDialog = ({ open, onOpenChange, leadId, leadName, onEdit }: LeadDetailsDialogProps) => {
  const segmentTerms = useSegmentTerms();
  const { user, isSuperAdmin } = useAuth();
  const [details, setDetails] = useState<LeadDetails | null>(null);
  const [activities, setActivities] = useState<ActivityWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEventModal, setShowEventModal] = useState(false);
  const [calendarEvent, setCalendarEvent] = useState<CalendarEventDetails | null>(null);
  const [loadingCalendarEvent, setLoadingCalendarEvent] = useState(false);
  const [currentUserName, setCurrentUserName] = useState<string>('');
  const duplicateMetadata = getLeadDuplicateMetadata(details?.additional_data);

  useEffect(() => {
    if (open && leadId) {
      loadLeadDetails();
    }
  }, [open, leadId]);

  // Isolar a busca de criador em um hook independente para não quebrar o lead se falhar
  useEffect(() => {
    const creatorId = (details as any)?.created_by || details?.responsavel_user_id;

    if (!creatorId) {
      if (details?.responsavel) {
        setCurrentUserName(details.responsavel);
      } else {
        setCurrentUserName('Usuário');
      }
      return;
    }

    const fetchCreator = async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('full_name, email')
          .eq('user_id', creatorId)
          .maybeSingle();

        if ((data as any)?.full_name || (data as any)?.email) {
          setCurrentUserName((data as any).full_name || (data as any).email || 'Desconhecido');
        } else {
          // Tentar via membros como fallback
          const members = await fetchOrganizationMembersSafe();
          const member = members?.find((m: any) => m.user_id === creatorId);
          if (member) {
            const { data: mp } = await supabase
              .from('profiles')
              .select('full_name, email')
              .eq('user_id', creatorId)
              .maybeSingle();
            setCurrentUserName((mp as any)?.full_name || (mp as any)?.email || details?.responsavel || 'Usuário');
          } else {
            setCurrentUserName(details?.responsavel || 'Usuário');
          }
        }
      } catch (err) {
        console.error("Erro ao buscar criador do lead:", err);
        setCurrentUserName(details?.responsavel || 'Usuário');
      }
    };

    fetchCreator();
  }, [details?.responsavel_user_id, details?.responsavel]);

  // Buscar evento do Google Calendar quando tiver calendar_event_id
  useEffect(() => {
    if (details?.calendar_event_id && open) {
      loadCalendarEvent(details.calendar_event_id);
    } else {
      setCalendarEvent(null);
    }
  }, [details?.calendar_event_id, open]);

  const loadCalendarEvent = async (eventId: string) => {
    setLoadingCalendarEvent(true);
    try {
      // Buscar evento usando a edge function list-calendar-events com filtro
      const { data, error } = await supabase.functions.invoke('list-calendar-events', {
        body: {
          eventId,
          // Buscar eventos de 1 ano atrás até 1 ano no futuro para garantir que encontramos
          timeMin: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
          timeMax: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        }
      });

      if (!error && data?.events) {
        const event = data.events.find((e: any) => e.id === eventId);
        if (event) {
          setCalendarEvent({
            id: event.id,
            title: event.title || event.summary || 'Evento',
            start: event.start,
            end: event.end,
            htmlLink: event.htmlLink,
            description: event.description,
          });
        }
      }
    } catch (err) {
      console.error('Erro ao buscar evento do calendário:', err);
    } finally {
      setLoadingCalendarEvent(false);
    }
  };

  const loadLeadDetails = async () => {
    try {
      if (!leadId || leadId === 'undefined') return;

      setLoading(true);

      // Buscar detalhes do lead
      const { data: leadData, error: leadError } = await supabase
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .single();

      if (leadError) {
        console.error('Erro detalhado:', JSON.stringify(leadError));
        return;
      }
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
    return formatBRL(value ?? 0);
  };

  const formatDate = (date: string | null) => {
    if (!date) return "-";
    return format(new Date(date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  const renderActivityContent = (activity: ActivityWithUser) => {
    const schedule = isMeetingScheduleActivity(activity.activity_type)
      ? parseMeetingSchedule(activity.content)
      : null;

    if (!schedule) return <p className="whitespace-pre-wrap text-sm">{activity.content}</p>;

    return (
      <div className="space-y-1 text-sm">
        <p className="font-medium tabular-nums">{format(schedule.scheduledAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
        {schedule.phone && <p className="text-muted-foreground">Telefone: {schedule.phone}</p>}
        {schedule.value && <p className="text-muted-foreground">Valor: R$ {Number(schedule.value).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>}
        {schedule.notes && <p className="whitespace-pre-wrap text-muted-foreground">Obs.: {schedule.notes}</p>}
      </div>
    );
  };

  const sourceLabel = details?.source === "Facebook Leads" ? "Meta Ads" : details?.source || "Cadastro manual";
  const attempts = details?.duplicate_attempts_count ?? 0;
  const isFacebookForm =
    (details?.additional_data as any)?.source === "facebook" ||
    (details?.additional_data as any)?.fields?.length > 0 ||
    details?.source === "Facebook Leads" ||
    !!details?.descricao_negocio?.includes("=== INFORMAÇÕES DO FORMULÁRIO ===");
  const extraData =
    details?.additional_data &&
    typeof details.additional_data === "object" &&
    !Array.isArray(details.additional_data) &&
    (details.additional_data as any).source !== "facebook" &&
    !(details.additional_data as any).fields
      ? Object.entries(details.additional_data as Record<string, unknown>).filter(
          ([key, value]) => value !== null && value !== "" && !key.startsWith("_") && !["duplicate", "is_duplicate", "duplicate_of_lead_id", "duplicate_match_type"].includes(key) && typeof value !== "object",
        )
      : [];
  // Telefones ficam um embaixo do outro, em linha única, para facilitar a leitura.
  const isPhoneField = (key: string) => /telefone|whatsapp|celular|phone/i.test(key);
  const phoneData = extraData.filter(([key]) => isPhoneField(key));
  // Formulário e campanha de origem do lead: mostrados no topo da seção, fora da lista de respostas.
  const additionalObj = (details?.additional_data ?? {}) as Record<string, unknown>;
  const formName = typeof additionalObj.origem === "string" && additionalObj.origem.trim() ? additionalObj.origem.trim() : null;
  const campaignLabel =
    (typeof additionalObj.campaign_name === "string" && additionalObj.campaign_name.trim()) ||
    (typeof additionalObj.utm_campaign === "string" && additionalObj.utm_campaign.trim()) ||
    null;
  const headerKeys = ["origem", "campaign_name", "utm_campaign"];
  const otherExtraData = extraData.filter(([key]) => !isPhoneField(key) && !headerKeys.includes(key));
  const showDescription = !isFacebookForm && !!details?.descricao_negocio?.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex bg-card max-h-[92vh] w-[95vw] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[85vh]">
        <DialogHeader className="space-y-0 border-b border-border px-5 pb-4 pt-5 text-left sm:px-6">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="min-w-0">
              <DialogTitle className="truncate text-xl font-semibold tracking-[-0.01em]">{leadName}</DialogTitle>
              <p className="mt-0.5 truncate text-[13px] tabular-nums text-muted-foreground">
                {[sourceLabel, details?.telefone_lead, details?.email].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isSuperAdmin && (
                <Button variant="outline" size="sm" onClick={() => setShowEventModal(true)}>
                  <Calendar className="h-4 w-4" />
                  Agendar
                </Button>
              )}
              {onEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    onEdit();
                  }}
                >
                  <Pencil className="h-4 w-4" />
                  Editar
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Carregando" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Resumo */}
              <dl className="grid grid-cols-2 overflow-hidden rounded-lg border sm:grid-cols-4">
                {[
                  { label: segmentTerms.value, value: formatCurrency(details?.valor ?? 0), strong: true },
                  { label: "Responsável", value: details?.responsavel || "Sem responsável" },
                  { label: "Entrou em", value: details?.data_inicio || details?.created_at ? format(new Date((details?.data_inicio || details?.created_at) as string), "dd/MM/yyyy", { locale: ptBR }) : "—" },
                  { label: "Origem", value: sourceLabel },
                ].map((item, index) => (
                  <div
                    key={item.label}
                    className={cn(
                      "min-w-0 px-3.5 py-3",
                      index % 2 === 1 && "border-l",
                      index >= 2 && "border-t sm:border-t-0",
                      index === 2 && "sm:border-l",
                    )}
                  >
                    <dt className="text-xs text-muted-foreground">{item.label}</dt>
                    <dd className={cn("mt-0.5 truncate tabular-nums text-foreground", item.strong ? "text-lg font-semibold" : "text-sm font-medium")} title={item.value}>
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>

              {/* Avisos */}
              {duplicateMetadata.isDuplicateRecord && (
                <div role="note" className="flex items-start gap-2.5 rounded-md bg-warning-tint px-3 py-2.5 text-warning">
                  <Copy className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div className="space-y-0.5 text-[13px]">
                    <p className="font-semibold">Registro duplicado</p>
                    <p>
                      {`Já existia outro lead${duplicateMetadata.matchType === "phone" ? " com o mesmo telefone" : duplicateMetadata.matchType === "email" ? " com o mesmo e-mail" : ""} no CRM quando este entrou.`}
                    </p>
                  </div>
                </div>
              )}

              {attempts > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    Voltou {attempts} {attempts === 1 ? "vez" : "vezes"}
                  </h3>
                  <p className="text-[13px] text-muted-foreground">O lead tentou entrar de novo depois do primeiro cadastro.</p>
                  <ul className="divide-y rounded-md border">
                    {Array.isArray(details?.duplicate_attempts_history) &&
                      (details!.duplicate_attempts_history as unknown as DuplicateAttempt[]).map((attempt, index) => (
                        <li key={index} className="flex items-start justify-between gap-3 px-3 py-2 text-[13px]">
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">{attempt.source === "Facebook" ? "Meta Ads" : attempt.source}</p>
                            {(attempt.form_name || attempt.campaign_name) && (
                              <p className="truncate text-xs text-muted-foreground">
                                {[attempt.form_name, attempt.campaign_name].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </div>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDate(attempt.attempted_at)}</span>
                        </li>
                      ))}
                  </ul>
                </section>
              )}

              {isFacebookForm && (
                <FacebookFormData description={details?.descricao_negocio ?? null} customFields={details?.additional_data as any} />
              )}

              {extraData.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">Respostas do formulário</h3>
                  {(formName || campaignLabel) && (
                    <dl className="grid grid-cols-1 gap-x-6">
                      {formName && (
                        <div className="border-b border-border py-2.5">
                          <dt className="text-xs text-muted-foreground">Formulário</dt>
                          <dd className="mt-0.5 break-words text-sm font-medium text-foreground">{formName}</dd>
                        </div>
                      )}
                      {campaignLabel && (
                        <div className="border-b border-border py-2.5">
                          <dt className="text-xs text-muted-foreground">Campanha</dt>
                          <dd className="mt-0.5 break-words text-sm font-medium text-foreground">{campaignLabel}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                  {phoneData.length > 0 && (
                    <dl className="grid grid-cols-1 gap-x-6">
                      {phoneData.map(([key, value]) => (
                        <div key={key} className="border-b border-border py-2.5">
                          <dt className="text-xs text-muted-foreground">{humanizeFieldName(key)}</dt>
                          <dd className="mt-0.5 break-words text-sm font-medium text-foreground">{humanizeFieldValue(String(value))}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {otherExtraData.length > 0 && (
                    <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                      {otherExtraData.map(([key, value]) => (
                        <div key={key} className="border-b border-border py-2.5">
                          <dt className="text-xs text-muted-foreground">{humanizeFieldName(key)}</dt>
                          <dd className="mt-0.5 break-words text-sm font-medium text-foreground">{humanizeFieldValue(String(value))}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </section>
              )}

              {/* Negócio */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Negócio</h3>
                <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                  <div className="border-b border-border py-2.5">
                    <dt className="text-xs text-muted-foreground">Cadastrado por</dt>
                    <dd className="mt-0.5 text-sm font-medium text-foreground">
                      {details?.source && !/manual/i.test(details.source) ? `${sourceLabel}, automaticamente` : currentUserName}
                    </dd>
                  </div>
                  <div className="border-b border-border py-2.5">
                    <dt className="text-xs text-muted-foreground">Início</dt>
                    <dd className="mt-0.5 text-sm font-medium tabular-nums text-foreground">{formatDate(details?.data_inicio ?? null)}</dd>
                  </div>
                  {details?.data_conclusao && (
                    <div className="border-b border-border py-2.5">
                      <dt className="text-xs text-muted-foreground">Conclusão</dt>
                      <dd className="mt-0.5 text-sm font-medium tabular-nums text-foreground">{formatDate(details.data_conclusao)}</dd>
                    </div>
                  )}
                  {showDescription && (
                    <div className="border-b border-border py-2.5 sm:col-span-2">
                      <dt className="text-xs text-muted-foreground">Descrição</dt>
                      <dd className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{details?.descricao_negocio}</dd>
                    </div>
                  )}
                </dl>
              </section>

              {/* Atividades */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Atividades</h3>

                {isSuperAdmin && (loadingCalendarEvent || calendarEvent) && (
                  <div className="rounded-md bg-info-tint px-3 py-2.5 text-[13px]">
                    {loadingCalendarEvent ? (
                      <span className="inline-flex items-center gap-2 text-info">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Carregando o evento do calendário...
                      </span>
                    ) : calendarEvent && (
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-info">{calendarEvent.title}</span>
                          <a href={calendarEvent.htmlLink} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-info underline-offset-2 hover:underline">
                            Abrir no Google Agenda
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                        <p className="tabular-nums text-foreground/80">
                          {format(new Date(calendarEvent.start), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} até {format(new Date(calendarEvent.end), "HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {activities.length === 0 && !calendarEvent && !loadingCalendarEvent ? (
                  <p className="text-sm text-muted-foreground">Nenhuma atividade registrada.</p>
                ) : (
                  <ol className="relative space-y-4 border-l border-border pl-4">
                    {activities.map((activity) => (
                      <li key={activity.id} className="relative">
                        <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full border-2 border-card bg-muted-foreground" aria-hidden="true" />
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                          <span className="text-[13px] font-semibold text-foreground first-letter:uppercase">{activity.activity_type}</span>
                          <span className="text-xs tabular-nums text-muted-foreground">{formatDate(activity.created_at)}</span>
                        </div>
                        <div className="mt-1 text-foreground/90">{renderActivityContent(activity)}</div>
                        {activity.attachment_name && activity.attachment_url && (
                          <a href={activity.attachment_url} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground underline-offset-2 hover:underline">
                            <Paperclip className="h-3.5 w-3.5" />
                            {activity.attachment_name}
                          </a>
                        )}
                        {activity.user_name && <p className="mt-1 text-xs text-muted-foreground">por {activity.user_name}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          )}
        </div>
      </DialogContent>

      {isSuperAdmin && (
        <CreateEventModal
          open={showEventModal}
          onOpenChange={setShowEventModal}
          leadId={leadId}
          leadName={leadName}
          leadEmail={details?.email || undefined}
        />
      )}
    </Dialog>
  );
};
