import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Trash2, RefreshCw, AlertCircle, CheckCircle2, Clock, 
  FileText, Link2, ChevronDown, ChevronUp 
} from "lucide-react";
import { FaWhatsapp, FaFacebook } from "react-icons/fa";
import { SiMeta } from "react-icons/si";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Json } from "@/integrations/supabase/types";

// Componentes de ícone para cada fonte
const FacebookIcon = () => <FaFacebook className="h-4 w-4 text-[#1877F2]" />;
const WhatsAppIcon = () => <FaWhatsapp className="h-4 w-4 text-[#25D366]" />;
const MetaPixelIcon = () => <SiMeta className="h-4 w-4 text-[#0081FB]" />;
const WebhookIcon = () => <Link2 className="h-4 w-4 text-orange-600" />;

type LogSource = "facebook" | "whatsapp" | "webhook" | "meta_pixel";

interface FacebookLog {
  id: string;
  event_type: string;
  status: string;
  error_message: string | null;
  lead_id: string | null;
  facebook_lead_id: string | null;
  page_id: string | null;
  form_id: string | null;
  payload: any;
  created_at: string;
}

interface WhatsAppLog {
  id: string;
  event_type: string;
  status: string;
  error_message: string | null;
  instance_name: string;
  remote_jid: string | null;
  sender_name: string | null;
  message_type: string | null;
  message_content: string | null;
  direction: string | null;
  payload: any;
  created_at: string;
}

interface WebhookLog {
  id: string;
  organization_id: string;
  webhook_token: string;
  event_type: string;
  status: string;
  payload: any;
  lead_id: string | null;
  error_message: string | null;
  created_at: string;
}

interface MetaPixelLog {
  id: string;
  lead_id: string | null;
  funnel_id: string | null;
  pixel_id: string;
  event_name: string;
  event_id: string | null;
  status: string;
  events_received: number | null;
  error_message: string | null;
  request_payload: Json | null;
  response_payload: Json | null;
  created_at: string;
}

const sourceConfig = {
  facebook: {
    label: "Facebook Leads",
    IconComponent: FacebookIcon,
    color: "text-[#1877F2]",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
  },
  whatsapp: {
    label: "WhatsApp",
    IconComponent: WhatsAppIcon,
    color: "text-[#25D366]",
    bgColor: "bg-green-50 dark:bg-green-950/30",
  },
  webhook: {
    label: "Webhook",
    IconComponent: WebhookIcon,
    color: "text-orange-600",
    bgColor: "bg-orange-50 dark:bg-orange-950/30",
  },
  meta_pixel: {
    label: "Meta Pixel",
    IconComponent: MetaPixelIcon,
    color: "text-[#0081FB]",
    bgColor: "bg-purple-50 dark:bg-purple-950/30",
  },
};

