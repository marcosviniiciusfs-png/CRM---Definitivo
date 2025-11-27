import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Trash2, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface FormWebhookLog {
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

export function FormWebhookLogs() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [logs, setLogs] = useState<FormWebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const logsPerPage = 10;

  const loadLogs = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      // Get total count
      const { count } = await supabase
        .from('form_webhook_logs')
        .select('*', { count: 'exact', head: true });
      
      setTotalCount(count || 0);

      // Get paginated logs
      const { data, error } = await supabase
        .from('form_webhook_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .range((currentPage - 1) * logsPerPage, currentPage * logsPerPage - 1);

      if (error) throw error;
      setLogs(data || []);
    } catch (error: any) {
      console.error('Error loading webhook logs:', error);
      toast({
        title: "Erro ao carregar logs",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const clearLogs = async () => {
    if (!user) return;
    if (!confirm('Tem certeza que deseja limpar todos os logs?')) return;

    try {
      const { error } = await supabase
        .from('form_webhook_logs')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (error) throw error;

      toast({
        title: "Logs limpos",
        description: "Todos os logs foram removidos com sucesso.",
      });
      
      loadLogs();
    } catch (error: any) {
      console.error('Error clearing logs:', error);
      toast({
        title: "Erro ao limpar logs",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    loadLogs();
  }, [currentPage, user]);

  useEffect(() => {
    if (!user) return;

    // Subscribe to new logs
    const channel = supabase
      .channel('form_webhook_logs_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'form_webhook_logs',
        },
        () => {
          if (currentPage === 1) {
            loadLogs();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, currentPage]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-500">Sucesso</Badge>;
      case 'error':
        return <Badge variant="destructive">Erro</Badge>;
      default:
        return <Badge variant="secondary">Processando</Badge>;
    }
  };

  const totalPages = Math.ceil(totalCount / logsPerPage);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>Logs do Webhook</CardTitle>
          <CardDescription>
            Histórico de requisições recebidas no webhook de formulários
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadLogs}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={clearLogs}
            disabled={loading || logs.length === 0}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Limpar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Carregando logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum log encontrado
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="border rounded-lg p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(log.status)}
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    {log.lead_id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(`/leads/${log.lead_id}`, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Ver Lead
                      </Button>
                    )}
                  </div>

                  {log.error_message && (
                    <div className="text-sm text-red-500">
                      <strong>Erro:</strong> {log.error_message}
                    </div>
                  )}

                  <div className="text-sm">
                    <strong>Dados recebidos:</strong>
                    <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto">
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Próxima
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
