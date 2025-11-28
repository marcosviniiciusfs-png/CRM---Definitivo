import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowRight, History } from "lucide-react";

interface DistributionRecord {
  id: string;
  lead_id: string;
  from_user_id: string | null;
  to_user_id: string;
  distribution_method: string;
  trigger_source: string;
  is_redistribution: boolean;
  redistribution_reason: string | null;
  created_at: string;
  leads: {
    nome_lead: string;
    telefone_lead: string;
  } | null;
  to_user_full_name: string | null;
  from_user_full_name: string | null;
}

export function DistributionHistory() {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<DistributionRecord[]>([]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!member) return;

      const { data, error } = await supabase
        .from('lead_distribution_history')
        .select(`
          *,
          leads (nome_lead, telefone_lead)
        `)
        .eq('organization_id', member.organization_id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      // Buscar nomes dos usuários separadamente
      const enrichedData = await Promise.all((data || []).map(async (record) => {
        const toProfile = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', record.to_user_id)
          .single();
        
        let fromProfile = null;
        if (record.from_user_id) {
          fromProfile = await supabase
            .from('profiles')
            .select('full_name')
            .eq('user_id', record.from_user_id)
            .single();
        }

        return {
          ...record,
          to_user_full_name: toProfile.data?.full_name || null,
          from_user_full_name: fromProfile?.data?.full_name || null,
        };
      }));

      setHistory(enrichedData);
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      round_robin: 'Round-robin',
      weighted: 'Ponderado',
      load_based: 'Baseado em Carga',
      random: 'Aleatório',
    };
    return labels[method] || method;
  };

  const getTriggerLabel = (trigger: string) => {
    const labels: Record<string, string> = {
      new_lead: 'Lead Novo',
      whatsapp: 'WhatsApp',
      facebook: 'Facebook',
      webhook: 'Webhook',
      manual: 'Manual',
      auto_redistribution: 'Redistribuição Automática',
    };
    return labels[trigger] || trigger;
  };

  if (loading) {
    return <div className="text-center py-8">Carregando histórico...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Histórico de Distribuições
        </CardTitle>
        <CardDescription>
          Visualize todas as distribuições de leads realizadas pela roleta
        </CardDescription>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma distribuição realizada ainda
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>De</TableHead>
                  <TableHead></TableHead>
                  <TableHead>Para</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Tipo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(record.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{record.leads?.nome_lead || 'Lead removido'}</div>
                        <div className="text-sm text-muted-foreground">{record.leads?.telefone_lead || '-'}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {record.from_user_full_name || (record.is_redistribution ? '-' : 'Sistema')}
                    </TableCell>
                    <TableCell>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                    <TableCell className="font-medium">
                      {record.to_user_full_name || 'Desconhecido'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{getMethodLabel(record.distribution_method)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{getTriggerLabel(record.trigger_source)}</Badge>
                    </TableCell>
                    <TableCell>
                      {record.is_redistribution ? (
                        <Badge variant="destructive">Redistribuição</Badge>
                      ) : (
                        <Badge>Inicial</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}