import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, Clock } from "lucide-react";

interface SoldThisMonthProps {
  totalSold: number;
  salesCount: number;
  pendingActivities: number;
  isLoading?: boolean;
}

export function SoldThisMonth({ totalSold, salesCount, pendingActivities, isLoading }: SoldThisMonthProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (isLoading) {
    return (
      <Card className="h-full bg-teal-600 text-white">
        <CardContent className="pt-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-32 bg-white/20 rounded" />
            <div className="h-10 w-40 bg-white/20 rounded" />
            <div className="h-16 bg-white/10 rounded mt-4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full bg-gradient-to-br from-teal-600 to-teal-700 text-white border-0 shadow-lg">
      <CardContent className="pt-6 h-full flex flex-col">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="h-5 w-5" />
          <span className="text-sm font-medium opacity-90">Vendido Este Mês</span>
        </div>
        <div className="text-3xl font-bold mb-1">
          {formatCurrency(totalSold)}
        </div>
        <p className="text-sm opacity-80 mb-4">
          {salesCount} {salesCount === 1 ? "venda realizada" : "vendas realizadas"}
        </p>
        
        <div className="mt-auto bg-white/10 rounded-lg p-3 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span className="text-sm">Atividades Pendentes</span>
            </div>
            <span className="text-xl font-bold">{pendingActivities}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
