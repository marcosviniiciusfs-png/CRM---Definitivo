import { useEffect, useMemo, useState } from "react";
import { Lightbulb, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/money";
import { formatDuration, formatRate } from "@/lib/attendance";
import {
  INTEL_PRESETS,
  buildInsights,
  buildSteps,
  presetRange,
  stalledTotal,
  winRate,
  type IntelPreset,
} from "@/lib/funnelIntel";
import { useFunnelIntelligence, useFunnels } from "@/hooks/useFunnelIntelligence";
import { usePermissions } from "@/hooks/usePermissions";
import { isDemoRoute } from "@/lib/demoMode";

const nf = new Intl.NumberFormat("pt-BR");

function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-[28px] font-semibold leading-tight tracking-[-0.02em] tabular-nums text-foreground sm:text-[32px]">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export default function Inteligencia() {
  const permissions = usePermissions();
  const allowed = isDemoRoute() || permissions.role === "owner" || permissions.role === "admin";
  const [preset, setPreset] = useState<IntelPreset>("30d");
  const [funnelId, setFunnelId] = useState<string | null>(null);
  const range = useMemo(() => presetRange(preset), [preset]);

  const funnelsQuery = useFunnels();
  const funnels = funnelsQuery.data ?? [];
  useEffect(() => {
    if (!funnelId && funnels.length > 0) setFunnelId(funnels[0].id);
  }, [funnels, funnelId]);

  const { data: intel, isLoading, isError, error } = useFunnelIntelligence(allowed ? funnelId : null, range);
  useEffect(() => {
    if (error) console.error("[inteligencia] erro ao carregar:", error);
  }, [error]);
  const reason = (error as { message?: string } | null)?.message ?? (funnelsQuery.error as { message?: string } | null)?.message ?? null;
  const steps = useMemo(() => (intel ? buildSteps(intel) : []), [intel]);
  const insights = useMemo(() => (intel ? buildInsights(intel) : []), [intel]);
  const losses = useMemo(() => (intel ? intel.stages.filter((s) => s.lost_here > 0).sort((a, b) => b.lost_here - a.lost_here) : []), [intel]);
  const stalledStages = useMemo(() => (intel ? intel.stages.filter((s) => !s.is_final && s.stalled > 0).sort((a, b) => b.stalled - a.stalled) : []), [intel]);

  if (!allowed) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-2 px-4 py-16 text-center">
        <ShieldAlert className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-lg font-semibold text-foreground">Acesso restrito</h1>
        <p className="text-sm text-muted-foreground">A inteligência comercial é só para o dono e os administradores da organização.</p>
      </div>
    );
  }

  const leads = intel?.totals.leads ?? 0;
  const maxReached = Math.max(1, ...steps.map((s) => s.stage.reached));

  return (
    <div className="mx-auto w-full max-w-[1280px] px-1 pb-8 pt-2 sm:px-2 sm:pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-[-0.01em] text-foreground sm:text-2xl">Inteligência comercial</h1>
            {isDemoRoute() && <span className="rounded-full bg-info-tint px-2 py-0.5 text-[11px] font-semibold text-info">Dados de exemplo</span>}
          </div>
          <p className="text-[13px] text-muted-foreground">Funil e conversão dos leads que entraram no período</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {funnels.length > 1 && (
            <select
              value={funnelId ?? ""}
              onChange={(e) => setFunnelId(e.target.value)}
              className="h-8 rounded-md border bg-card px-2 text-[13px] text-foreground"
              aria-label="Funil"
            >
              {funnels.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
          <div className="flex items-center gap-0.5 rounded-md border bg-card p-0.5" role="group" aria-label="Período">
            {INTEL_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                aria-pressed={preset === p.key}
                onClick={() => setPreset(p.key)}
                className={cn("h-7 rounded px-3 text-[13px] font-medium transition-colors", preset === p.key ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {funnelsQuery.isLoading || (funnels.length > 0 && !funnelId) || isLoading ? (
        <p className="p-12 text-center text-sm text-muted-foreground">Carregando a inteligência comercial...</p>
      ) : funnelsQuery.isError ? (
        <p role="alert" className="p-12 text-center text-sm text-destructive">Não foi possível carregar os funis{reason ? `: ${reason}` : "."}</p>
      ) : funnels.length === 0 ? (
        <p className="p-12 text-center text-sm text-muted-foreground">Nenhum funil ativo encontrado. Crie ou ative um funil em Funil de vendas › Gerenciar funis.</p>
      ) : isError || !intel ? (
        <p role="alert" className="p-12 text-center text-sm text-destructive">Não foi possível carregar os dados{reason ? `: ${reason}` : "."}</p>
      ) : leads === 0 ? (
        <p className="p-12 text-center text-sm text-muted-foreground">Nenhum lead entrou neste funil no período.</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi label="Leads que entraram" value={nf.format(leads)} detail={`de ${range.from.split("-").reverse().slice(0, 2).join("/")} a ${range.to.split("-").reverse().slice(0, 2).join("/")}`} />
            <Kpi label="Vendas" value={nf.format(intel.totals.won)} detail={`${formatRate(winRate(intel))} dos leads · ${formatBRL(intel.totals.won_value)}`} />
            <Kpi label="Perdidos" value={nf.format(intel.totals.lost)} detail={`${formatRate(leads > 0 ? intel.totals.lost / leads : null)} dos leads`} />
            <Kpi label="Dias até ganhar" value={intel.totals.avg_days_to_win === null ? "—" : String(intel.totals.avg_days_to_win).replace(".", ",")} detail="entre entrar e fechar, em média" />
          </div>

          {insights.length > 0 && (
            <section className="mt-4 rounded-lg border bg-card p-4">
              <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Lightbulb className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                O que chama atenção
              </h2>
              <ul className="mt-2 space-y-1.5">
                {insights.map((text) => (
                  <li key={text} className="text-sm text-foreground">{text}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-4 overflow-hidden rounded-lg border bg-card">
            <div className="border-b px-4 py-3">
              <h2 className="text-base font-semibold text-foreground">Funil</h2>
              <p className="text-xs text-muted-foreground">Quantos leads passaram por cada etapa, e quantos chegaram nela vindos da anterior.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Etapa</th>
                    <th className="w-[34%] px-2 py-2.5 font-medium">Leads que passaram</th>
                    <th className="px-2 py-2.5 text-right font-medium">Da anterior</th>
                    <th className="px-2 py-2.5 text-right font-medium">Tempo na etapa</th>
                    <th className="px-4 py-2.5 text-right font-medium">Parados +7 dias</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {steps.map(({ stage, shareOfLeads, conversionFromPrevious }) => (
                    <tr key={stage.id}>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-2 font-medium text-foreground">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: stage.color ?? "#A1A1AA" }} aria-hidden="true" />
                          {stage.name}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                            <div className="h-full rounded-full bg-[hsl(var(--chart-1))]" style={{ width: `${(stage.reached / maxReached) * 100}%` }} />
                          </div>
                          <span className="w-20 text-right text-sm tabular-nums text-foreground">
                            <span className="font-semibold">{nf.format(stage.reached)}</span>
                            <span className="text-xs text-muted-foreground"> · {formatRate(shareOfLeads)}</span>
                          </span>
                        </div>
                      </td>
                      <td className={cn("px-2 py-2.5 text-right tabular-nums", conversionFromPrevious !== null && conversionFromPrevious < 0.5 ? "font-semibold text-warning" : "text-foreground")}>
                        {formatRate(conversionFromPrevious)}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-foreground">{stage.is_final ? "—" : formatDuration(stage.avg_seconds_in_stage)}</td>
                      <td className={cn("px-4 py-2.5 text-right tabular-nums", stage.stalled > 0 ? "font-semibold text-warning" : "text-muted-foreground")}>
                        {stage.is_final ? "—" : nf.format(stage.stalled)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border bg-card p-4">
              <h2 className="text-base font-semibold text-foreground">Onde perdemos leads</h2>
              <p className="text-xs text-muted-foreground">Etapa em que o lead estava quando foi para Perdido.</p>
              {losses.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Nenhuma perda no período.</p>
              ) : (
                <ul className="mt-2 divide-y">
                  {losses.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0 truncate text-foreground">{s.name}</span>
                      <span className="shrink-0 tabular-nums text-foreground">
                        <span className="font-semibold">{nf.format(s.lost_here)}</span>
                        <span className="text-xs text-muted-foreground"> · {formatRate(intel.totals.lost > 0 ? s.lost_here / intel.totals.lost : null)} das perdas</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-lg border bg-card p-4">
              <h2 className="text-base font-semibold text-foreground">Leads parados</h2>
              <p className="text-xs text-muted-foreground">
                {nf.format(stalledTotal(intel))} {stalledTotal(intel) === 1 ? "lead aberto sem movimento" : "leads abertos sem movimento"} há mais de 7 dias.
              </p>
              {stalledStages.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Nenhum lead parado.</p>
              ) : (
                <ul className="mt-2 divide-y">
                  {stalledStages.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0 truncate text-foreground">{s.name}</span>
                      <span className="shrink-0 tabular-nums text-foreground">
                        <span className="font-semibold text-warning">{nf.format(s.stalled)}</span>
                        <span className="text-xs text-muted-foreground"> de {nf.format(s.current)} na etapa</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <p className="mt-3 px-1 text-xs text-muted-foreground">
            A análise acompanha os leads que entraram no período e conta cada lead uma vez por etapa, pelo histórico de movimentações. Leads antigos, de antes do histórico existir, aparecem só na etapa em que estão.
          </p>
        </>
      )}
    </div>
  );
}
