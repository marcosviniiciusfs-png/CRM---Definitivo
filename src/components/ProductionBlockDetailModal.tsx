import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DollarSign, TrendingUp, MessageSquare, Globe } from "lucide-react";
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
  source: string;
  valor: number;
  data_conclusao: string;
  responsavel: string;
}

interface ProductionBlockDetailModalProps {
  block: ProductionBlock;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductionBlockDetailModal({
  block,
  open,
  onOpenChange,
}: ProductionBlockDetailModalProps) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadSalesDetails();
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
        .single();

      if (!memberData) return;

      const startDate = new Date(block.year, block.month - 1, 1);
      const endDate = new Date(block.year, block.month, 0, 23, 59, 59);

      const { data, error } = await supabase
        .from("leads")
        .select(`
          id,
          nome_lead,
          source,
          valor,
          data_conclusao,
          responsavel,
          funnel_stages(stage_type)
        `)
        .eq("organization_id", memberData.organization_id)
        .gte("data_conclusao", startDate.toISOString())
        .lte("data_conclusao", endDate.toISOString());

      if (error) throw error;

      // Filter only won leads
      const wonSales = data?.filter(s => s.funnel_stages?.stage_type === 'won') || [];
      setSales(wonSales as Sale[]);

    } catch (error: any) {
      toast({
        title: "Erro ao carregar detalhes",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getSourceIcon = (source: string) => {
    const lowerSource = source?.toLowerCase() || '';
    if (lowerSource.includes('whatsapp')) {
      return <MessageSquare className="h-4 w-4 text-green-600" />;
    }
    if (lowerSource.includes('facebook')) {
      return <span className="text-blue-600 font-bold text-sm">f</span>;
    }
    if (lowerSource.includes('webhook') || lowerSource.includes('url')) {
      return <Globe className="h-4 w-4 text-muted-foreground" />;
    }
    return <span className="text-muted-foreground text-xs">✏️</span>;
  };

  const getSourceLabel = (source: string) => {
    const lowerSource = source?.toLowerCase() || '';
    if (lowerSource.includes('whatsapp')) return 'WhatsApp';
    if (lowerSource.includes('facebook')) return 'Facebook';
    if (lowerSource.includes('webhook') || lowerSource.includes('url')) return 'Webhook';
    return 'Manual';
  };

  const monthName = format(new Date(block.year, block.month - 1), "MMMM yyyy", { locale: ptBR });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="capitalize text-2xl">
            📅 {monthName} - Detalhes de Produção
          </DialogTitle>
        </DialogHeader>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <DollarSign className="h-8 w-8 text-green-600" />
                <div>
                  <p className="text-sm text-muted-foreground">Receita</p>
                  <p className="text-lg font-bold">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(block.total_revenue)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Lucro</p>
                  <p className="text-lg font-bold text-primary">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(block.total_profit)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2">vs Mês Anterior</p>
                {block.profit_change_percentage !== null ? (
                  <Badge 
                    variant={block.profit_change_percentage >= 0 ? "default" : "destructive"}
                    className="text-sm"
                  >
                    {block.profit_change_percentage > 0 ? '+' : ''}
                    {block.profit_change_percentage.toFixed(1)}%
                  </Badge>
                ) : (
                  <Badge variant="secondary">N/A</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sales Table */}
        <div>
          <h3 className="text-lg font-semibold mb-4">
            Vendas do Mês ({block.total_sales} vendas)
          </h3>

          {loading ? (
            <div className="flex justify-center py-8">
              <LoadingAnimation />
            </div>
          ) : sales.length > 0 ? (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Responsável</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell className="font-medium">{sale.nome_lead}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getSourceIcon(sale.source)}
                          <span className="text-sm">{getSourceLabel(sale.source)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(sale.valor)}
                      </TableCell>
                      <TableCell>
                        {sale.data_conclusao ? format(new Date(sale.data_conclusao), "dd/MM/yyyy", { locale: ptBR }) : '-'}
                      </TableCell>
                      <TableCell>{sale.responsavel || '-'}</TableCell>
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
