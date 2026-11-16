import { useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/money";
import { getSegmentTerms, type SegmentTerms } from "@/lib/segmentTerms";

export type OverviewPeriod = "today" | "month" | "quarter" | "year";

export interface SalesOverviewData {
  /** Receita das vendas ganhas no período. */
  revenue: number;
  sales: number;
  leads: number;
  attended: number;
  meetingsRealized: number;
  noShow: number;
  proposals: number;
  today: { leads: number; appointments: number; realized: number };
  /** Leads criados por mês, do mais antigo ao atual. */
  monthlyLeads: Array<{ label: string; value: number }>;
  sources: Array<{ name: string; value: number }>;
  team: Array<{ id: string; name: string; sales: number; revenue: number; avatarUrl?: string | null }>;
}

interface SalesOverviewProps {
  data: SalesOverviewData;
  period: OverviewPeriod;
  onPeriodChange: (period: OverviewPeriod) => void;
  onOpenRanking?: () => void;
  /** Mostra o aviso de dados de exemplo (tela de demonstração). */
  isSample?: boolean;
  /** Rótulos do segmento da organização (consórcio troca venda por cota e receita por produção). */
  terms?: SegmentTerms;
}

const PERIODS: Array<{ value: OverviewPeriod; label: string; noun: string }> = [
  { value: "today", label: "Hoje", noun: "hoje" },
  { value: "month", label: "Este mês", noun: "este mês" },
  { value: "quarter", label: "Trimestre", noun: "este trimestre" },
  { value: "year", label: "Ano", noun: "este ano" },
];

const TABS = [
  { value: "vendas", label: "Vendas" },
  { value: "marketing", label: "Marketing" },
  { value: "equipe", label: "Equipe" },
] as const;
type TabValue = (typeof TABS)[number]["value"];

const nf = new Intl.NumberFormat("pt-BR");
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);
const pctLabel = (part: number, whole: number) => {
  const value = pct(part, whole);
  return value === null ? "—" : `${value}%`;
};

