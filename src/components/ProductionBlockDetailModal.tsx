import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
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
import { DollarSign, TrendingUp, MessageSquare, Globe, Plus, Trash2, Receipt, Phone } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LoadingAnimation } from "./LoadingAnimation";

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

export function ProductionBlockDetailModal({ block, open, onOpenChange, onBlockUpdated }: ProductionBlockDetailModalProps) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [newExpense, setNewExpense] = useState({ category: "other", description: "", amount: "" });
  const [addingExpense, setAddingExpense] = useState(false);
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

      const startDate = new Date(block.year, block.month - 1, 1);
      const endDate = new Date(block.year, block.month, 0, 23, 59, 59);

      const { data, error } = await supabase
        .from("leads")
        .select("id, nome_lead, telefone_lead, source, valor, data_conclusao, responsavel, funnel_stages(stage_type)")
        .eq("organization_id", memberData.organization_id)
        .gte("data_conclusao", startDate.toISOString())
        .lte("data_conclusao", endDate.toISOString());

      if (error) throw error;
      const wonSales = data?.filter(s => (s.funnel_stages as any)?.stage_type === 'won') || [];
      setSales(wonSales as Sale[]);
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

  const getSourceIcon = (source: string) => {
    const lower = source?.toLowerCase() || '';
    if (lower.includes('whatsapp')) return <MessageSquare className="h-4 w-4 text-green-600" />;
    if (lower.includes('facebook')) return <span className="text-blue-600 font-bold text-sm">f</span>;
    if (lower.includes('webhook') || lower.includes('url')) return <Globe className="h-4 w-4 text-muted-foreground" />;
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
  const monthName = format(new Date(block.year, block.month - 1), "MMMM yyyy", { locale: ptBR });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="capitalize text-2xl">📅 {monthName} - Detalhes de Produção</DialogTitle>
        </DialogHeader>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <DollarSign className="h-7 w-7 text-green-600 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Faturamento</p>
                  <p className="text-base font-bold">{fmt(block.total_revenue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Receipt className="h-7 w-7 text-orange-600 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Despesas</p>
                  <p className="text-base font-bold text-orange-600">{fmt(totalExpenses)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-7 w-7 text-primary shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Lucro</p>
                  <p className={`text-base font-bold ${realProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(realProfit)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-2">vs Mês Anterior</p>
              {block.profit_change_percentage !== null ? (
                <Badge variant={block.profit_change_percentage >= 0 ? "default" : "destructive"} className="text-sm">
                  {block.profit_change_percentage > 0 ? '+' : ''}{block.profit_change_percentage.toFixed(1)}%
                </Badge>
              ) : (
                <Badge variant="secondary">N/A</Badge>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Expenses Section - visible to all, editable by admins */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Receipt className="h-5 w-5" /> Despesas Operacionais
          </h3>

          {isAdmin && (
            <div className="flex gap-2 mb-3">
              <Select value={newExpense.category} onValueChange={(v) => setNewExpense(p => ({ ...p, category: v }))}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Descrição"
                value={newExpense.description}
                onChange={(e) => setNewExpense(p => ({ ...p, description: e.target.value }))}
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && handleAddExpense()}
              />
              <Input
                type="number"
                placeholder="Valor (R$)"
                value={newExpense.amount}
                onChange={(e) => setNewExpense(p => ({ ...p, amount: e.target.value }))}
                className="w-[130px]"
                onKeyDown={(e) => e.key === 'Enter' && handleAddExpense()}
              />
              <Button onClick={handleAddExpense} disabled={addingExpense} size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}

          {expenses.length > 0 ? (
            <div className="border rounded-lg max-h-[200px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    {isAdmin && <TableHead className="w-10"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((exp) => (
                    <TableRow key={exp.id}>
                      <TableCell>
                        <Badge variant="secondary">{EXPENSE_CATEGORIES.find(c => c.value === exp.category)?.label || exp.category}</Badge>
                      </TableCell>
                      <TableCell>{exp.description}</TableCell>
                      <TableCell className="text-right font-semibold text-orange-600">{fmt(Number(exp.amount))}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          <button onClick={() => handleDeleteExpense(exp.id)} className="text-destructive hover:text-destructive/80">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-4 bg-muted/20 rounded-lg">
              <p className="text-sm text-muted-foreground">Nenhuma despesa registrada neste período</p>
            </div>
          )}
        </div>

        {/* Sales Table */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Vendas do Mês ({sales.length} vendas)</h3>
          {loading ? (
            <div className="flex justify-center py-8"><LoadingAnimation /></div>
          ) : sales.length > 0 ? (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" />
                        Telefone
                      </div>
                    </TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell className="font-medium">{sale.nome_lead}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{sale.telefone_lead || '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getSourceIcon(sale.source)}
                          <span className="text-sm">{getSourceLabel(sale.source)}</span>
                        </div>
                      </TableCell>
                      <TableCell>{sale.responsavel || '-'}</TableCell>
                      <TableCell>
                        {sale.data_conclusao
                          ? format(new Date(sale.data_conclusao), "dd/MM/yyyy HH:mm", { locale: ptBR })
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-600">{fmt(sale.valor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 bg-muted/20 rounded-lg">
              <p className="text-muted-foreground">Nenhuma venda encontrada neste período</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