export function IntegratedLogsViewer() {
  const { user } = useAuth();
  const [selectedSource, setSelectedSource] = useState<LogSource>("facebook");
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const loadLogs = async () => {
    if (!user) return;

    setLoading(true);
    try {
      let data: any[] = [];

      switch (selectedSource) {
        case "facebook":
          const { data: fbData, error: fbError } = await supabase
            .from("facebook_webhook_logs")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(100);
          if (fbError) throw fbError;
          data = fbData || [];
          break;

        case "whatsapp":
          const { data: waData, error: waError } = await supabase
            .from("webhook_logs")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(100);
          if (waError) throw waError;
          data = waData || [];
          break;

        case "webhook":
          const { data: whData, error: whError } = await supabase
            .from("form_webhook_logs")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(100);
          if (whError) throw whError;
          data = whData || [];
          break;

        case "meta_pixel":
          const { data: mpData, error: mpError } = await supabase
            .from("meta_conversion_logs")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(100);
          if (mpError) throw mpError;
          data = mpData || [];
          break;
      }

      setLogs(data);
    } catch (error: any) {
      console.error("Error loading logs:", error);
      toast.error("Erro ao carregar logs");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLog = async () => {
    if (!selectedLogId) return;

    try {
      let error: any = null;
      
      switch (selectedSource) {
        case "facebook":
          ({ error } = await supabase.from("facebook_webhook_logs").delete().eq("id", selectedLogId));
          break;
        case "whatsapp":
          ({ error } = await supabase.from("webhook_logs").delete().eq("id", selectedLogId));
          break;
        case "webhook":
          ({ error } = await supabase.from("form_webhook_logs").delete().eq("id", selectedLogId));
          break;
        case "meta_pixel":
          ({ error } = await supabase.from("meta_conversion_logs").delete().eq("id", selectedLogId));
          break;
      }

      if (error) throw error;

      toast.success("Log excluído com sucesso");
      setLogs(logs.filter((log) => log.id !== selectedLogId));
      setDeleteDialogOpen(false);
      setSelectedLogId(null);
    } catch (error: any) {
      console.error("Error deleting log:", error);
      toast.error("Erro ao excluir log");
    }
  };

  const handleClearAllLogs = async () => {
    try {
      let error: any = null;
      
      switch (selectedSource) {
        case "facebook":
          ({ error } = await supabase.from("facebook_webhook_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000"));
          break;
        case "whatsapp":
          ({ error } = await supabase.from("webhook_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000"));
          break;
        case "webhook":
          ({ error } = await supabase.from("form_webhook_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000"));
          break;
        case "meta_pixel":
          ({ error } = await supabase.from("meta_conversion_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000"));
          break;
      }

      if (error) throw error;

      toast.success("Todos os logs foram excluídos");
      setLogs([]);
    } catch (error: any) {
      console.error("Error clearing logs:", error);
      toast.error("Erro ao limpar logs");
    }
  };

  useEffect(() => {
    loadLogs();
  }, [user, selectedSource]);

  useEffect(() => {
    if (!user) return;

    let tableName: string;
    switch (selectedSource) {
      case "facebook":
        tableName = "facebook_webhook_logs";
        break;
      case "whatsapp":
        tableName = "webhook_logs";
        break;
      case "webhook":
        tableName = "form_webhook_logs";
        break;
      case "meta_pixel":
        tableName = "meta_conversion_logs";
        break;
    }

    const channel = supabase
      .channel(`${tableName}_changes_${selectedSource}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: tableName,
        },
        () => {
          loadLogs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, selectedSource]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Sucesso
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive">
            <AlertCircle className="w-3 h-3 mr-1" />
            Erro
          </Badge>
        );
      case "processing":
        return (
          <Badge variant="secondary">
            <Clock className="w-3 h-3 mr-1" />
            Processando
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const renderLogContent = (log: any) => {
    switch (selectedSource) {
      case "facebook":
        return (
          <>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {log.facebook_lead_id && (
                <div>
                  <span className="text-muted-foreground">Lead ID (Facebook):</span>
                  <p className="font-mono text-xs break-all">{log.facebook_lead_id}</p>
                </div>
              )}
              {log.page_id && (
                <div>
                  <span className="text-muted-foreground">Página ID:</span>
                  <p className="font-mono text-xs">{log.page_id}</p>
                </div>
              )}
              {log.form_id && (
                <div>
                  <span className="text-muted-foreground">Formulário ID:</span>
                  <p className="font-mono text-xs">{log.form_id}</p>
                </div>
              )}
              {log.lead_id && (
                <div>
                  <span className="text-muted-foreground">Lead Criado:</span>
                  <p className="font-mono text-xs">{log.lead_id}</p>
                </div>
              )}
            </div>
          </>
        );

      case "whatsapp":
        return (
          <>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Instância:</span>
                <p className="font-mono text-xs">{log.instance_name}</p>
              </div>
              {log.remote_jid && (
                <div>
                  <span className="text-muted-foreground">Telefone:</span>
                  <p className="font-mono text-xs">{log.remote_jid}</p>
                </div>
              )}
              {log.sender_name && (
                <div>
                  <span className="text-muted-foreground">Remetente:</span>
                  <p className="text-xs">{log.sender_name}</p>
                </div>
              )}
              {log.direction && (
                <div>
                  <span className="text-muted-foreground">Direção:</span>
                  <p className="text-xs capitalize">{log.direction}</p>
                </div>
              )}
              {log.message_type && (
                <div>
                  <span className="text-muted-foreground">Tipo:</span>
                  <p className="text-xs">{log.message_type}</p>
                </div>
              )}
            </div>
            {log.message_content && (
              <div className="mt-2 bg-muted/50 border rounded-lg p-3">
                <p className="text-sm font-medium mb-1">Conteúdo da Mensagem:</p>
                <p className="text-sm text-muted-foreground">{log.message_content}</p>
              </div>
            )}
          </>
        );

      case "webhook":
        return (
          <div className="text-sm">
            <div className="grid grid-cols-2 gap-4">
              {log.webhook_token && (
                <div>
                  <span className="text-muted-foreground">Token:</span>
                  <p className="font-mono text-xs truncate">{log.webhook_token}</p>
                </div>
              )}
              {log.lead_id && (
                <div>
                  <span className="text-muted-foreground">Lead Criado:</span>
                  <p className="font-mono text-xs">{log.lead_id}</p>
                </div>
              )}
            </div>
          </div>
        );

      case "meta_pixel":
        return (
          <div className="text-sm space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="font-mono text-xs">
                {log.event_name}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Pixel: {log.pixel_id}
              </span>
            </div>
            {log.events_received && (
              <p className="text-green-600 text-xs">
                {log.events_received} evento(s) recebido(s) pela Meta
              </p>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const config = sourceConfig[selectedSource];
  const IconComponent = config.IconComponent;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${config.bgColor}`}>
            <FileText className={`h-5 w-5 ${config.color}`} />
          </div>
          <div>
            <CardTitle>Logs de Acompanhamento</CardTitle>
            <CardDescription>
              Monitore os webhooks e eventos das suas integrações
            </CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedSource} onValueChange={(v: LogSource) => setSelectedSource(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Selecionar fonte" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="facebook">
                <div className="flex items-center gap-2">
                  <FaFacebook className="h-4 w-4 text-[#1877F2]" />
                  Facebook Leads
                </div>
              </SelectItem>
              <SelectItem value="whatsapp">
                <div className="flex items-center gap-2">
                  <FaWhatsapp className="h-4 w-4 text-[#25D366]" />
                  WhatsApp
                </div>
              </SelectItem>
              <SelectItem value="webhook">
                <div className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-orange-600" />
                  Webhook
                </div>
              </SelectItem>
              <SelectItem value="meta_pixel">
                <div className="flex items-center gap-2">
                  <SiMeta className="h-4 w-4 text-[#0081FB]" />
                  Meta Pixel
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <Button 
            variant="outline"
            size="sm" 
            onClick={loadLogs} 
            disabled={loading}
            className="border-warning text-warning hover:bg-warning/10 hover:text-warning"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAllLogs}
            disabled={loading || logs.length === 0}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Limpar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <div className={`mx-auto mb-4 ${config.color} opacity-50 flex justify-center`}>
              <IconComponent />
            </div>
            <p>Nenhum log de {config.label} encontrado</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="border rounded-lg p-4 bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{log.event_type}</span>
                        {getStatusBadge(log.status)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm:ss", {
                          locale: ptBR,
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                      >
                        {expandedLog === log.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedLogId(log.id);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {expandedLog === log.id && (
                    <div className="mt-3 pt-3 border-t space-y-3">
                      {renderLogContent(log)}

                      {log.error_message && (
                        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                          <p className="text-sm text-destructive font-medium mb-1">
                            Mensagem de Erro:
                          </p>
                          <p className="text-sm text-destructive/90">{log.error_message}</p>
                        </div>
                      )}

                      {(log.payload || log.request_payload) && (
                        <details className="group">
                          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                            Ver payload completo
                          </summary>
                          <pre className="mt-2 p-3 bg-muted rounded-lg text-xs overflow-auto max-h-64">
                            {JSON.stringify(log.payload || log.request_payload, null, 2)}
                          </pre>
                        </details>
                      )}

                      {log.response_payload && (
                        <details className="group">
                          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                            Ver resposta
                          </summary>
                          <pre className="mt-2 p-3 bg-muted rounded-lg text-xs overflow-auto max-h-64">
                            {JSON.stringify(log.response_payload, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Log</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este log? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteLog}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
