import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

interface SalesGaugeProps {
  current: number;
  target: number;
  label?: string;
  isLoading?: boolean;
}

export function SalesGauge({ current, target, label = "Meta Atingida", isLoading }: SalesGaugeProps) {
  const percentage = target > 0 ? Math.min(Math.round((current / target) * 100), 100) : 0;
  
  // Data for semicircle gauge
  const gaugeData = [
    { value: percentage, color: percentage >= 100 ? "#10b981" : percentage >= 60 ? "#f59e0b" : "#ef4444" },
    { value: 100 - percentage, color: "hsl(var(--muted))" },
  ];

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
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center">
          <div className="animate-pulse bg-muted h-24 w-48 rounded-t-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center pt-0">
        <div className="relative w-full h-[120px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={gaugeData}
                cx="50%"
                cy="100%"
                startAngle={180}
                endAngle={0}
                innerRadius="60%"
                outerRadius="90%"
                dataKey="value"
                stroke="none"
              >
                {gaugeData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-end pb-2">
            <span className="text-3xl font-bold">{percentage}%</span>
          </div>
        </div>
        <div className="flex flex-col items-center mt-2 text-center">
          <span className="text-sm text-muted-foreground">
            {formatCurrency(current)} / {formatCurrency(target)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
