import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/contexts/OrganizationContext";
import { LeadDetailsDialog } from "./LeadDetailsDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign,
  TrendingUp,
  MessageSquare,
  Globe,
  Plus,
  Trash2,
  Receipt,
  Phone,
  Download,
  ShoppingBag,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  CalendarDays,
  FileText,
  Wallet,
  Package,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LoadingAnimation } from "./LoadingAnimation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/image-utils";

interface ProductionBlock {
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
  start_date?: string | null;
  end_date?: string | null;
}

interface Sale {
  id: string;
  nome_lead: string;
  telefone_lead: string;
  source: string;
  valor: number;
  data_conclusao: string;
  responsavel: string;
}

interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  created_at: string;
}

interface ProductionBlockDetailModalProps {
  block: ProductionBlock;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBlockUpdated?: () => void;
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

export function ProductionBlockDetailModal({ block, open, onOpenChange, onBlockUpdated }: ProductionBlockDetailModalProps) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [newExpense, setNewExpense] = useState({ category: "other", description: "", amount: "" });
  const [addingExpense, setAddingExpense] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [selectedLeadName, setSelectedLeadName] = useState<string>('');
  const [profilesMap, setProfilesMap] = useState<Record<string, { full_name: string | null; avatar_url: string | null }>>({});
  const { toast } = useToast();
  const { organizationId, permissions } = useOrganization();
  const isAdmin = !permissions.loading && (permissions.role === 'owner' || permissions.role === 'admin');

  useEffect(() => {
    if (open) {
      loadSalesDetails();
      loadExpenses();
    }
  }, [open, block]);

