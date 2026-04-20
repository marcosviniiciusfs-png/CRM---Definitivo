import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoadingAnimation } from "./LoadingAnimation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ProductionMetricCards } from "./ProductionMetricCards";
import { ProductionSalesTable } from "./ProductionSalesTable";
import { ProductionFinancialSummary } from "./ProductionFinancialSummary";

export interface ProductionBlock {
  id: string;
  month: number;
  year: number;
  total_sales: number;
  total_revenue: number;
  total_cost: number;
  total_profit: number;
  previous_month_profit: number | null;
  profit_change_value: number | null;
  profit_change_percentage: number | null;
  is_closed: boolean;
  start_date: string | null;
  end_date: string | null;
  auto_recurring: boolean;
  recurrence_day: number | null;
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const calculateMetrics = async (organizationId: string, startDate: Date, endDate: Date) => {
  const { data: leads } = await supabase
    .from("leads")
    .select("id, valor, funnel_stage_id, funnel_stages(stage_type)")
    .eq("organization_id", organizationId)
    .gte("data_conclusao", startDate.toISOString())
    .lte("data_conclusao", endDate.toISOString());

  const wonLeads = leads?.filter(l => (l.funnel_stages as any)?.stage_type === 'won') || [];
  const totalRevenue = wonLeads.reduce((sum, lead) => sum + (lead.valor || 0), 0);
  const leadIds = wonLeads.map(l => l.id);

  let totalCost = 0;
  if (leadIds.length > 0) {
    const { data: leadItems } = await supabase
      .from("lead_items")
      .select("quantity, unit_price, items(cost_price)")
      .in("lead_id", leadIds);

    totalCost = leadItems?.reduce((sum, item) => {
      const costPrice = (item.items as any)?.cost_price || 0;
      return sum + (item.quantity * costPrice);
    }, 0) || 0;
  }

  return {
    totalSales: wonLeads.length,
    totalRevenue,
    totalCost,
    profit: totalRevenue - totalCost,
  };
};

const ensureCurrentMonthBlock = async (organizationId: string, month: number, year: number) => {
  try {
    const { data: existing, error: selectError } = await supabase
      .from("production_blocks")
      .select("id, start_date, end_date")
      .eq("organization_id", organizationId)
      .eq("month", month)
      .eq("year", year)
      .maybeSingle();

    if (selectError) {
      console.warn("[Production] Could not check existing block:", selectError.message);
      return;
    }

    const blockStartDate = new Date(year, month - 1, 1);
    const blockEndDate = new Date(year, month, 0, 23, 59, 59);

    if (existing) {
      const metrics = await calculateMetrics(organizationId, blockStartDate, blockEndDate);

      const { data: expenses } = await supabase
        .from("production_expenses")
        .select("amount")
        .eq("organization_id", organizationId)
        .eq("production_block_id", existing.id);

      const totalExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;
      const realProfit = metrics.totalRevenue - metrics.totalCost - totalExpenses;

      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;

      const { data: previousBlock } = await supabase
        .from("production_blocks")
        .select("total_profit")
        .eq("organization_id", organizationId)
        .eq("month", prevMonth)
        .eq("year", prevYear)
        .maybeSingle();

      const previousProfit = previousBlock?.total_profit || 0;
      const profitChange = realProfit - previousProfit;
      const profitChangePercentage = previousProfit > 0 ? (profitChange / previousProfit) * 100 : 0;

      const updatePayload: any = {
        total_sales: metrics.totalSales,
        total_revenue: metrics.totalRevenue,
        total_cost: metrics.totalCost,
        total_profit: realProfit,
        previous_month_profit: previousProfit,
        profit_change_value: profitChange,
        profit_change_percentage: profitChangePercentage,
      };

      if (!existing.start_date) {
        updatePayload.start_date = blockStartDate.toISOString().split('T')[0];
      }
      if (!existing.end_date) {
        updatePayload.end_date = new Date(year, month, 0).toISOString().split('T')[0];
      }

      await supabase
        .from("production_blocks")
        .update(updatePayload)
        .eq("organization_id", organizationId)
        .eq("month", month)
        .eq("year", year);
      return;
    }

    const metrics = await calculateMetrics(organizationId, blockStartDate, blockEndDate);
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;

    const { data: previousBlock } = await supabase
      .from("production_blocks")
      .select("total_profit")
      .eq("organization_id", organizationId)
      .eq("month", prevMonth)
      .eq("year", prevYear)
      .maybeSingle();

    const previousProfit = previousBlock?.total_profit || 0;
    const profitChange = metrics.profit - previousProfit;
    const profitChangePercentage = previousProfit > 0 ? (profitChange / previousProfit) * 100 : 0;

    const { error: insertError } = await supabase.from("production_blocks").insert({
      organization_id: organizationId,
      month,
      year,
      start_date: blockStartDate.toISOString().split('T')[0],
      end_date: new Date(year, month, 0).toISOString().split('T')[0],
      total_sales: metrics.totalSales,
      total_revenue: metrics.totalRevenue,
      total_cost: metrics.totalCost,
      total_profit: metrics.profit,
      previous_month_profit: previousProfit,
      profit_change_value: profitChange,
      profit_change_percentage: profitChangePercentage,
    });

    if (insertError) {
      console.warn("[Production] Could not auto-create block (RLS policy may be missing):", insertError.message);
    }
  } catch (error: any) {
    console.warn("[Production] ensureCurrentMonthBlock error:", error?.message ?? error);
  }
};

const fetchProductionBlocks = async (organizationId: string): Promise<ProductionBlock[]> => {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

  await ensureCurrentMonthBlock(organizationId, currentMonth, currentYear);

  const { data, error } = await supabase
    .from("production_blocks")
    .select("*")
    .eq("organization_id", organizationId)
    .order("year", { ascending: false })
    .order("month", { ascending: false });

  if (error) {
    console.warn("[Production] Could not fetch blocks:", error.message);
    return [];
  }
  return (data || []) as ProductionBlock[];
};

export function ProductionDashboard() {
  const { organizationId, isReady } = useOrganizationReady();
  const { permissions } = useOrganization();
  const isAdmin = !permissions.loading && (permissions.role === 'owner' || permissions.role === 'admin');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());

