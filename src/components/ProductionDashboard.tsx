import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ProductionBlockCard } from "./ProductionBlockCard";
import { ProductionBlockDetailModal } from "./ProductionBlockDetailModal";
import { LoadingAnimation } from "./LoadingAnimation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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
}

const MONTHS = [
  { value: "1", label: "Janeiro" },
  { value: "2", label: "Fevereiro" },
  { value: "3", label: "Março" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Maio" },
  { value: "6", label: "Junho" },
  { value: "7", label: "Julho" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

const calculateMetrics = async (organizationId: string, month: number, year: number) => {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

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
    // Use maybeSingle() instead of single() — avoids 406 when no row is found
    const { data: existing, error: selectError } = await supabase
      .from("production_blocks")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("month", month)
      .eq("year", year)
      .maybeSingle();

    if (selectError) {
      console.warn("[Production] Could not check existing block:", selectError.message);
      return;
    }

    if (existing) {
      const metrics = await calculateMetrics(organizationId, month, year);

      // Safely fetch expenses — table may not exist yet (migration pending)
      const { data: expenses } = await supabase
        .from("production_expenses")
        .select("amount")
        .eq("organization_id", organizationId)
        .eq("production_block_id", existing.id);

      const totalExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;
      const realProfit = metrics.totalRevenue - metrics.totalCost - totalExpenses;

      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;

      // maybeSingle() — no 406 when previous month block doesn't exist
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

      await supabase
        .from("production_blocks")
        .update({
          total_sales: metrics.totalSales,
          total_revenue: metrics.totalRevenue,
          total_cost: metrics.totalCost,
          total_profit: realProfit,
          previous_month_profit: previousProfit,
          profit_change_value: profitChange,
          profit_change_percentage: profitChangePercentage,
        })
        .eq("organization_id", organizationId)
        .eq("month", month)
        .eq("year", year);
      return;
    }

    // Block doesn't exist yet — try to create it
    const metrics = await calculateMetrics(organizationId, month, year);
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;

    // maybeSingle() — no 406 when previous month block doesn't exist
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
      total_sales: metrics.totalSales,
      total_revenue: metrics.totalRevenue,
      total_cost: metrics.totalCost,
      total_profit: metrics.profit,
      previous_month_profit: previousProfit,
      profit_change_value: profitChange,
      profit_change_percentage: profitChangePercentage,
    });

    if (insertError) {
      // 403 = RLS policy missing (migration pending). Log once, don't throw.
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

  // Best-effort: create/sync current month block. Never throws.
  await ensureCurrentMonthBlock(organizationId, currentMonth, currentYear);

  const { data, error } = await supabase
    .from("production_blocks")
    .select("*")
    .eq("organization_id", organizationId)
    .order("year", { ascending: false })
    .order("month", { ascending: false });

  if (error) {
    // RLS or network error — return empty list instead of throwing (avoids retry loop)
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

  const [selectedBlock, setSelectedBlock] = useState<ProductionBlock | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // New block dialog
  const [isNewBlockOpen, setIsNewBlockOpen] = useState(false);
  const currentDate = new Date();
  const [newBlockMonth, setNewBlockMonth] = useState(String(currentDate.getMonth() + 1));
  const [newBlockYear, setNewBlockYear] = useState(String(currentDate.getFullYear()));
  const [creatingBlock, setCreatingBlock] = useState(false);

  // Delete confirmation
  const [blockToDelete, setBlockToDelete] = useState<ProductionBlock | null>(null);
  const [deletingBlock, setDeletingBlock] = useState(false);

  const { data: blocks = [], isLoading } = useQuery({
    queryKey: ['production-blocks', organizationId],
    queryFn: () => fetchProductionBlocks(organizationId!),
    enabled: isReady && !!organizationId,
    staleTime: 5 * 60 * 1000,
    retry: false, // Don't retry on error — prevents cascading 403/406 loops
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

  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  const currentBlock = blocks.find(b => b.month === currentMonth && b.year === currentYear) || null;

  const handleBlockClick = (block: ProductionBlock) => {
    setSelectedBlock(block);
    setIsDetailModalOpen(true);
  };

  const handleDeleteRequest = (block: ProductionBlock) => {
    // Prevent deleting the current month's block
    if (block.month === currentMonth && block.year === currentYear) {
      toast({
        title: "Não é possível excluir o bloco do mês atual",
        variant: "destructive",
      });
      return;
    }
    setBlockToDelete(block);
  };

  const handleDeleteConfirm = async () => {
    if (!blockToDelete) return;
    setDeletingBlock(true);
    try {
      const { error } = await supabase
        .from("production_blocks")
        .delete()
        .eq("id", blockToDelete.id);

      if (error) throw error;

      toast({ title: "Bloco excluído com sucesso" });
      queryClient.invalidateQueries({ queryKey: ['production-blocks', organizationId] });
    } catch (error: any) {
      toast({ title: "Erro ao excluir bloco", description: error.message, variant: "destructive" });
    } finally {
      setDeletingBlock(false);
      setBlockToDelete(null);
    }
  };

  const handleCreateBlock = async () => {
    if (!organizationId) return;
    const month = parseInt(newBlockMonth);
    const year = parseInt(newBlockYear);

    // Check if block already exists
    const existing = blocks.find(b => b.month === month && b.year === year);
    if (existing) {
      toast({
        title: "Bloco já existe",
        description: `Já existe um bloco para ${format(new Date(year, month - 1), "MMMM yyyy", { locale: ptBR })}`,
        variant: "destructive",
      });
      return;
    }

    setCreatingBlock(true);
    try {
      const metrics = await calculateMetrics(organizationId, month, year);
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
        total_sales: metrics.totalSales,
        total_revenue: metrics.totalRevenue,
        total_cost: metrics.totalCost,
        total_profit: metrics.profit,
        previous_month_profit: previousProfit,
        profit_change_value: profitChange,
        profit_change_percentage: profitChangePercentage,
      });

      if (error) throw error;

      toast({
        title: "Bloco criado",
        description: `Bloco de ${format(new Date(year, month - 1), "MMMM yyyy", { locale: ptBR })} criado com sucesso`,
      });
      setIsNewBlockOpen(false);
      queryClient.invalidateQueries({ queryKey: ['production-blocks', organizationId] });
    } catch (error: any) {
      toast({ title: "Erro ao criar bloco", description: error.message, variant: "destructive" });
    } finally {
      setCreatingBlock(false);
    }
  };

  // Build year options: 3 years back to 2 years forward
  const yearOptions = [];
  for (let y = currentYear - 3; y <= currentYear + 2; y++) {
    yearOptions.push(String(y));
  }

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
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Blocos de Produção</h2>
        {isAdmin && (
          <Button onClick={() => setIsNewBlockOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Novo Bloco
          </Button>
        )}
      </div>

      {blocks.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {blocks.map((block) => {
            const isCurrent = block.month === currentBlock?.month && block.year === currentBlock?.year;
            return (
              <ProductionBlockCard
                key={block.id}
                block={block}
                isCurrent={isCurrent}
                onClick={() => handleBlockClick(block)}
                onDelete={isAdmin && !isCurrent ? () => handleDeleteRequest(block) : undefined}
              />
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-card rounded-lg border">
          <p className="text-muted-foreground">
            Nenhum bloco de produção encontrado
          </p>
        </div>
      )}

      {/* Detail Modal */}
      {selectedBlock && (
        <ProductionBlockDetailModal
          block={selectedBlock}
          open={isDetailModalOpen}
          onOpenChange={setIsDetailModalOpen}
          onBlockUpdated={() => queryClient.invalidateQueries({ queryKey: ['production-blocks', organizationId] })}
        />
      )}

      {/* New Block Dialog */}
      <Dialog open={isNewBlockOpen} onOpenChange={setIsNewBlockOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Novo Bloco de Produção</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Mês</label>
              <Select value={newBlockMonth} onValueChange={setNewBlockMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Ano</label>
              <Select value={newBlockYear} onValueChange={setNewBlockYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map(y => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewBlockOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateBlock} disabled={creatingBlock}>
              {creatingBlock ? "Criando..." : "Criar Bloco"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!blockToDelete} onOpenChange={(open) => !open && setBlockToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir bloco de produção?</AlertDialogTitle>
            <AlertDialogDescription>
              {blockToDelete && (
                <>
                  Deseja excluir o bloco de{" "}
                  <strong className="capitalize">
                    {format(new Date(blockToDelete.year, blockToDelete.month - 1), "MMMM yyyy", { locale: ptBR })}
                  </strong>
                  ? Esta ação não pode ser desfeita. As despesas associadas também serão excluídas.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deletingBlock}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingBlock ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
