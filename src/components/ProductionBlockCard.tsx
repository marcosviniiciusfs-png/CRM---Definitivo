import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, DollarSign, ShoppingBag, TrendingUpIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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

interface ProductionBlockCardProps {
  block: ProductionBlock;
  isCurrent?: boolean;
  onClick?: () => void;
}

export function ProductionBlockCard({ block, isCurrent, onClick }: ProductionBlockCardProps) {
  const monthName = format(new Date(block.year, block.month - 1), "MMMM yyyy", { locale: ptBR });
  
  const getTrendIcon = () => {
    if (!block.profit_change_percentage) return <Minus className="h-4 w-4" />;
    if (block.profit_change_percentage > 0) return <TrendingUp className="h-4 w-4" />;
    if (block.profit_change_percentage < 0) return <TrendingDown className="h-4 w-4" />;
    return <Minus className="h-4 w-4" />;
  };

  const getTrendColor = () => {
    if (!block.profit_change_percentage) return "text-muted-foreground";
    if (block.profit_change_percentage > 0) return "text-green-600";
    if (block.profit_change_percentage < 0) return "text-red-600";
    return "text-muted-foreground";
  };

  const getTrendBadgeVariant = () => {
    if (!block.profit_change_percentage) return "secondary";
    if (block.profit_change_percentage > 0) return "default";
    if (block.profit_change_percentage < 0) return "destructive";
    return "secondary";
  };

  return (
    <Card 
      className="transition-all duration-300 hover:shadow-lg hover:scale-105 cursor-pointer group"
      onClick={onClick}
    >
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold capitalize text-foreground/90">{monthName}</h3>
          {isCurrent && (
            <Badge variant="default" className="text-xs px-2 py-0">
              Atual
            </Badge>
          )}
        </div>

        {/* Metrics Grid */}
        <div className="space-y-2">
          {/* Sales */}
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30 transition-colors group-hover:bg-muted/50">
            <div className="p-1.5 rounded-md bg-blue-500/10">
              <ShoppingBag className="h-3.5 w-3.5 text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Vendas</p>
              <p className="text-sm font-bold">{block.total_sales}</p>
            </div>
          </div>

          {/* Revenue */}
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/30 transition-colors group-hover:bg-muted/50">
            <div className="p-1.5 rounded-md bg-green-500/10">
              <DollarSign className="h-3.5 w-3.5 text-green-600" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Receita</p>
              <p className="text-sm font-bold">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(block.total_revenue)}
              </p>
            </div>
          </div>

          {/* Profit */}
          <div className="flex items-center gap-2 p-2 rounded-md bg-primary/5 transition-colors group-hover:bg-primary/10">
            <div className="p-1.5 rounded-md bg-primary/10">
              <TrendingUpIcon className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Lucro</p>
              <p className="text-sm font-bold text-primary">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(block.total_profit)}
              </p>
            </div>
          </div>
        </div>

        {/* Trend Badge */}
        {block.profit_change_percentage !== null && (
          <div className="mt-3 pt-3 border-t">
            <div className={`flex items-center justify-center gap-1.5 text-xs font-medium ${getTrendColor()}`}>
              {getTrendIcon()}
              <span>
                {block.profit_change_percentage > 0 ? '+' : ''}
                {block.profit_change_percentage.toFixed(1)}%
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
