import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
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
      className="transition-all duration-300 hover:shadow-lg cursor-pointer"
      onClick={onClick}
    >
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold capitalize">{monthName}</h3>
            {isCurrent && (
              <Badge variant="default" className="mt-1">
                Atual
              </Badge>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Vendas</span>
            <span className="font-semibold">{block.total_sales}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Receita</span>
            <span className="font-semibold">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(block.total_revenue)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Lucro</span>
            <span className="font-semibold text-primary">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(block.total_profit)}
            </span>
          </div>

          {block.profit_change_percentage !== null && (
            <div className="pt-3 border-t">
              <Badge variant={getTrendBadgeVariant()} className="w-full justify-center gap-2">
                {getTrendIcon()}
                <span>
                  {block.profit_change_percentage > 0 ? '+' : ''}
                  {block.profit_change_percentage.toFixed(1)}%
                  {' '}
                  ({block.profit_change_value > 0 ? '+' : ''}
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(block.profit_change_value)})
                </span>
              </Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