  const [isNewBlockOpen, setIsNewBlockOpen] = useState(false);
  const defaultStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString().split('T')[0];
  const defaultEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toISOString().split('T')[0];
  const [newBlockStart, setNewBlockStart] = useState(defaultStart);
  const [newBlockEnd, setNewBlockEnd] = useState(defaultEnd);
  const [newBlockAutoRecurring, setNewBlockAutoRecurring] = useState(false);
  const [newBlockRecurrenceDay, setNewBlockRecurrenceDay] = useState('1');
  const [creatingBlock, setCreatingBlock] = useState(false);

  const { data: blocks = [], isLoading } = useQuery({
    queryKey: ['production-blocks', organizationId],
    queryFn: () => fetchProductionBlocks(organizationId!),
    enabled: isReady && !!organizationId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase
      .channel('production-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leads' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['production-blocks', organizationId] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'production_expenses' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['production-blocks', organizationId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationId, queryClient]);

  const selectedBlock = blocks.find(b => b.month === selectedMonth && b.year === selectedYear) || null;

  const blockStartDate = new Date(selectedYear, selectedMonth - 1, 1);
  const blockEndDate = new Date(selectedYear, selectedMonth, 0, 23, 59, 59);

  const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
  const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
  const previousBlock = blocks.find(b => b.month === prevMonth && b.year === prevYear) || null;

  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

  const metricCards = selectedBlock ? {
    sales: {
      value: String(selectedBlock.total_sales),
      change: previousBlock && previousBlock.total_sales > 0
        ? ((selectedBlock.total_sales - previousBlock.total_sales) / previousBlock.total_sales) * 100
        : null,
    },
    revenue: {
      value: fmt(selectedBlock.total_revenue),
      change: previousBlock && previousBlock.total_revenue > 0
        ? ((selectedBlock.total_revenue - previousBlock.total_revenue) / previousBlock.total_revenue) * 100
        : null,
    },
    profit: {
      value: fmt(selectedBlock.total_profit),
      change: selectedBlock.profit_change_percentage,
    },
    ticket: {
      value: selectedBlock.total_sales > 0 ? fmt(selectedBlock.total_revenue / selectedBlock.total_sales) : fmt(0),
      change: previousBlock && previousBlock.total_sales > 0
        ? ((selectedBlock.total_revenue / selectedBlock.total_sales) - (previousBlock.total_revenue / previousBlock.total_sales)) / (previousBlock.total_revenue / previousBlock.total_sales) * 100
        : null,
    },
  } : {
    sales: { value: "0", change: null },
    revenue: { value: fmt(0), change: null },
    profit: { value: fmt(0), change: null },
    ticket: { value: fmt(0), change: null },
  };

  const monthOptions = (() => {
    const options: { month: number; year: number; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push({
        month: d.getMonth() + 1,
        year: d.getFullYear(),
        label: format(d, "MMMM yyyy", { locale: ptBR }),
      });
    }
    blocks.forEach(b => {
      if (!options.find(o => o.month === b.month && o.year === b.year)) {
        options.push({
          month: b.month,
          year: b.year,
          label: format(new Date(b.year, b.month - 1), "MMMM yyyy", { locale: ptBR }),
        });
      }
    });
    options.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
    return options;
  })();

  const handleCreateBlock = async () => {
    if (!organizationId) return;
    if (!newBlockStart || !newBlockEnd) {
      toast({ title: "Selecione as datas de início e fim", variant: "destructive" });
      return;
    }
    const startDate = new Date(newBlockStart + 'T00:00:00');
    const endDate = new Date(newBlockEnd + 'T23:59:59');
    if (endDate <= startDate) {
      toast({ title: "A data de término deve ser após a data de início", variant: "destructive" });
      return;
    }
    const month = startDate.getMonth() + 1;
    const year = startDate.getFullYear();
    const existing = blocks.find(b => b.month === month && b.year === year);
    if (existing) {
      toast({ title: "Bloco já existe", description: `Já existe um bloco para este período`, variant: "destructive" });
      return;
    }
    setCreatingBlock(true);
    try {
      const metrics = await calculateMetrics(organizationId, startDate, endDate);
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      const { data: previousBlock } = await supabase
        .from("production_blocks")
        .select("total_profit")
        .eq("organization_id", organizationId)
        .eq("month", prevMonth)
        .eq("year", prevYear)
        .maybeSingle();
      const previousProfit = previousBlock?.total_profit || 0;
      const profitChange = metrics.profit - previousProfit;
      const profitChangePercentage = previousProfit > 0 ? (profitChange / previousProfit) * 100 : 0;
      const { error } = await supabase.from("production_blocks").insert({
        organization_id: organizationId,
        month,
        year,
        start_date: newBlockStart,
        end_date: newBlockEnd,
        auto_recurring: newBlockAutoRecurring,
        recurrence_day: newBlockAutoRecurring ? parseInt(newBlockRecurrenceDay) : null,
        total_sales: metrics.totalSales,
        total_revenue: metrics.totalRevenue,
        total_cost: metrics.totalCost,
        total_profit: metrics.profit,
        previous_month_profit: previousProfit,
        profit_change_value: profitChange,
        profit_change_percentage: profitChangePercentage,
      });
      if (error) throw error;
      toast({ title: "Bloco criado com sucesso" });
      setIsNewBlockOpen(false);
      setNewBlockStart(defaultStart);
      setNewBlockEnd(defaultEnd);
      setNewBlockAutoRecurring(false);
      setNewBlockRecurrenceDay('1');
      queryClient.invalidateQueries({ queryKey: ['production-blocks', organizationId] });
    } catch (error: any) {
      toast({ title: "Erro ao criar bloco", description: error.message, variant: "destructive" });
    } finally {
      setCreatingBlock(false);
    }
  };

  if (!isReady || isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingAnimation />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">Produção</h2>
          <p className="text-sm text-muted-foreground">Acompanhe suas métricas de produção</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              onClick={() => {
                const hasCurrentBlock = blocks.some(
                  (b) => b.month === currentMonth && b.year === currentYear
                );
                let startD: Date;
                if (hasCurrentBlock) {
                  startD = new Date(currentYear, currentMonth, 1);
                } else {
                  startD = new Date(currentYear, currentMonth - 1, 1);
                }
                const endD = new Date(startD.getFullYear(), startD.getMonth() + 1, 0);
                setNewBlockStart(startD.toISOString().split('T')[0]);
                setNewBlockEnd(endD.toISOString().split('T')[0]);
                setNewBlockAutoRecurring(false);
                setNewBlockRecurrenceDay('1');
                setIsNewBlockOpen(true);
              }}
              size="sm"
              className="bg-[#6c5ce7] hover:bg-[#5a4bd6] text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nova Produção
            </Button>
          )}
          <Select
            value={`${selectedYear}-${String(selectedMonth).padStart(2, '0')}`}
            onValueChange={(val) => {
              const [y, m] = val.split('-').map(Number);
              setSelectedYear(y);
              setSelectedMonth(m);
            }}
          >
            <SelectTrigger className="w-[160px] h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((opt) => (
                <SelectItem key={`${opt.year}-${opt.month}`} value={`${opt.year}-${String(opt.month).padStart(2, '0')}`}>
                  <span className="capitalize">{opt.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Metric Cards */}
      <ProductionMetricCards
        sales={{ label: "Vendas Fechadas", ...metricCards.sales }}
        revenue={{ label: "Faturamento", ...metricCards.revenue }}
        profit={{ label: "Lucro Líquido", ...metricCards.profit }}
        ticket={{ label: "Ticket Médio", ...metricCards.ticket }}
      />

      {/* Sales Table */}
      {organizationId && (
        <ProductionSalesTable
          organizationId={organizationId}
          startDate={blockStartDate}
          endDate={blockEndDate}
        />
      )}

      {/* Financial Summary */}
      {selectedBlock && organizationId && (
        <ProductionFinancialSummary
          organizationId={organizationId}
          blockId={selectedBlock.id}
          startDate={blockStartDate}
          endDate={blockEndDate}
          totalRevenue={selectedBlock.total_revenue}
          totalCost={selectedBlock.total_cost}
        />
      )}

      {/* Empty state */}
      {!selectedBlock && !isLoading && (
        <div className="text-center py-12 bg-card rounded-lg border border-dashed">
          <p className="text-muted-foreground mb-3">
            Nenhuma produção encontrada para {format(new Date(selectedYear, selectedMonth - 1), "MMMM yyyy", { locale: ptBR })}
          </p>
          {isAdmin && (
            <Button
              onClick={() => {
                const startD = new Date(selectedYear, selectedMonth - 1, 1);
                const endD = new Date(selectedYear, selectedMonth, 0);
                setNewBlockStart(startD.toISOString().split('T')[0]);
                setNewBlockEnd(endD.toISOString().split('T')[0]);
                setNewBlockAutoRecurring(false);
                setNewBlockRecurrenceDay('1');
                setIsNewBlockOpen(true);
              }}
              size="sm"
              className="bg-[#6c5ce7] hover:bg-[#5a4bd6] text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Criar Produção
            </Button>
          )}
        </div>
      )}

      {/* New Block Dialog */}
      <Dialog open={isNewBlockOpen} onOpenChange={setIsNewBlockOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Bloco de Produção</DialogTitle>
            <DialogDescription>
              Defina o período do bloco. As métricas de vendas serão calculadas automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Data de Início</label>
                <input
                  type="date"
                  value={newBlockStart}
                  onChange={(e) => setNewBlockStart(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Data de Término</label>
                <input
                  type="date"
                  value={newBlockEnd}
                  onChange={(e) => setNewBlockEnd(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-md border bg-muted/30">
              <input
                id="auto-recurring"
                type="checkbox"
                checked={newBlockAutoRecurring}
                onChange={(e) => setNewBlockAutoRecurring(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
              />
              <div className="flex-1">
                <label htmlFor="auto-recurring" className="text-sm font-medium cursor-pointer">
                  Recorrência automática mensal
                </label>
                <p className="text-xs text-muted-foreground">Cria um novo bloco automaticamente todo mês</p>
              </div>
            </div>
            {newBlockAutoRecurring && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Dia do mês para criar o próximo bloco</label>
                <Select value={newBlockRecurrenceDay} onValueChange={setNewBlockRecurrenceDay}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                      <SelectItem key={day} value={String(day)}>Dia {day}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Todo dia <strong>{newBlockRecurrenceDay}</strong> de cada mês, um novo bloco será criado automaticamente.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewBlockOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateBlock} disabled={creatingBlock}>
              {creatingBlock ? "Criando..." : "Criar Bloco"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
