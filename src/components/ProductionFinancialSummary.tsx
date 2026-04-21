import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, TrendingDown, Receipt, Users, Wallet, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LoadingAnimation } from "./LoadingAnimation";

interface ProductionFinancialSummaryProps {
  organizationId: string;
  blockId: string;
  startDate: Date;
  endDate: Date;
  totalRevenue: number;
  totalCost: number;
}

const EXPENSE_CATEGORIES = [
  { value: "rent", label: "Aluguel" },
  { value: "salary", label: "Salários" },
  { value: "marketing", label: "Marketing" },
  { value: "tools", label: "Ferramentas/Software" },
  { value: "taxes", label: "Impostos" },
  { value: "other", label: "Outros" },
];

const EXPENSE_COLORS: Record<string, string> = {
  rent: "bg-violet-500",
  salary: "bg-blue-500",
  marketing: "bg-pink-500",
  tools: "bg-amber-500",
  taxes: "bg-red-500",
  other: "bg-gray-500",
};

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export function ProductionFinancialSummary({ organizationId, blockId, startDate, endDate, totalRevenue, totalCost }: ProductionFinancialSummaryProps) {
  const { permissions } = useOrganization();
  const isAdmin = !permissions.loading && (permissions.role === 'owner' || permissions.role === 'admin');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [newExpense, setNewExpense] = useState({ category: "other", description: "", amount: "" });
  const [addingExpense, setAddingExpense] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['production-financial', organizationId, blockId],
    queryFn: async () => {
      const { data: expenses } = await supabase
        .from("production_expenses")
        .select("*")
        .eq("production_block_id", blockId)
        .order("created_at", { ascending: false });
      const totalExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;

      const { data: commissions } = await supabase
        .from("commissions")
        .select("commission_value, status")
        .eq("organization_id", organizationId)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());
      const pendingCommissions = (commissions || []).filter(c => c.status === "pending").reduce((s, c) => s + c.commission_value, 0);
      const paidCommissions = (commissions || []).filter(c => c.status === "paid").reduce((s, c) => s + c.commission_value, 0);

      return { expenses: expenses || [], totalExpenses, pendingCommissions, paidCommissions, totalCommissions: pendingCommissions + paidCommissions };
    },
    enabled: !!blockId && !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  const netProfit = totalRevenue - totalCost - (data?.totalExpenses || 0) - (data?.totalCommissions || 0);

  const handleAddExpense = async () => {
    if (!newExpense.description) {
      toast({ title: "Preencha a descrição da despesa", variant: "destructive" });
      return;
    }
    if (!newExpense.amount || parseFloat(newExpense.amount) <= 0) {
      toast({ title: "Informe um valor válido", variant: "destructive" });
      return;
    }
    if (!organizationId) return;
    setAddingExpense(true);
    try {
      const { error } = await supabase.from("production_expenses").insert({
        organization_id: organizationId,
        production_block_id: blockId,
        category: newExpense.category,
        description: newExpense.description,
        amount: parseFloat(newExpense.amount),
      });
      if (error) throw error;
      toast({ title: "Despesa adicionada" });
      setNewExpense({ category: "other", description: "", amount: "" });
      queryClient.invalidateQueries({ queryKey: ['production-financial', organizationId, blockId] });
      queryClient.invalidateQueries({ queryKey: ['production-blocks', organizationId] });
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setAddingExpense(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    await supabase.from("production_expenses").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ['production-financial', organizationId, blockId] });
    queryClient.invalidateQueries({ queryKey: ['production-blocks', organizationId] });
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><LoadingAnimation /></div>;
  }

  const cards = [
    { label: "Receita Total", value: fmt(totalRevenue), icon: DollarSign, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "Custo dos Produtos", value: fmt(totalCost), icon: TrendingDown, color: "text-red-600 dark:text-red-400", bg: "bg-red-500/10" },
    { label: "Despesas Operacionais", value: fmt(data?.totalExpenses || 0), icon: Receipt, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10" },
    { label: "Comissões", value: fmt(data?.totalCommissions || 0), icon: Users, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" },
    { label: "Lucro Líquido", value: fmt(netProfit), icon: Wallet, color: netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400", bg: netProfit >= 0 ? "bg-emerald-500/10" : "bg-red-500/10" },
  ];

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Resumo Financeiro</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {cards.map((card) => (
            <div key={card.label} className="rounded-xl border border-border bg-card p-3 sm:p-4 hover:shadow-sm transition-all">
              <div className={`inline-flex items-center justify-center h-8 w-8 rounded-lg ${card.bg} ${card.color} mb-2`}>
                <card.icon className="h-4 w-4" />
              </div>
              <p className="text-[10px] sm:text-xs text-muted-foreground font-medium">{card.label}</p>
              <p className={`text-sm sm:text-base font-bold mt-0.5 ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Expense Management */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Despesas</h3>

        {/* Add expense form (admin only) */}
        {isAdmin && (
          <div className="flex gap-2 items-end p-3 rounded-xl bg-muted/30 border border-border mb-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Categoria</label>
              <Select value={newExpense.category} onValueChange={(v) => setNewExpense(p => ({ ...p, category: v }))}>
                <SelectTrigger className="w-[130px] h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Descrição</label>
              <Input
                placeholder="Ex: Aluguel do escritório"
                value={newExpense.description}
                onChange={(e) => setNewExpense(p => ({ ...p, description: e.target.value }))}
                className="h-9 text-xs"
                onKeyDown={(e) => e.key === 'Enter' && handleAddExpense()}
              />
            </div>
            <div className="w-[120px] space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Valor (R$)</label>
              <Input
                type="number"
                placeholder="0,00"
                value={newExpense.amount}
                onChange={(e) => setNewExpense(p => ({ ...p, amount: e.target.value }))}
                className="h-9 text-xs"
                onKeyDown={(e) => e.key === 'Enter' && handleAddExpense()}
              />
            </div>
            <Button onClick={handleAddExpense} disabled={addingExpense} size="sm" className="h-9 gap-1">
              <Plus className="h-3.5 w-3.5" />
              Adicionar
            </Button>
          </div>
        )}

        {/* Expense list */}
        {data && data.expenses.length > 0 ? (
          <div className="space-y-2">
            {data.expenses.map((exp: any) => {
              const catInfo = EXPENSE_CATEGORIES.find(c => c.value === exp.category);
              const dotColor = EXPENSE_COLORS[exp.category] || 'bg-gray-500';
              return (
                <div
                  key={exp.id}
                  className="group flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:shadow-sm transition-all"
                >
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center text-white text-xs font-bold ${dotColor}`}>
                    {(catInfo?.label || exp.category).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{exp.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {catInfo?.label || exp.category} · {format(new Date(exp.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-orange-600 dark:text-orange-400 shrink-0">
                    {fmt(Number(exp.amount))}
                  </p>
                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteExpense(exp.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0 ml-1"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}

            {/* Total bar */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border mt-2">
              <span className="text-sm font-semibold text-muted-foreground">Total de Despesas</span>
              <span className="text-base font-bold text-orange-600 dark:text-orange-400">{fmt(data.totalExpenses)}</span>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 rounded-xl border border-dashed border-border bg-muted/10">
            <Receipt className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-medium">Nenhuma despesa registrada</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Adicione despesas para calcular o lucro real</p>
          </div>
        )}
      </div>
    </div>
  );
}
