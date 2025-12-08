import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
interface SalesGaugeProps {
  current: number;
  target: number;
  label?: string;
  isLoading?: boolean;
}
export function SalesGauge({
  current,
  target,
  label = "Meta Atingida",
  isLoading
}: SalesGaugeProps) {
  const percentage = target > 0 ? Math.min(Math.round(current / target * 100), 100) : 0;

  // Data for semicircle gauge
  const gaugeData = [{
    value: percentage,
    color: percentage >= 100 ? "#10b981" : percentage >= 60 ? "#f59e0b" : "#ef4444"
  }, {
    value: 100 - percentage,
    color: "hsl(var(--muted))"
  }];
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };
  if (isLoading) {
    return <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center">
          <div className="animate-pulse bg-muted h-24 w-48 rounded-t-full" />
        </CardContent>
      </Card>;
  }
  return <Card className="h-full">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center pt-4 pb-2">
        <div className="relative w-full h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={gaugeData} cx="50%" cy="70%" startAngle={180} endAngle={0} innerRadius={60} outerRadius={100} dataKey="value" stroke="none">
                {gaugeData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-x-0 bottom-12 flex flex-col items-center">
            <span className="text-2xl font-bold tabular-nums my-[25px]">{percentage}%</span>
          </div>
        </div>
        <div className="flex items-center justify-center gap-1 mt-3 text-sm text-muted-foreground tabular-nums">
          <span>{formatCurrency(current)}</span>
          <span>/</span>
          <span>{formatCurrency(target)}</span>
        </div>
      </CardContent>
    </Card>;
}