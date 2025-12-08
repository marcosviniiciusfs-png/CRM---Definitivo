import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface SourceData {
  name: string;
  value: number;
  color: string;
}

interface WonBySourceProps {
  data: SourceData[];
  totalValue: number;
  isLoading?: boolean;
}

const SOURCE_COLORS: { [key: string]: string } = {
  "WhatsApp": "#25D366",
  "Facebook": "#1877F2",
  "Webhook": "#8B5CF6",
  "Manual": "#6B7280",
  "Importação": "#F59E0B",
  "Outro": "#94A3B8",
};

export function WonBySource({ data, totalValue, isLoading }: WonBySourceProps) {
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
          <CardTitle className="text-sm font-medium text-muted-foreground">Vendas por Fonte</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center">
          <div className="animate-pulse h-32 w-32 rounded-full bg-muted" />
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map(item => ({
    ...item,
    color: SOURCE_COLORS[item.name] || SOURCE_COLORS["Outro"],
  }));

  return (
    <Card className="h-full">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">Vendas por Fonte</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {data.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
            Nenhum dado disponível
          </div>
        ) : (
          <div className="h-[200px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="45%"
                  innerRadius={40}
                  outerRadius={65}
                  dataKey="value"
                  stroke="none"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), "Valor"]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend 
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value) => <span className="text-xs">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ top: "-20px" }}>
              <div className="text-center">
                <p className="text-lg font-bold">{formatCurrency(totalValue)}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
