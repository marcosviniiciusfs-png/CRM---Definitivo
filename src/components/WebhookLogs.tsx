import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Trash2, AlertCircle, CheckCircle2, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface WebhookLog {
  id: string;
  instance_name: string;
  event_type: string;
  remote_jid: string | null;
  sender_name: string | null;
  message_content: string | null;
  message_type: string | null;
  direction: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}

export function WebhookLogs() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const logsPerPage = 20;

  const loadLogs = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Buscar total de logs
      const { count, error: countError } = await supabase
        .from('webhook_logs')
        .select('*', { count: 'exact', head: true });

      if (countError) throw countError;
      setTotalLogs(count || 0);

      // Buscar logs da página atual
      const from = (currentPage - 1) * logsPerPage;
      const to = from + logsPerPage - 1;

      const { data, error } = await supabase
        .from('webhook_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      setLogs(data || []);
    } catch (error: any) {
      console.error('Erro ao carregar logs:', error);
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
    
    try {
      const { error } = await supabase
        .from('webhook_logs')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (error) throw error;
      
      toast({
        title: "Logs limpos",
        description: "Todos os logs foram removidos com sucesso.",
      });
      
      setLogs([]);
    } catch (error: any) {
      console.error('Erro ao limpar logs:', error);
      toast({
        title: "Erro ao limpar logs",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    loadLogs();
  }, [user, currentPage]);

  useEffect(() => {
    if (!user) return;

    // Realtime subscription - quando novo log chegar, recarregar apenas se estiver na primeira página
    const channel = supabase
      .channel('webhook_logs_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'webhook_logs',
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
        return <Badge className="bg-green-500"><CheckCircle2 className="w-3 h-3 mr-1" />Sucesso</Badge>;
      case 'error':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Erro</Badge>;
      case 'ignored':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Ignorado</Badge>;
      case 'processing':
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Processando</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Logs de Webhook</CardTitle>
            <CardDescription>
              Histórico de mensagens recebidas e seu status de processamento
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadLogs}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={clearLogs}
              disabled={loading || logs.length === 0}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Limpar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {logs.length === 0 && !loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum log de webhook encontrado
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Mostrando {((currentPage - 1) * logsPerPage) + 1} - {Math.min(currentPage * logsPerPage, totalLogs)} de {totalLogs} logs
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1 || loading}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Anterior
                </Button>
                <span className="px-3 py-1 bg-muted rounded">
                  {currentPage} / {Math.ceil(totalLogs / logsPerPage) || 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => prev + 1)}
                  disabled={currentPage >= Math.ceil(totalLogs / logsPerPage) || loading}
                >
                  Próxima
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
            <ScrollArea className="h-[500px]">
              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Instância</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs">
                      {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {log.instance_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {log.event_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {log.sender_name && (
                          <span className="text-sm font-medium">{log.sender_name}</span>
                        )}
                        {log.remote_jid && (
                          <span className="text-xs text-muted-foreground font-mono">
                            {log.remote_jid.replace('@s.whatsapp.net', '')}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[300px]">
                      <div className="flex flex-col gap-1">
                        {log.message_content && (
                          <span className="text-sm truncate">{log.message_content}</span>
                        )}
                        {log.message_type && (
                          <Badge variant="secondary" className="text-xs w-fit">
                            {log.message_type}
                          </Badge>
                        )}
                      </div>
                      {log.error_message && (
                        <div className="mt-2 text-xs text-destructive">
                          <AlertCircle className="w-3 h-3 inline mr-1" />
                          {log.error_message}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(log.status)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
          </>
        )}
      </CardContent>
    </Card>
  );
}
