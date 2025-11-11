import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Users, FileText, TrendingUp, Target, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

const revenueData = [
  { month: "Jan", receita: 45000, meta: 50000 },
  { month: "Fev", receita: 52000, meta: 50000 },
  { month: "Mar", receita: 48000, meta: 50000 },
  { month: "Abr", receita: 61000, meta: 55000 },
  { month: "Mai", receita: 58000, meta: 55000 },
  { month: "Jun", receita: 67000, meta: 60000 },
];

const pipelineData = [
  { stage: "Novo Lead", count: 24 },
  { stage: "Qualificação", count: 18 },
  { stage: "Proposta", count: 12 },
  { stage: "Negociação", count: 8 },
  { stage: "Fechado", count: 15 },
];

const Dashboard = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral da performance de vendas</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Leads Ativos"
          value="87"
          icon={Users}
          trend={{ value: "12% vs mês anterior", positive: true }}
        />
        <MetricCard
          title="Propostas Enviadas"
          value="23"
          icon={FileText}
          subtitle="Este mês"
        />
        <MetricCard
          title="Taxa de Conversão"
          value="32%"
          icon={TrendingUp}
          trend={{ value: "5% vs mês anterior", positive: true }}
        />
        <MetricCard
          title="Receita Total"
          value="R$ 456.8k"
          icon={DollarSign}
          trend={{ value: "8% vs mês anterior", positive: true }}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Receita vs Meta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip />
                <Line type="monotone" dataKey="receita" stroke="hsl(var(--primary))" strokeWidth={2} name="Receita" />
                <Line type="monotone" dataKey="meta" stroke="hsl(var(--muted-foreground))" strokeWidth={2} strokeDasharray="5 5" name="Meta" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Distribuição do Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={pipelineData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="stage" className="text-xs" angle={-45} textAnchor="end" height={80} />
                <YAxis className="text-xs" />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" name="Leads" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Atividades Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[
              { name: "João Silva", action: "moveu para Negociação", time: "há 5 minutos", value: "R$ 45.000" },
              { name: "Maria Santos", action: "criou novo lead", time: "há 15 minutos", value: "R$ 12.000" },
              { name: "Pedro Costa", action: "enviou proposta", time: "há 1 hora", value: "R$ 28.500" },
              { name: "Ana Oliveira", action: "fechou negócio", time: "há 2 horas", value: "R$ 67.000" },
            ].map((activity, i) => (
              <div key={i} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {activity.name} <span className="text-muted-foreground font-normal">{activity.action}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{activity.time}</p>
                </div>
                <div className="text-sm font-semibold text-primary">{activity.value}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
