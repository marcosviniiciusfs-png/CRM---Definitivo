import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RefreshCw, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { LoadingAnimation } from './LoadingAnimation';
import { Json } from '@/integrations/supabase/types';

interface MetaConversionLog {
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

interface Lead {
  id: string;
  nome_lead: string;
}

interface Funnel {
  id: string;
  name: string;
}

export default function MetaConversionLogs() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<MetaConversionLog[]>([]);
  const [leads, setLeads] = useState<Record<string, Lead>>({});
  const [funnels, setFunnels] = useState<Record<string, Funnel>>({});
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const loadLogs = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Get organization ID
      const { data: memberData } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!memberData) return;

      // Fetch logs
      const { data: logsData, error } = await supabase
        .from('meta_conversion_logs')
        .select('*')
        .eq('organization_id', memberData.organization_id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setLogs((logsData || []) as MetaConversionLog[]);

      // Fetch related leads and funnels
      const leadIds = [...new Set(logsData?.filter(l => l.lead_id).map(l => l.lead_id) || [])] as string[];
      const funnelIds = [...new Set(logsData?.filter(l => l.funnel_id).map(l => l.funnel_id) || [])] as string[];

      if (leadIds.length > 0) {
        const { data: leadsData } = await supabase
          .from('leads')
          .select('id, nome_lead')
          .in('id', leadIds);
        
        const leadsMap: Record<string, Lead> = {};
        leadsData?.forEach(l => { leadsMap[l.id] = l; });
        setLeads(leadsMap);
      }

      if (funnelIds.length > 0) {
        const { data: funnelsData } = await supabase
          .from('sales_funnels')
          .select('id, name')
          .in('id', funnelIds);
        
        const funnelsMap: Record<string, Funnel> = {};
        funnelsData?.forEach(f => { funnelsMap[f.id] = f; });
        setFunnels(funnelsMap);
      }
    } catch (error) {
      console.error('Error loading Meta conversion logs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [user]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <Badge className="bg-green-500/20 text-green-600 border-green-500/30">
            <CheckCircle className="w-3 h-3 mr-1" />
            Sucesso
          </Badge>
        );
      case 'error':
        return (
          <Badge className="bg-destructive/20 text-destructive border-destructive/30">
            <XCircle className="w-3 h-3 mr-1" />
            Erro
          </Badge>
        );
      default:
        return (
          <Badge className="bg-yellow-500/20 text-yellow-600 border-yellow-500/30">
            <Clock className="w-3 h-3 mr-1" />
            Pendente
          </Badge>
        );
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Logs de Conversão Meta</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <LoadingAnimation className="min-h-[100px]" text="" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Logs de Conversão Meta</CardTitle>
        <Button variant="outline" size="sm" onClick={loadLogs}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            Nenhum evento de conversão registrado ainda.
          </p>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="border rounded-lg p-3 bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getStatusBadge(log.status)}
                        <Badge variant="outline" className="font-mono text-xs">
                          {log.event_name}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Pixel: {log.pixel_id}
                        </span>
                      </div>
                      
                      <div className="mt-2 text-sm space-y-1">
                        {log.lead_id && leads[log.lead_id] && (
                          <p className="text-muted-foreground">
                            Lead: <span className="text-foreground">{leads[log.lead_id].nome_lead}</span>
                          </p>
                        )}
                        {log.funnel_id && funnels[log.funnel_id] && (
                          <p className="text-muted-foreground">
                            Funil: <span className="text-foreground">{funnels[log.funnel_id].name}</span>
                          </p>
                        )}
                        {log.status === 'success' && log.events_received && (
                          <p className="text-green-600">
                            {log.events_received} evento(s) recebido(s) pela Meta
                          </p>
                        )}
                        {log.status === 'error' && log.error_message && (
                          <p className="text-destructive text-xs">
                            {log.error_message}
                          </p>
                        )}
                      </div>
                      
                      <p className="text-xs text-muted-foreground mt-2">
                        {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                      </p>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                    >
                      {expandedLog === log.id ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  
                  {expandedLog === log.id && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      {log.request_payload && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Request:</p>
                          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                            {JSON.stringify(log.request_payload, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.response_payload && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Response:</p>
                          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                            {JSON.stringify(log.response_payload, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
