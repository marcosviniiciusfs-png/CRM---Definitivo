import { Activity, CalendarDays, DollarSign, MessageCircle, PhoneCall, TrendingUp, Users } from "lucide-react";

const metrics = [
  { label: "Leads no mês", value: "284", detail: "+18% vs. mês anterior", icon: Users, tone: "text-blue-500" },
  { label: "Atendidos", value: "213", detail: "75% da base captada", icon: PhoneCall, tone: "text-emerald-500" },
  { label: "Reuniões", value: "47", detail: "12 marcadas para hoje", icon: CalendarDays, tone: "text-amber-500" },
  { label: "Receita prevista", value: "R$ 186k", detail: "pipeline ponderado", icon: DollarSign, tone: "text-red-500" },
];

const stages = [
  { name: "Novo lead", count: 42, color: "bg-blue-500", leads: ["Ana Paula", "Bruno Martins", "Clínica Sul"] },
  { name: "Qualificação", count: 31, color: "bg-cyan-500", leads: ["Marina Costa", "Grupo Alfa", "Rafael Lima"] },
  { name: "Reunião", count: 18, color: "bg-amber-500", leads: ["Construtora Vértice", "Dra. Helena", "Studio Norte"] },
  { name: "Proposta", count: 12, color: "bg-violet-500", leads: ["Lucas Ferreira", "Rede Prime", "Camila Rocha"] },
  { name: "Venda", count: 7, color: "bg-emerald-500", leads: ["Omega Fit", "Hurtz Company", "Nova Saúde"] },
];

const activities = [
  "Marina Costa respondeu no WhatsApp há 3 min",
  "Reunião de Bruno Martins confirmada para 15:30",
  "Proposta de R$ 24.900 enviada para Rede Prime",
  "Lead Clínica Sul movido para Qualificação",
];

export default function DemoDashboard() {
  return (
    <div className="min-h-full bg-secondary/40 dark:bg-background px-2 pb-2 pt-0 sm:px-3 sm:pb-3 sm:pt-0" style={{ fontFamily: "'Syne', sans-serif" }}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 inline-flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground">
            <Activity className="h-3.5 w-3.5 text-primary" />
            Demo local já logada
          </div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Dashboard Comercial</h1>
          <p className="text-sm text-muted-foreground">Exemplo com dados fictícios para validar layout, topo e navegação.</p>
        </div>
        <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm">
          <TrendingUp className="h-4 w-4 text-emerald-500" />
          <span className="font-semibold">Meta 68%</span>
          <span className="text-muted-foreground">R$ 186k / R$ 275k</span>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{metric.label}</span>
              <metric.icon className={`h-4 w-4 ${metric.tone}`} />
            </div>
            <div className="text-2xl font-bold text-foreground">{metric.value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{metric.detail}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        <section className="min-w-0 rounded-lg border bg-card p-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Funil de vendas</h2>
              <p className="text-xs text-muted-foreground">Prévia compacta do quadro para avaliar o espaço superior.</p>
            </div>
            <button className="rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
              Funil demo
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
            {stages.map((stage) => (
              <div key={stage.name} className="min-h-[360px] rounded-lg border bg-background p-2">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${stage.color}`} />
                    <h3 className="truncate text-sm font-semibold">{stage.name}</h3>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{stage.count}</span>
                </div>
                <div className="space-y-2">
                  {stage.leads.map((lead, index) => (
                    <article key={lead} className="rounded-md border bg-card p-3 shadow-sm">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{lead}</p>
                        <span className="text-[11px] text-muted-foreground">{index + 1}h</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <MessageCircle className="h-3.5 w-3.5" />
                        WhatsApp ativo
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="rounded-lg border bg-card p-4">
          <h2 className="mb-1 text-sm font-semibold text-foreground">Atividade recente</h2>
          <p className="mb-4 text-xs text-muted-foreground">Eventos fictícios para preencher a visualização autenticada.</p>
          <div className="space-y-3">
            {activities.map((activity) => (
              <div key={activity} className="rounded-md border bg-background p-3 text-sm text-foreground">
                {activity}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