function Panel({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-lg border bg-card p-4 sm:p-5", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1.5 whitespace-nowrap text-[22px] font-semibold leading-tight tracking-[-0.02em] tabular-nums text-foreground sm:text-[32px]">
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

/** Barras de uma série só (leads por mês): cor neutra, sem legenda, valor no hover. */
function MonthlyBars({ items }: { items: SalesOverviewData["monthlyLeads"] }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  const last = items.length - 1;
  return (
    <div>
      <div className="flex h-44 items-end gap-2 border-b border-border sm:gap-3" role="list">
        {items.map((item, index) => (
          <div
            key={`${item.label}-${index}`}
            role="listitem"
            aria-label={`${item.label}: ${nf.format(item.value)} leads`}
            className="group relative flex h-full flex-1 flex-col items-center justify-end"
          >
            <span
              className={cn(
                "pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] font-semibold tabular-nums text-background opacity-0 shadow-sm transition-opacity group-hover:opacity-100",
              )}
              style={{ bottom: `calc(${(item.value / max) * 100}% + 6px)` }}
            >
              {item.label}: {nf.format(item.value)}
            </span>
            {index === last && (
              <span
                className="absolute left-1/2 -translate-x-1/2 text-xs font-semibold tabular-nums text-foreground group-hover:opacity-0"
                style={{ bottom: `calc(${(item.value / max) * 100}% + 4px)` }}
              >
                {nf.format(item.value)}
              </span>
            )}
            <div
              className={cn(
                "w-full max-w-[56px] rounded-t-[4px] transition-colors",
                index === last ? "bg-[hsl(var(--chart-1))]" : "bg-[hsl(var(--chart-1)/0.35)] group-hover:bg-[hsl(var(--chart-1)/0.55)]",
              )}
              style={{ height: `${Math.max((item.value / max) * 100, item.value > 0 ? 2 : 0)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2 sm:gap-3">
        {items.map((item, index) => (
          <span key={`${item.label}-l-${index}`} className="flex-1 text-center text-xs capitalize text-muted-foreground">
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function ShareRow({ label, value, total, max, suffix }: { label: string; value: number; total: number; max: number; suffix: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-2.5 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_4.5rem_3rem]">
      <span className="truncate text-sm text-foreground">{label}</span>
      <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-secondary sm:col-span-1 sm:row-auto">
        <div className="h-full rounded-full bg-[hsl(var(--chart-1))]" style={{ width: `${(value / Math.max(max, 1)) * 100}%` }} />
      </div>
      <span className="row-start-1 col-start-2 text-right text-sm font-medium tabular-nums text-foreground sm:row-auto sm:col-auto">
        {nf.format(value)} {suffix}
      </span>
      <span className="hidden text-right text-xs tabular-nums text-muted-foreground sm:block">{pctLabel(value, total)}</span>
    </div>
  );
}

export function SalesOverview({ data, period, onPeriodChange, onOpenRanking, isSample, terms = getSegmentTerms("generico") }: SalesOverviewProps) {
  const [tab, setTab] = useState<TabValue>("vendas");
  const periodNoun = PERIODS.find((p) => p.value === period)?.noun ?? "no período";
  const ticket = data.sales > 0 ? data.revenue / data.sales : 0;
  const meetings = data.meetingsRealized + data.noShow;
  const sourcesTotal = data.sources.reduce((sum, s) => sum + s.value, 0);
  const teamTop = data.team[0]?.revenue ?? 0;

  const steps = [
    { label: "Leads", value: data.leads, rate: null as string | null },
    { label: "Atendidos", value: data.attended, rate: `${pctLabel(data.attended, data.leads)} dos leads` },
    { label: "Reuniões feitas", value: data.meetingsRealized, rate: `${pctLabel(data.meetingsRealized, data.attended)} dos atendidos` },
    { label: "Propostas", value: data.proposals, rate: `${pctLabel(data.proposals, data.meetingsRealized)} das reuniões` },
    { label: terms.sales, value: data.sales, rate: `${pctLabel(data.sales, data.proposals)} das propostas` },
  ];

  return (
    <div className="mx-auto w-full max-w-[1280px] px-1 pb-6 pt-2 sm:px-2 sm:pt-4">
      {/* Cabeçalho: título, período e abas */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-[-0.01em] text-foreground sm:text-2xl">Dashboard</h1>
            {isSample && (
              <span className="rounded-full bg-info-tint px-2 py-0.5 text-[11px] font-semibold text-info">Dados de exemplo</span>
            )}
          </div>
          <p className="text-[13px] text-muted-foreground">Resultados de {periodNoun}</p>
        </div>
        <div className="flex w-full items-center gap-0.5 overflow-x-auto rounded-md border bg-card p-0.5 sm:w-auto" role="group" aria-label="Período">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={period === p.value}
              onClick={() => onPeriodChange(p.value)}
              className={cn(
                "h-7 flex-1 whitespace-nowrap rounded px-3 text-[13px] font-medium transition-colors sm:flex-none",
                period === p.value ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex gap-1 border-b border-border" role="tablist" aria-label="Seções do dashboard">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-[13px] transition-colors",
              tab === t.value ? "border-foreground font-semibold text-foreground" : "border-transparent font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "vendas" && (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi label={terms.revenue} value={formatBRL(data.revenue)} detail={`${nf.format(data.sales)} ${data.sales === 1 ? terms.sale : terms.sales.toLowerCase()} ${periodNoun}`} />
            <Kpi label={terms.sales} value={nf.format(data.sales)} detail={`de ${nf.format(data.leads)} leads`} />
            <Kpi label={terms.averageSale} value={data.sales > 0 ? formatBRL(ticket) : "—"} detail={`${terms.revenue.toLowerCase()} ÷ ${terms.sales.toLowerCase()}`} />
            <Kpi label="Conversão" value={pctLabel(data.sales, data.leads)} detail={`de lead para ${terms.sale}`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Panel title="Funil do período">
              <ol className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {steps.map((step, index) => (
                  <li key={step.label} className={cn("rounded-md bg-secondary p-3", index === steps.length - 1 && "col-span-2 sm:col-span-1")}>
                    <p className="text-xs font-medium text-muted-foreground">{step.label}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{nf.format(step.value)}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{step.rate ?? "entraram no período"}</p>
                  </li>
                ))}
              </ol>
            </Panel>

            <Panel title="Hoje">
              <dl className="divide-y divide-border">
                {[
                  { label: "Leads novos", value: nf.format(data.today.leads) },
                  { label: "Reuniões marcadas", value: nf.format(data.today.appointments) },
                  { label: "Reuniões feitas", value: `${nf.format(data.today.realized)} de ${nf.format(data.today.appointments)}` },
                  {
                    label: "Faltas no período",
                    value: meetings > 0 ? `${nf.format(data.noShow)} (${pctLabel(data.noShow, meetings)})` : nf.format(data.noShow),
                  },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <dt className="text-sm text-muted-foreground">{row.label}</dt>
                    <dd className="text-sm font-semibold tabular-nums text-foreground">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
          </div>

          <Panel title="Leads por mês">
            <MonthlyBars items={data.monthlyLeads} />
          </Panel>
        </div>
      )}

      {tab === "marketing" && (
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Panel title="Origem dos leads">
            {data.sources.length > 0 ? (
              <div className="divide-y divide-border">
                {data.sources.slice(0, 8).map((source) => (
                  <ShareRow
                    key={source.name}
                    label={source.name === "Facebook Leads" ? "Meta Ads" : source.name}
                    value={source.value}
                    total={sourcesTotal}
                    max={data.sources[0]?.value ?? 1}
                    suffix={source.value === 1 ? "lead" : "leads"}
                  />
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhum lead entrou {periodNoun}.</p>
            )}
          </Panel>
          <Panel title="Leads por mês">
            <MonthlyBars items={data.monthlyLeads} />
          </Panel>
        </div>
      )}

      {tab === "equipe" && (
        <div className="mt-5">
          <Panel
            title="Vendas por vendedor"
            action={
              onOpenRanking && (
                <button type="button" onClick={onOpenRanking} className="inline-flex items-center gap-1 text-[13px] font-medium text-foreground/80 hover:text-foreground">
                  Ver ranking completo
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )
            }
          >
            {data.team.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="w-8 pb-2 font-medium">#</th>
                    <th className="pb-2 font-medium">Vendedor</th>
                    <th className="pb-2 text-right font-medium">{terms.sales}</th>
                    <th className="pb-2 text-right font-medium">{terms.revenue === "Produção" ? "Produção" : "Receita"}</th>
                    <th className="hidden w-[30%] pb-2 pl-4 font-medium sm:table-cell">
                      <span className="sr-only">Participação</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.team.map((member, index) => (
                    <tr key={member.id}>
                      <td className="py-2.5 text-muted-foreground">{index + 1}</td>
                      <td className="py-2.5">
                        <div className="flex min-w-0 items-center gap-2">
                          {member.avatarUrl ? (
                            <img src={member.avatarUrl} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
                          ) : (
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-muted-foreground" aria-hidden="true">
                              {member.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                          <span className="truncate font-medium text-foreground">{member.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{nf.format(member.sales)}</td>
                      <td className="py-2.5 text-right font-medium tabular-nums">{formatBRL(member.revenue)}</td>
                      <td className="hidden py-2.5 pl-4 sm:table-cell">
                        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                          <div className="h-full rounded-full bg-[hsl(var(--chart-1))]" style={{ width: `${(member.revenue / Math.max(teamTop, 1)) * 100}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma venda {periodNoun}.</p>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
