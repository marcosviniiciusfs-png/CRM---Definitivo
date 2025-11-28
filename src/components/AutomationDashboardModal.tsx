import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, subHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Activity, CheckCircle2, XCircle, AlertCircle, Eye } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface AutomationDashboardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AutomationLog {
  id: string;
  created_at: string;
  rule_id: string;
  lead_id: string | null;
  status: string;
  conditions_met: boolean;
  actions_executed: any;
  trigger_data: any;
  error_message: string | null;
  rule_name?: string;
  lead_name?: string;
}

interface Metrics {
  total: number;
  success: number;
  error: number;
  conditionsNotMet: number;
}

type PeriodFilter = "24h" | "7d" | "30d";

export function AutomationDashboardModal({ open, onOpenChange }: AutomationDashboardModalProps) {
  const [period, setPeriod] = useState<PeriodFilter>("24h");
  const [selectedRule, setSelectedRule] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedLog, setSelectedLog] = useState<AutomationLog | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const getDateFromPeriod = (period: PeriodFilter) => {
    switch (period) {
      case "24h":
        return subHours(new Date(), 24);
      case "7d":
        return subDays(new Date(), 7);
      case "30d":
        return subDays(new Date(), 30);
      default:
        return subHours(new Date(), 24);
    }
  };

  // Buscar logs com joins
  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ["automation-logs", period, selectedRule, selectedStatus],
    queryFn: async () => {
      const startDate = getDateFromPeriod(period);
      
      let query = supabase
        .from("automation_logs")
        .select(`
          *,
          automation_rules!inner(name),
          leads(nome_lead)
        `)
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: false })
        .limit(100);

      if (selectedRule !== "all") {
        query = query.eq("rule_id", selectedRule);
      }

      if (selectedStatus !== "all") {
        query = query.eq("status", selectedStatus);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map((log: any) => ({
        ...log,
        rule_name: log.automation_rules?.name || "Regra excluída",
        lead_name: log.leads?.nome_lead || "Lead não encontrado",
      })) as AutomationLog[];
    },
    enabled: open,
  });

  // Buscar regras para filtro
  const { data: rules } = useQuery({
    queryKey: ["automation-rules-filter"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_rules")
        .select("id, name")
        .order("name");

      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Calcular métricas
  const metrics: Metrics = {
    total: logs?.length || 0,
    success: logs?.filter((l) => l.status === "success").length || 0,
    error: logs?.filter((l) => l.status === "error" || l.status === "partial_failure").length || 0,
    conditionsNotMet: logs?.filter((l) => !l.conditions_met).length || 0,
  };

  const successRate = metrics.total > 0 ? (metrics.success / metrics.total) * 100 : 0;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <Badge className="bg-success text-success-foreground">Sucesso</Badge>;
      case "error":
        return <Badge className="bg-destructive text-destructive-foreground">Erro</Badge>;
      case "partial_failure":
        return <Badge className="bg-warning text-warning-foreground">Parcial</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const handleViewDetails = (log: AutomationLog) => {
    setSelectedLog(log);
    setDetailsOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Dashboard de Automações</DialogTitle>
          </DialogHeader>

          {/* Cards de Métricas */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total de Execuções</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.total}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Taxa de Sucesso</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-success" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-success">{successRate.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics.success} de {metrics.total}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Falhas</CardTitle>
                <XCircle className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">{metrics.error}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Condições Não Atendidas</CardTitle>
                <AlertCircle className="h-4 w-4 text-warning" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-warning">{metrics.conditionsNotMet}</div>
              </CardContent>
            </Card>
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[150px]">
              <Select value={period} onValueChange={(value) => setPeriod(value as PeriodFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">Últimas 24 horas</SelectItem>
                  <SelectItem value="7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[150px]">
              <Select value={selectedRule} onValueChange={setSelectedRule}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas as regras" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as regras</SelectItem>
                  {rules?.map((rule) => (
                    <SelectItem key={rule.id} value={rule.id}>
                      {rule.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 min-w-[150px]">
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="success">Sucesso</SelectItem>
                  <SelectItem value="error">Erro</SelectItem>
                  <SelectItem value="partial_failure">Parcial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tabela de Execuções */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Regra</TableHead>
                  <TableHead>Lead</TableHead>
                  <TableHead>Condições</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logsLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : logs && logs.length > 0 ? (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{log.rule_name}</TableCell>
                      <TableCell className="max-w-[150px] truncate">{log.lead_name}</TableCell>
                      <TableCell>
                        {log.conditions_met ? (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(log.status)}</TableCell>
                      <TableCell>
                        {Array.isArray(log.actions_executed) ? log.actions_executed.length : 0}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetails(log)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum log encontrado para os filtros selecionados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sheet de Detalhes - z-index maior para aparecer sobre o Dialog */}
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto !z-[100]" style={{ zIndex: 100 }}>
          <SheetHeader>
            <SheetTitle>Detalhes da Execução</SheetTitle>
            <SheetDescription>
              Informações completas sobre a execução da regra de automação
            </SheetDescription>
          </SheetHeader>

          {selectedLog && (
            <div className="mt-6 space-y-6">
              {/* Informações Gerais */}
              <div className="space-y-2">
                <h3 className="font-semibold text-lg">Informações Gerais</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Data/Hora:</span>
                    <p className="font-medium">
                      {format(new Date(selectedLog.created_at), "dd/MM/yyyy HH:mm:ss", {
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Regra:</span>
                    <p className="font-medium">{selectedLog.rule_name}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Lead:</span>
                    <p className="font-medium">{selectedLog.lead_name}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>
                    <div className="mt-1">{getStatusBadge(selectedLog.status)}</div>
                  </div>
                </div>
              </div>

              {/* Dados do Gatilho */}
              {selectedLog.trigger_data && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">Dados do Gatilho</h3>
                  <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
                    {JSON.stringify(selectedLog.trigger_data, null, 2)}
                  </pre>
                </div>
              )}

              {/* Ações Executadas */}
              {selectedLog.actions_executed && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">
                    Ações Executadas (
                    {Array.isArray(selectedLog.actions_executed)
                      ? selectedLog.actions_executed.length
                      : 0}
                    )
                  </h3>
                  <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
                    {JSON.stringify(selectedLog.actions_executed, null, 2)}
                  </pre>
                </div>
              )}

              {/* Erro */}
              {selectedLog.error_message && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg text-destructive">Mensagem de Erro</h3>
                  <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-lg">
                    <p className="text-sm text-destructive">{selectedLog.error_message}</p>
                  </div>
                </div>
              )}

              {/* Condições */}
              <div className="space-y-2">
                <h3 className="font-semibold text-lg">Condições</h3>
                <div className="flex items-center gap-2">
                  {selectedLog.conditions_met ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-success" />
                      <span className="text-sm text-success">Condições atendidas</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Condições não atendidas</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
