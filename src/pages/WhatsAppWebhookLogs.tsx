import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, RefreshCw, AlertCircle, CheckCircle2, Clock, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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
import { Skeleton } from "@/components/ui/skeleton";

interface WhatsAppWebhookLog {
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

export default function WhatsAppWebhookLogs() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<WhatsAppWebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<string | null>(null);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("webhook_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs(data || []);
    } catch (error: any) {
      console.error("Error loading logs:", error);
      toast.error("Erro ao carregar logs");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLog = async () => {
    if (!selectedLog) return;

    try {
      const { error } = await supabase
        .from("webhook_logs")
        .delete()
        .eq("id", selectedLog);

      if (error) throw error;

      toast.success("Log excluído com sucesso");
      setLogs(logs.filter((log) => log.id !== selectedLog));
      setDeleteDialogOpen(false);
      setSelectedLog(null);
    } catch (error: any) {
      console.error("Error deleting log:", error);
      toast.error("Erro ao excluir log");
    }
  };

  const handleClearAllLogs = async () => {
    try {
      const { error } = await supabase
        .from("webhook_logs")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");

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

    // Subscribe to real-time updates
    const channel = supabase
      .channel("webhook_logs")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "webhook_logs",
        },
        () => {
          loadLogs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Button
              variant="ghost"
              onClick={() => navigate(-1)}
              className="mb-2 -ml-2"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
            <h1 className="text-3xl font-bold">Logs do Webhook WhatsApp</h1>
            <p className="text-muted-foreground mt-2">
              Monitore e diagnostique o recebimento de mensagens do WhatsApp
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadLogs}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar
            </Button>
            <Button variant="destructive" onClick={handleClearAllLogs}>
              <Trash2 className="w-4 h-4 mr-2" />
              Limpar Todos
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <p className="text-muted-foreground">Nenhum log encontrado</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {logs.map((log) => (
              <Card key={log.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">
                          {log.event_type}
                        </CardTitle>
                        {getStatusBadge(log.status)}
                      </div>
                      <CardDescription>
                        {format(new Date(log.created_at), "PPpp", {
                          locale: ptBR,
                        })}
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedLog(log.id);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">
                        Instância:
                      </span>
                      <p className="font-mono text-xs">{log.instance_name}</p>
                    </div>
                    {log.remote_jid && (
                      <div>
                        <span className="text-muted-foreground">
                          Telefone:
                        </span>
                        <p className="font-mono text-xs">{log.remote_jid}</p>
                      </div>
                    )}
                    {log.sender_name && (
                      <div>
                        <span className="text-muted-foreground">
                          Remetente:
                        </span>
                        <p className="text-xs">{log.sender_name}</p>
                      </div>
                    )}
                    {log.direction && (
                      <div>
                        <span className="text-muted-foreground">
                          Direção:
                        </span>
                        <p className="text-xs capitalize">{log.direction}</p>
                      </div>
                    )}
                    {log.message_type && (
                      <div>
                        <span className="text-muted-foreground">
                          Tipo:
                        </span>
                        <p className="text-xs">{log.message_type}</p>
                      </div>
                    )}
                  </div>

                  {log.message_content && (
                    <div className="bg-muted/50 border rounded-lg p-3">
                      <p className="text-sm font-medium mb-1">
                        Conteúdo da Mensagem:
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {log.message_content}
                      </p>
                    </div>
                  )}

                  {log.error_message && (
                    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                      <p className="text-sm text-destructive font-medium mb-1">
                        Mensagem de Erro:
                      </p>
                      <p className="text-sm text-destructive/90">
                        {log.error_message}
                      </p>
                    </div>
                  )}

                  {log.payload && (
                    <details className="group">
                      <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                        Ver payload completo
                      </summary>
                      <pre className="mt-2 p-3 bg-muted rounded-lg text-xs overflow-auto max-h-64">
                        {JSON.stringify(log.payload, null, 2)}
                      </pre>
                    </details>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Log</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este log? Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteLog}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
