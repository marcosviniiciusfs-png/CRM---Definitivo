# Produção Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the production blocks grid with a direct dashboard view showing metrics, sales, and financial summary for the selected month/year.

**Architecture:** Refactor `ProductionDashboard.tsx` to show data directly instead of block cards. Extract display logic from `ProductionBlockDetailModal.tsx` into three new inline components. Keep the existing "Nova Produção" dialog and realtime subscriptions.

**Tech Stack:** React, TypeScript, Tailwind CSS, shadcn/ui, Supabase, React Query, date-fns, Lucide Icons

**No test infrastructure exists.** User wants localhost visual validation first.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/components/ProductionMetricCards.tsx` | 4 colored gradient metric cards |
| Create | `src/components/ProductionSalesTable.tsx` | Sales table with search filter |
| Create | `src/components/ProductionFinancialSummary.tsx` | Financial breakdown cards |
| Modify | `src/components/ProductionDashboard.tsx` | Replace block grid with dashboard view |
| Unchanged | `src/pages/Producao.tsx` | 3-tab structure stays the same |
| Unchanged | `src/components/ProductionBlockDetailModal.tsx` | Kept for reference, no longer imported |

---

### Task 1: Create ProductionMetricCards Component

**Files:**
- Create: `src/components/ProductionMetricCards.tsx`

- [ ] **Step 1: Create the metric cards component**

```tsx
import { ShoppingBag, DollarSign, TrendingUp, Receipt, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

interface MetricCard {
  label: string;
  value: string;
  change: number | null;
}

interface ProductionMetricCardsProps {
  sales: MetricCard;
  revenue: MetricCard;
  profit: MetricCard;
  ticket: MetricCard;
}

const CARD_STYLES = [
  { gradient: "from-[#6c5ce7] to-[#a29bfe]", icon: ShoppingBag },
  { gradient: "from-[#00b894] to-[#55efc4]", icon: DollarSign },
  { gradient: "from-[#0984e3] to-[#74b9ff]", icon: TrendingUp },
  { gradient: "from-[#e17055] to-[#fab1a0]", icon: Receipt },
];

function ChangeIndicator({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[10px] opacity-70">—</span>;
  const isPositive = value > 0;
  const isNeutral = value === 0;
  return (
    <div className="flex items-center gap-0.5 text-[10px]">
      {isNeutral ? (
        <Minus className="h-3 w-3" />
      ) : isPositive ? (
        <ArrowUpRight className="h-3 w-3" />
      ) : (
        <ArrowDownRight className="h-3 w-3" />
      )}
      <span>{isPositive ? "+" : ""}{value.toFixed(1)}%</span>
    </div>
  );
}

export function ProductionMetricCards({ sales, revenue, profit, ticket }: ProductionMetricCardsProps) {
  const cards = [sales, revenue, profit, ticket];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map((card, i) => {
        const style = CARD_STYLES[i];
        const Icon = style.icon;
        return (
          <div
            key={card.label}
            className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${style.gradient} text-white p-4 sm:p-5 transition-all hover:shadow-lg hover:scale-[1.02]`}
          >
            <div className="flex items-start justify-between">
              <Icon className="h-5 w-5 opacity-80" />
              <ChangeIndicator value={card.change} />
            </div>
            <p className="text-[10px] sm:text-xs uppercase font-semibold opacity-80 mt-3 tracking-wide">
              {card.label}
            </p>
            <p className="text-lg sm:text-2xl font-bold mt-1 leading-tight">{card.value}</p>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify file compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors in `ProductionMetricCards.tsx` (other pre-existing errors are OK)

---

### Task 2: Create ProductionSalesTable Component

**Files:**
- Create: `src/components/ProductionSalesTable.tsx`

- [ ] **Step 1: Create the sales table component**

```tsx
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, ShoppingBag, MessageSquare, Globe } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getInitials } from "@/lib/image-utils";
import { LoadingAnimation } from "./LoadingAnimation";
import { LeadDetailsDialog } from "./LeadDetailsDialog";

interface Sale {
  id: string;
  nome_lead: string;
  telefone_lead: string;
  source: string;
  valor: number;
  data_conclusao: string;
  responsavel: string;
  responsavel_user_id?: string;
}

interface ProductionSalesTableProps {
  organizationId: string;
  startDate: Date;
  endDate: Date;
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

function getSourceIcon(source: string) {
  const lower = source?.toLowerCase() || '';
  if (lower.includes('whatsapp')) return <MessageSquare className="h-4 w-4 text-green-500" />;
  if (lower.includes('facebook')) return <span className="text-blue-500 font-bold text-sm">f</span>;
  if (lower.includes('webhook') || lower.includes('url')) return <Globe className="h-4 w-4 text-sky-500" />;
  return <span className="text-muted-foreground text-xs">✏️</span>;
}

function getSourceLabel(source: string) {
  const lower = source?.toLowerCase() || '';
  if (lower.includes('whatsapp')) return 'WhatsApp';
  if (lower.includes('facebook')) return 'Facebook';
  if (lower.includes('webhook') || lower.includes('url')) return 'Webhook';
  return 'Manual';
}

export function ProductionSalesTable({ organizationId, startDate, endDate }: ProductionSalesTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedLeadName, setSelectedLeadName] = useState<string>("");

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ['production-sales', organizationId, startDate.toISOString(), endDate.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, nome_lead, telefone_lead, source, valor, data_conclusao, responsavel, responsavel_user_id, funnel_stages(stage_type)")
        .eq("organization_id", organizationId)
        .gte("data_conclusao", startDate.toISOString())
        .lte("data_conclusao", endDate.toISOString());

      if (error) throw error;
      const wonSales = data?.filter(s => (s.funnel_stages as any)?.stage_type === 'won') || [];
      return wonSales as Sale[];
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: profilesMap = {} } = useQuery({
    queryKey: ['sales-profiles', sales.map(s => s.responsavel_user_id).join(',')],
    queryFn: async () => {
      const userIds = [...new Set(sales.map(s => s.responsavel_user_id).filter(Boolean))] as string[];
      if (userIds.length === 0) return {};
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds);
      const map: Record<string, { full_name: string | null; avatar_url: string | null }> = {};
      profiles?.forEach(p => { map[p.user_id] = { full_name: p.full_name, avatar_url: p.avatar_url }; });
      return map;
    },
    enabled: sales.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const filteredSales = searchTerm
    ? sales.filter(s =>
        s.nome_lead?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.responsavel?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : sales;

  const totalValue = filteredSales.reduce((sum, s) => sum + (s.valor || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Vendas do Período</h3>
        <span className="text-xs text-muted-foreground">{filteredSales.length} vendas</span>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Buscar (nome, responsável)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 h-9 text-sm"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><LoadingAnimation /></div>
      ) : filteredSales.length > 0 ? (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs font-semibold">Cliente</TableHead>
                <TableHead className="text-xs font-semibold hidden sm:table-cell">Canal</TableHead>
                <TableHead className="text-xs font-semibold">Responsável</TableHead>
                <TableHead className="text-xs font-semibold hidden md:table-cell">Data</TableHead>
                <TableHead className="text-xs font-semibold text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSales.map((sale) => (
                <TableRow
                  key={sale.id}
                  className="cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => { setSelectedLeadId(sale.id); setSelectedLeadName(sale.nome_lead); }}
                >
                  <TableCell className="font-medium text-sm">{sale.nome_lead}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex items-center gap-2">
                      {getSourceIcon(sale.source)}
                      <span className="text-sm">{getSourceLabel(sale.source)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6 ring-1 ring-border">
                        <AvatarImage
                          src={profilesMap[sale.responsavel_user_id || '']?.avatar_url || undefined}
                          alt={sale.responsavel || ''}
                        />
                        <AvatarFallback className="text-[8px] bg-muted text-muted-foreground">
                          {getInitials(sale.responsavel)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{sale.responsavel || '—'}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                    {sale.data_conclusao
                      ? format(new Date(sale.data_conclusao), "dd/MM/yyyy", { locale: ptBR })
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-sm text-emerald-600 dark:text-emerald-400">
                    {fmt(sale.valor)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/30 hover:bg-muted/30 border-t-2 border-border">
                <TableCell colSpan={4} className="font-semibold text-sm text-right">
                  Total
                </TableCell>
                <TableCell className="text-right font-bold text-sm text-emerald-600 dark:text-emerald-400">
                  {fmt(totalValue)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-16 rounded-xl border border-dashed border-border bg-muted/10">
          <ShoppingBag className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-medium">Nenhuma venda neste período</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Vendas fechadas aparecerão aqui automaticamente</p>
        </div>
      )}

      {selectedLeadId && (
        <LeadDetailsDialog
          open={!!selectedLeadId}
          onOpenChange={(open) => { if (!open) { setSelectedLeadId(null); setSelectedLeadName(''); } }}
          leadId={selectedLeadId}
          leadName={selectedLeadName}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify file compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors in `ProductionSalesTable.tsx`

---

### Task 3: Create ProductionFinancialSummary Component

**Files:**
- Create: `src/components/ProductionFinancialSummary.tsx`

- [ ] **Step 1: Create the financial summary component**

```tsx
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, TrendingDown, Receipt, Users, Wallet } from "lucide-react";
import { LoadingAnimation } from "./LoadingAnimation";

interface ProductionFinancialSummaryProps {
  organizationId: string;
  blockId: string;
  startDate: Date;
  endDate: Date;
  totalRevenue: number;
  totalCost: number;
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export function ProductionFinancialSummary({ organizationId, blockId, startDate, endDate, totalRevenue, totalCost }: ProductionFinancialSummaryProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['production-financial', organizationId, blockId],
    queryFn: async () => {
      const { data: expenses } = await supabase
        .from("production_expenses")
        .select("amount")
        .eq("production_block_id", blockId);
      const totalExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;

      const { data: commissions } = await supabase
        .from("commissions")
        .select("commission_value, status")
        .eq("organization_id", organizationId)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString());
      const pendingCommissions = (commissions || []).filter(c => c.status === "pending").reduce((s, c) => s + c.commission_value, 0);
      const paidCommissions = (commissions || []).filter(c => c.status === "paid").reduce((s, c) => s + c.commission_value, 0);

      return { totalExpenses, pendingCommissions, paidCommissions, totalCommissions: pendingCommissions + paidCommissions };
    },
    enabled: !!blockId && !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  const netProfit = totalRevenue - totalCost - (data?.totalExpenses || 0) - (data?.totalCommissions || 0);

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
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Resumo Financeiro</h3>
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
  );
}
```

- [ ] **Step 2: Verify file compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors in `ProductionFinancialSummary.tsx`

---

### Task 4: Rewrite ProductionDashboard Component

**Files:**
- Modify: `src/components/ProductionDashboard.tsx` (full rewrite)

- [ ] **Step 1: Rewrite ProductionDashboard with dashboard view**

Replace the entire file content with the following. This keeps all existing data fetching, realtime subscriptions, and "Nova Produção" dialog logic. Changes:
- Replaces block grid with direct dashboard view
- Adds month/year selector in the header
- Imports and renders the 3 new inline components
- Calculates variation percentages for all 4 metric cards

```tsx
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

  // New block dialog
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

  // Find the block matching the selected month/year
  const selectedBlock = blocks.find(b => b.month === selectedMonth && b.year === selectedYear) || null;

  // Calculate date range for the selected block
  const blockStartDate = new Date(selectedYear, selectedMonth - 1, 1);
  const blockEndDate = new Date(selectedYear, selectedMonth, 0, 23, 59, 59);

  // Calculate previous block for variation comparisons
  const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
  const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
  const previousBlock = blocks.find(b => b.month === prevMonth && b.year === prevYear) || null;

  // Metric card data with variation percentages
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

  // Generate month options for the selector (last 12 months + future months from blocks)
  const monthOptions = (() => {
    const options: { month: number; year: number; label: string }[] = [];
    const now = new Date();
    // Last 12 months
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push({
        month: d.getMonth() + 1,
        year: d.getFullYear(),
        label: format(d, "MMMM yyyy", { locale: ptBR }),
      });
    }
    // Add any months from blocks that aren't already in the list
    blocks.forEach(b => {
      if (!options.find(o => o.month === b.month && o.year === b.year)) {
        options.push({
          month: b.month,
          year: b.year,
          label: format(new Date(b.year, b.month - 1), "MMMM yyyy", { locale: ptBR }),
        });
      }
    });
    // Sort by date descending
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

      {/* Empty state when no block exists for selected month */}
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to `ProductionDashboard`, `ProductionMetricCards`, `ProductionSalesTable`, or `ProductionFinancialSummary`

---

### Task 5: Visual Validation on Localhost

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Navigate to the Produção section in browser**

Open the app at the localhost URL. Navigate to Administrativo → Produção tab.

- [ ] **Step 3: Verify the following:**
- [ ] 4 colored gradient metric cards appear at the top (Vendas Fechadas, Faturamento, Lucro Líquido, Ticket Médio)
- [ ] Month/year selector works in the top right
- [ ] Sales table loads below the cards with search filter
- [ ] Financial summary loads below the sales table
- [ ] "Nova Produção" button opens the creation dialog
- [ ] Empty state shows when selecting a month without a block
- [ ] The other two tabs (Produtos da Empresa, Financeiro) still work

- [ ] **Step 4: Commit**

```bash
git add src/components/ProductionMetricCards.tsx src/components/ProductionSalesTable.tsx src/components/ProductionFinancialSummary.tsx src/components/ProductionDashboard.tsx
git commit -m "feat(producao): redesign Produção tab with direct dashboard view

Replace production blocks grid with inline dashboard showing metrics,
sales table, and financial summary directly on the page. Adds month/year
selector and keeps Nova Produção creation dialog."
```
