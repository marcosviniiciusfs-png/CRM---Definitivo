import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users, FileText, CheckSquare, List, AlertCircle } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from "recharts";

const leadSourceData = [
  { month: "Jan", emailMarketing: 1200, api: 50, vendaLeads: 5 },
  { month: "Fev", emailMarketing: 1800, api: 80, vendaLeads: 8 },
  { month: "Mar", emailMarketing: 2400, api: 120, vendaLeads: 12 },
  { month: "Apr", emailMarketing: 3200, api: 180, vendaLeads: 15 },
  { month: "Mai", emailMarketing: 4500, api: 220, vendaLeads: 18 },
  { month: "Jun", emailMarketing: 5200, api: 260, vendaLeads: 20 },
  { month: "Jul", emailMarketing: 6100, api: 280, vendaLeads: 22 },
  { month: "Ago", emailMarketing: 6800, api: 300, vendaLeads: 23 },
  { month: "Set", emailMarketing: 7200, api: 315, vendaLeads: 24 },
  { month: "Oct", emailMarketing: 7896, api: 325, vendaLeads: 24 },
];

const Dashboard = () => {
  const currentValue = 7580;
  const totalValue = 8000;
  const percentage = (currentValue / totalValue) * 100;
  
  // Calcular segmentos com cores progressivas
  const segment33 = totalValue * 0.33; // 2640
  const segment66 = totalValue * 0.33; // 2640
  const segment95 = currentValue - (segment33 + segment66); // até o valor atual (2300)
  const remaining = totalValue - currentValue; // 420
  
  const goalData = [
    { name: "0-33%", value: segment33, fill: "#c21b12" }, // Vermelho
    { name: "33-66%", value: segment66, fill: "#fdca49" }, // Amarelo
    { name: "66-95%", value: segment95, fill: "#aaff00" }, // Verde
    { name: "Restante", value: remaining, fill: "hsl(0, 0%, 90%)" }, // Cinza
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <MetricCard
          title="Novos Leads"
          value="7089"
          icon={TrendingUp}
          iconColor="text-cyan-500"
        />
        <MetricCard
          title="Novos Clientes"
          value="65"
          icon={Users}
          iconColor="text-green-500"
        />
        <MetricCard
          title="Faturas Enviadas"
          value="628"
          icon={FileText}
          iconColor="text-slate-400"
        />
        <MetricCard
          title="Tarefas Atuais"
          value="5"
          icon={CheckSquare}
          iconColor="text-purple-500"
        />
        <MetricCard
          title="Tarefas de Leads"
          value="120"
          icon={List}
          iconColor="text-orange-400"
        />
        <MetricCard
          title="Tarefas Atrasadas"
          value="48"
          icon={AlertCircle}
          iconColor="text-red-500"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Metas</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center pb-8 pt-4">
            <div className="relative w-full max-w-[320px] h-[200px]">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={goalData}
                    cx="50%"
                    cy="85%"
                    startAngle={180}
                    endAngle={0}
                    innerRadius={85}
                    outerRadius={105}
                    paddingAngle={0}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {goalData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} stroke="none" />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              
              {/* Marcadores (traços pretos) nos pontos de mudança de cor */}
              {/* Marcador 33% */}
              <div className="absolute left-[22%] top-[32%] w-[3px] h-[20px] bg-black origin-bottom" 
                   style={{ transform: 'rotate(-60deg)' }} />
              
              {/* Marcador 66% */}
              <div className="absolute left-[50%] top-[1%] w-[3px] h-[20px] bg-black origin-bottom -translate-x-1/2" />
              
              {/* Marcador 100% */}
              <div className="absolute right-[22%] top-[32%] w-[3px] h-[20px] bg-black origin-bottom" 
                   style={{ transform: 'rotate(60deg)' }} />
              
              {/* Valor central */}
              <div className="absolute inset-0 flex flex-col items-center justify-end pb-8">
                <p className="text-3xl font-bold">R${currentValue}</p>
                <p className="text-sm text-muted-foreground">de R${totalValue}</p>
                <p className="text-xs text-muted-foreground mt-1">{percentage.toFixed(0)}% concluído</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Fonte de Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">E-mail Marketing</span>
                  <span className="text-sm font-semibold">7896</span>
                </div>
                <ResponsiveContainer width="100%" height={60}>
                  <LineChart data={leadSourceData}>
                    <Line 
                      type="monotone" 
                      dataKey="emailMarketing" 
                      stroke="hsl(180, 70%, 45%)" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>Jan</span>
                  <span>Apr</span>
                  <span>Jul</span>
                  <span>Oct</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">API</span>
                  <span className="text-sm font-semibold">325</span>
                </div>
                <ResponsiveContainer width="100%" height={60}>
                  <LineChart data={leadSourceData}>
                    <Line 
                      type="monotone" 
                      dataKey="api" 
                      stroke="hsl(180, 70%, 45%)" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>Jan</span>
                  <span>Apr</span>
                  <span>Jul</span>
                  <span>Oct</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">Venda de Leads</span>
                  <span className="text-sm font-semibold">24</span>
                </div>
                <ResponsiveContainer width="100%" height={60}>
                  <LineChart data={leadSourceData}>
                    <Line 
                      type="monotone" 
                      dataKey="vendaLeads" 
                      stroke="hsl(0, 0%, 40%)" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>Jan</span>
                  <span>Apr</span>
                  <span>Jul</span>
                  <span>Oct</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
