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
  const remaining = totalValue - currentValue;
  
  const goalData = [
    { name: "Atingido", value: currentValue, fill: "url(#goalGradient)" },
    { name: "Restante", value: remaining, fill: "hsl(0, 0%, 90%)" },
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
                  <defs>
                    <linearGradient id="goalGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#00aaff" />
                      <stop offset="100%" stopColor="#00ff00" />
                    </linearGradient>
                  </defs>
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
                    cornerRadius={10}
                  >
                    {goalData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} stroke="none" />
                    ))}
                  </Pie>
                  {/* Marcadores internos - linhas brancas/pretas dentro da barra */}
                  <line x1="35%" y1="32%" x2="38%" y2="38%" stroke="rgba(0,0,0,0.3)" strokeWidth="2" />
                  <line x1="50%" y1="15%" x2="50%" y2="20%" stroke="rgba(0,0,0,0.3)" strokeWidth="2" />
                  <line x1="65%" y1="32%" x2="62%" y2="38%" stroke="rgba(0,0,0,0.3)" strokeWidth="2" />
                </PieChart>
              </ResponsiveContainer>
              
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