  const loadSalesDetails = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: memberData } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!memberData) return;

      const startDate = block.start_date
        ? new Date(block.start_date + 'T00:00:00')
        : new Date(block.year, block.month - 1, 1);
      const endDate = block.end_date
        ? new Date(block.end_date + 'T23:59:59')
        : new Date(block.year, block.month, 0, 23, 59, 59);

      const { data, error } = await supabase
        .from("leads")
        .select("id, nome_lead, telefone_lead, source, valor, data_conclusao, responsavel, responsavel_user_id, funnel_stages(stage_type)")
        .eq("organization_id", memberData.organization_id)
        .gte("data_conclusao", startDate.toISOString())
        .lte("data_conclusao", endDate.toISOString());

      if (error) throw error;
      const wonSales = data?.filter(s => (s.funnel_stages as any)?.stage_type === 'won') || [];
      setSales(wonSales as Sale[]);

      // Fetch profiles for responsibles
      const userIds = [...new Set(wonSales.map(s => (s as any).responsavel_user_id).filter(Boolean))] as string[];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, avatar_url")
          .in("user_id", userIds);
        const map: Record<string, { full_name: string | null; avatar_url: string | null }> = {};
        profiles?.forEach(p => { map[p.user_id] = { full_name: p.full_name, avatar_url: p.avatar_url }; });
        setProfilesMap(map);
      } else {
        setProfilesMap({});
      }
    } catch (error: any) {
      toast({ title: "Erro ao carregar detalhes", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadExpenses = async () => {
    const { data } = await supabase
      .from("production_expenses")
      .select("*")
      .eq("production_block_id", block.id)
      .order("created_at", { ascending: false });
    setExpenses((data || []) as Expense[]);
  };

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
        production_block_id: block.id,
        category: newExpense.category,
        description: newExpense.description,
        amount: parseFloat(newExpense.amount),
      });
      if (error) throw error;
      toast({ title: "Despesa adicionada" });
      setNewExpense({ category: "other", description: "", amount: "" });
      loadExpenses();
      onBlockUpdated?.();
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setAddingExpense(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    await supabase.from("production_expenses").delete().eq("id", id);
    loadExpenses();
    onBlockUpdated?.();
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const realProfit = block.total_revenue - block.total_cost - totalExpenses;
  const averageTicket = sales.length > 0 ? block.total_revenue / sales.length : 0;

  const getSourceIcon = (source: string) => {
    const lower = source?.toLowerCase() || '';
    if (lower.includes('whatsapp')) return <MessageSquare className="h-4 w-4 text-green-500" />;
    if (lower.includes('facebook')) return <span className="text-blue-500 font-bold text-sm">f</span>;
    if (lower.includes('webhook') || lower.includes('url')) return <Globe className="h-4 w-4 text-sky-500" />;
    return <span className="text-muted-foreground text-xs">✏️</span>;
  };

  const getSourceLabel = (source: string) => {
    const lower = source?.toLowerCase() || '';
    if (lower.includes('whatsapp')) return 'WhatsApp';
    if (lower.includes('facebook')) return 'Facebook';
    if (lower.includes('webhook') || lower.includes('url')) return 'Webhook';
    return 'Manual';
  };

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const fmtShort = (v: number) => {
    if (v >= 1000000) return `R$${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `R$${(v / 1000).toFixed(1)}K`;
    return fmt(v);
  };
  const monthName = format(new Date(block.year, block.month - 1), "MMMM yyyy", { locale: ptBR });
  const dateRange = useMemo(() => {
    if (block.start_date && block.end_date) {
      const s = format(new Date(block.start_date + 'T00:00:00'), "dd MMM", { locale: ptBR });
      const e = format(new Date(block.end_date + 'T00:00:00'), "dd MMM yyyy", { locale: ptBR });
      return `${s} - ${e}`;
    }
    return format(new Date(block.year, block.month - 1, 1), "MMMM yyyy", { locale: ptBR });
  }, [block]);

  const exportToCSV = () => {
    const rows: string[][] = [];
    rows.push(['=== VENDAS ===', '', '', '', '', '']);
    rows.push(['Lead', 'Telefone', 'Canal', 'Responsável', 'Data/Hora', 'Valor (R$)']);
    sales.forEach((s) => {
      rows.push([
        s.nome_lead || '',
        s.telefone_lead || '',
        getSourceLabel(s.source),
        s.responsavel || '',
        s.data_conclusao ? format(new Date(s.data_conclusao), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '',
        String(s.valor || 0).replace('.', ','),
      ]);
    });
    rows.push(['', '', '', '', 'TOTAL VENDAS', String(block.total_revenue).replace('.', ',')]);
    rows.push(['', '', '', '', '', '']);
    rows.push(['=== DESPESAS ===', '', '', '', '', '']);
    rows.push(['Categoria', 'Descrição', '', '', 'Data', 'Valor (R$)']);
    expenses.forEach((e) => {
      rows.push([
        EXPENSE_CATEGORIES.find((c) => c.value === e.category)?.label || e.category,
        e.description || '',
        '', '',
        format(new Date(e.created_at), "dd/MM/yyyy", { locale: ptBR }),
        String(e.amount || 0).replace('.', ','),
      ]);
    });
    rows.push(['', '', '', '', 'TOTAL DESPESAS', String(totalExpenses).replace('.', ',')]);
    rows.push(['', '', '', '', '', '']);
    rows.push(['=== RESUMO ===', '', '', '', '', '']);
    rows.push(['Faturamento', '', '', '', '', String(block.total_revenue).replace('.', ',')]);
    rows.push(['Total Despesas', '', '', '', '', String(totalExpenses).replace('.', ',')]);
    rows.push(['Lucro Real', '', '', '', '', String(realProfit).replace('.', ',')]);

    const csv =
      '\uFEFF' +
      rows
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
        .join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `producao-${monthName.replace(/\s+/g, '-').toLowerCase()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: 'Exportado com sucesso', description: `Arquivo .csv compatível com Excel e Google Sheets` });
  };

  // KPI card data
  const kpiCards = [
    {
      label: "Vendas Fechadas",
      value: String(sales.length),
      icon: <ShoppingBag className="h-5 w-5" />,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10 dark:bg-emerald-500/20",
      border: "border-emerald-500/20 dark:border-emerald-500/30",
      accent: "bg-emerald-500",
    },
    {
      label: "Faturamento",
      value: fmtShort(block.total_revenue),
      icon: <DollarSign className="h-5 w-5" />,
      color: "text-sky-600 dark:text-sky-400",
      bg: "bg-sky-500/10 dark:bg-sky-500/20",
      border: "border-sky-500/20 dark:border-sky-500/30",
      accent: "bg-sky-500",
    },
    {
      label: "Lucro Líquido",
      value: fmt(realProfit),
      icon: <TrendingUp className="h-5 w-5" />,
      color: realProfit >= 0
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-red-600 dark:text-red-400",
      bg: realProfit >= 0
        ? "bg-emerald-500/10 dark:bg-emerald-500/20"
        : "bg-red-500/10 dark:bg-red-500/20",
      border: realProfit >= 0
        ? "border-emerald-500/20 dark:border-emerald-500/30"
        : "border-red-500/20 dark:border-red-500/30",
      accent: realProfit >= 0 ? "bg-emerald-500" : "bg-red-500",
      trend: block.profit_change_percentage !== null ? block.profit_change_percentage : null,
    },
    {
      label: "Ticket Médio",
      value: fmt(averageTicket),
      icon: <Wallet className="h-5 w-5" />,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/10 dark:bg-amber-500/20",
      border: "border-amber-500/20 dark:border-amber-500/30",
      accent: "bg-amber-500",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-0 gap-0">
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold capitalize">
                    Produção — {monthName}
                  </DialogTitle>
                  <DialogDescription className="flex items-center gap-2 mt-0.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    <span>{dateRange}</span>
                    <span className="text-muted-foreground/60">·</span>
                    <span>{sales.length} vendas · {expenses.length} despesas</span>
                  </DialogDescription>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              className="shrink-0 gap-2 text-xs"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar CSV
            </Button>
          </div>

          {/* ── KPI Cards ───────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            {kpiCards.map((kpi) => (
              <div
                key={kpi.label}
                className={`relative overflow-hidden rounded-xl border ${kpi.border} bg-card p-4 transition-all hover:shadow-md`}
              >
                <div className={`absolute top-0 left-0 h-1 w-full ${kpi.accent}`} />
                <div className="flex items-start justify-between">
                  <div className={`inline-flex items-center justify-center h-9 w-9 rounded-lg ${kpi.bg} ${kpi.color}`}>
                    {kpi.icon}
                  </div>
                  {'trend' in kpi && kpi.trend !== null && (
                    <Badge
                      variant={kpi.trend >= 0 ? "default" : "destructive"}
                      className="text-[10px] px-1.5 py-0 font-semibold flex items-center gap-0.5"
                    >
                      {kpi.trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {Math.abs(kpi.trend).toFixed(1)}%
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-3 font-medium">{kpi.label}</p>
                <p className={`text-lg font-bold mt-0.5 ${kpi.color}`}>{kpi.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tabbed Content ────────────────────────────────── */}
        <div className="px-6 pt-4 pb-6">
          <Tabs defaultValue="sales" className="w-full">
            <TabsList className="w-full justify-start bg-muted/50 p-1 rounded-lg mb-4">
              <TabsTrigger value="sales" className="gap-2 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <ShoppingBag className="h-3.5 w-3.5" />
                Vendas ({sales.length})
              </TabsTrigger>
              <TabsTrigger value="expenses" className="gap-2 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Receipt className="h-3.5 w-3.5" />
                Despesas ({expenses.length})
              </TabsTrigger>
              <TabsTrigger value="summary" className="gap-2 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <FileText className="h-3.5 w-3.5" />
                Resumo
              </TabsTrigger>
            </TabsList>

            {/* ── Sales Tab ──────────────────────────────────── */}
            <TabsContent value="sales" className="mt-0">
              {loading ? (
                <div className="flex justify-center py-12"><LoadingAnimation /></div>
              ) : sales.length > 0 ? (
                <div className="rounded-xl border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableHead className="text-xs font-semibold">Cliente</TableHead>
                        <TableHead className="text-xs font-semibold">
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3 w-3" />
                            Telefone
                          </div>
                        </TableHead>
                        <TableHead className="text-xs font-semibold">Canal</TableHead>
                        <TableHead className="text-xs font-semibold">Responsável</TableHead>
                        <TableHead className="text-xs font-semibold">Data</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sales.map((sale) => (
                        <TableRow
                          key={sale.id}
                          className="cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => { setSelectedLeadId(sale.id); setSelectedLeadName(sale.nome_lead); }}
                        >
                          <TableCell className="font-medium text-sm">{sale.nome_lead}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{sale.telefone_lead || '—'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getSourceIcon(sale.source)}
                              <span className="text-sm">{getSourceLabel(sale.source)}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6 ring-1 ring-border">
                                <AvatarImage
                                  src={(profilesMap as any)[(sale as any).responsavel_user_id]?.avatar_url || undefined}
                                  alt={sale.responsavel || ''}
                                />
                                <AvatarFallback className="text-[8px] bg-muted text-muted-foreground">
                                  {getInitials(sale.responsavel)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm">{sale.responsavel || '—'}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {sale.data_conclusao
                              ? format(new Date(sale.data_conclusao), "dd/MM/yyyy HH:mm", { locale: ptBR })
                              : '—'}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-sm text-emerald-600 dark:text-emerald-400">
                            {fmt(sale.valor)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Total row */}
                      <TableRow className="bg-muted/30 hover:bg-muted/30 border-t-2 border-border">
                        <TableCell colSpan={5} className="font-semibold text-sm text-right">
                          Total de Vendas
                        </TableCell>
                        <TableCell className="text-right font-bold text-sm text-emerald-600 dark:text-emerald-400">
                          {fmt(block.total_revenue)}
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
            </TabsContent>

            {/* ── Expenses Tab ──────────────────────────────── */}
            <TabsContent value="expenses" className="mt-0 space-y-4">
              {/* Add expense form (admin only) */}
              {isAdmin && (
                <div className="flex gap-2 items-end p-3 rounded-xl bg-muted/30 border border-border">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Categoria</label>
                    <Select value={newExpense.category} onValueChange={(v) => setNewExpense(p => ({ ...p, category: v }))}>
                      <SelectTrigger className="w-[150px] h-9 text-xs">
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
                  <div className="w-[130px] space-y-1">
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

              {/* Expense cards */}
              {expenses.length > 0 ? (
                <div className="space-y-2">
                  {expenses.map((exp) => {
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
                    <span className="text-base font-bold text-orange-600 dark:text-orange-400">{fmt(totalExpenses)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 rounded-xl border border-dashed border-border bg-muted/10">
                  <Receipt className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground font-medium">Nenhuma despesa registrada</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Adicione despesas para calcular o lucro real</p>
                </div>
              )}
            </TabsContent>

            {/* ── Summary Tab ───────────────────────────────── */}
            <TabsContent value="summary" className="mt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Revenue breakdown */}
                <div className="rounded-xl border border-border p-5 space-y-4 bg-card">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-sky-500" />
                    Receita & Custos
                  </h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Faturamento Bruto</span>
                      <span className="text-sm font-semibold">{fmt(block.total_revenue)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Custo dos Produtos</span>
                      <span className="text-sm font-semibold">{fmt(block.total_cost)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Despesas Operacionais</span>
                      <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">{fmt(totalExpenses)}</span>
                    </div>
                    <div className="border-t border-border pt-3 flex justify-between items-center">
                      <span className="text-sm font-bold">Lucro Líquido</span>
                      <span className={`text-base font-bold ${realProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {fmt(realProfit)}
                      </span>
                    </div>
                    {/* Profit margin */}
                    {block.total_revenue > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Margem de Lucro</span>
                          <span>{((realProfit / block.total_revenue) * 100).toFixed(1)}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${realProfit >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(Math.max((realProfit / block.total_revenue) * 100, 0), 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Metrics summary */}
                <div className="rounded-xl border border-border p-5 space-y-4 bg-card">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                    Métricas
                  </h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Total de Vendas</span>
                      <span className="text-sm font-semibold">{sales.length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Ticket Médio</span>
                      <span className="text-sm font-semibold">{fmt(averageTicket)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Despesas</span>
                      <span className="text-sm font-semibold">{expenses.length} registradas</span>
                    </div>
                    {block.profit_change_percentage !== null && (
                      <div className="border-t border-border pt-3 flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">vs Mês Anterior</span>
                        <div className="flex items-center gap-1.5">
                          {block.profit_change_percentage > 0 ? (
                            <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                          ) : block.profit_change_percentage < 0 ? (
                            <ArrowDownRight className="h-4 w-4 text-red-500" />
                          ) : (
                            <Minus className="h-4 w-4 text-muted-foreground" />
                          )}
                          <Badge
                            variant={block.profit_change_percentage >= 0 ? "default" : "destructive"}
                            className="text-xs font-semibold"
                          >
                            {block.profit_change_percentage > 0 ? '+' : ''}
                            {block.profit_change_percentage.toFixed(1)}%
                          </Badge>
                        </div>
                      </div>
                    )}
                    {/* Source breakdown */}
                    {sales.length > 0 && (
                      <div className="border-t border-border pt-3 space-y-2">
                        <span className="text-xs font-semibold text-muted-foreground">Vendas por Canal</span>
                        {Object.entries(
                          sales.reduce((acc, s) => {
                            const label = getSourceLabel(s.source);
                            acc[label] = (acc[label] || 0) + 1;
                            return acc;
                          }, {} as Record<string, number>)
                        ).map(([channel, count]) => (
                          <div key={channel} className="flex justify-between items-center text-xs">
                            <span className="text-muted-foreground">{channel}</span>
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-20 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary/60 rounded-full"
                                  style={{ width: `${(count / sales.length) * 100}%` }}
                                />
                              </div>
                              <span className="font-medium w-6 text-right">{count}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Lead details modal */}
        {selectedLeadId && (
          <LeadDetailsDialog
            open={!!selectedLeadId}
            onOpenChange={(open) => { if (!open) { setSelectedLeadId(null); setSelectedLeadName(''); } }}
            leadId={selectedLeadId}
            leadName={selectedLeadName}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
