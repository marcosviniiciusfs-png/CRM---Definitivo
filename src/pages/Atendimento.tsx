import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { formatRelativeShort } from "@/lib/money";
import { periodRange, type RankingPeriod } from "@/lib/scoring";
import {
  formatDuration,
  formatRate,
  rateTone,
  responseRate,
  speedTone,
  teamTotals,
  type AttendanceTone,
} from "@/lib/attendance";
import { useAttendanceMetrics } from "@/hooks/useAttendance";
import { useCurrentUserId, useMembersMap } from "@/hooks/useRanking";
import { usePermissions } from "@/hooks/usePermissions";
import { isDemoRoute } from "@/lib/demoMode";

const PERIODS: Array<{ value: RankingPeriod; label: string; noun: string }> = [
  { value: "today", label: "Hoje", noun: "hoje" },
  { value: "week", label: "Semana", noun: "nesta semana" },
  { value: "month", label: "Mês", noun: "neste mês" },
];

const nf = new Intl.NumberFormat("pt-BR");

const TONE: Record<AttendanceTone, string> = {
  bom: "text-success",
  atencao: "text-warning",
  ruim: "text-destructive",
  sem_dados: "text-muted-foreground",
};

function Kpi({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: AttendanceTone }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1.5 text-[28px] font-semibold leading-tight tracking-[-0.02em] tabular-nums sm:text-[32px]", tone ? TONE[tone] : "text-foreground")}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export default function Atendimento() {
  const [period, setPeriod] = useState<RankingPeriod>("week");
  const range = useMemo(() => periodRange(period), [period]);
  const { data: rows = [], isLoading, isError } = useAttendanceMetrics(range);
  const { data: members = {} } = useMembersMap();
  const currentUserId = useCurrentUserId();
  const permissions = usePermissions();
  const isAdmin = permissions.role === "owner" || permissions.role === "admin" || isDemoRoute();

  const totals = useMemo(() => teamTotals(rows), [rows]);
  const sorted = useMemo(() => [...rows].sort((a, b) => b.conversations - a.conversations || b.pending - a.pending), [rows]);
  const noun = PERIODS.find((p) => p.value === period)?.noun ?? "";
  const disconnected = rows.filter((r) => r.channels > 0 && r.channels_connected < r.channels);

  return (
    <div className="mx-auto w-full max-w-[1280px] px-1 pb-8 pt-2 sm:px-2 sm:pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-[-0.01em] text-foreground sm:text-2xl">Atendimento</h1>
            {isDemoRoute() && <span className="rounded-full bg-info-tint px-2 py-0.5 text-[11px] font-semibold text-info">Dados de exemplo</span>}
          </div>
          <p className="text-[13px] text-muted-foreground">
            {isAdmin ? `Como cada vendedor atendeu os clientes no WhatsApp ${noun}` : `Como foi o seu atendimento no WhatsApp ${noun}`}
          </p>
        </div>
        <div className="flex items-center gap-0.5 rounded-md border bg-card p-0.5" role="group" aria-label="Período">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={period === p.value}
              onClick={() => setPeriod(p.value)}
              className={cn("h-7 rounded px-3 text-[13px] font-medium transition-colors", period === p.value ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isAdmin && disconnected.length > 0 && (
        <div role="note" className="mt-4 rounded-md bg-warning-tint px-3 py-2.5 text-[13px] text-warning">
          <span className="font-semibold">WhatsApp desconectado: </span>
          {disconnected.map((r) => members[r.user_id]?.name ?? "Colaborador").join(", ")}. As conversas deles não entram nas métricas até reconectar.
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="Taxa de resposta" value={formatRate(totals.rate)} detail={`${nf.format(totals.answered)} de ${nf.format(totals.conversations)} conversas`} tone={rateTone(totals.rate)} />
        <Kpi label="Tempo médio de resposta" value={formatDuration(totals.avgSeconds)} detail="da mensagem do cliente até a resposta" tone={speedTone(totals.avgSeconds)} />
        <Kpi label="Respondidas em até 5 min" value={formatRate(totals.within5min)} detail="das conversas respondidas" />
        <Kpi label="Sem resposta" value={nf.format(totals.pending)} detail={totals.pending === 1 ? "conversa esperando" : "conversas esperando"} tone={totals.pending > 0 ? "atencao" : "bom"} />
      </div>

      <section className="mt-4 overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="text-base font-semibold text-foreground">{isAdmin ? "Por vendedor" : "Seus números"}</h2>
          <p className="text-xs text-muted-foreground">
            {nf.format(totals.connected)} de {nf.format(totals.channels)} {totals.channels === 1 ? "WhatsApp conectado" : "WhatsApps conectados"}
          </p>
        </div>
        {isLoading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Carregando o atendimento...</p>
        ) : isError ? (
          <p className="p-8 text-center text-sm text-destructive">Não foi possível carregar o atendimento. Tente de novo.</p>
        ) : sorted.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Nenhum WhatsApp conectado ainda. Cada vendedor conecta o próprio número em Chat › Canais.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Vendedor</th>
                  <th className="px-2 py-2.5 text-right font-medium">Conversas</th>
                  <th className="px-2 py-2.5 text-right font-medium">Taxa de resposta</th>
                  <th className="px-2 py-2.5 text-right font-medium">Mediana</th>
                  <th className="px-2 py-2.5 text-right font-medium">1ª resposta</th>
                  <th className="px-2 py-2.5 text-right font-medium">Até 5 min</th>
                  <th className="px-4 py-2.5 text-right font-medium">Sem resposta</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((row) => {
                  const rate = responseRate(row);
                  const mine = row.user_id === currentUserId;
                  const offline = row.channels > 0 && row.channels_connected < row.channels;
                  return (
                    <tr key={row.user_id} className={cn(mine && "bg-accent/40")}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">
                          {members[row.user_id]?.name ?? "Colaborador"}
                          {mine && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(você)</span>}
                        </p>
                        <p className={cn("text-xs", offline ? "text-warning" : "text-muted-foreground")}>
                          {row.channels === 0 ? "Sem WhatsApp" : `${row.channels_connected} de ${row.channels} ${row.channels === 1 ? "canal conectado" : "canais conectados"}`}
                        </p>
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums text-foreground">{nf.format(row.conversations)}</td>
                      <td className={cn("px-2 py-3 text-right font-semibold tabular-nums", TONE[rateTone(rate)])}>{formatRate(rate)}</td>
                      <td className={cn("px-2 py-3 text-right font-semibold tabular-nums", TONE[speedTone(row.median_seconds)])}>{formatDuration(row.median_seconds)}</td>
                      <td className="px-2 py-3 text-right tabular-nums text-foreground">{formatDuration(row.first_response_avg_seconds)}</td>
                      <td className="px-2 py-3 text-right tabular-nums text-foreground">{row.answered > 0 ? formatRate(row.answered_5min / row.answered) : "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className={cn("font-semibold", row.pending > 0 ? "text-warning" : "text-foreground")}>{nf.format(row.pending)}</span>
                        {row.oldest_pending_at && <p className="text-xs text-muted-foreground">a mais antiga {formatRelativeShort(row.oldest_pending_at)}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-3 px-1 text-xs text-muted-foreground">
        O tempo corre 24 horas por dia, sem descontar o horário comercial. A mediana é o tempo típico: metade das respostas foi mais rápida que ela. Só entram conversas dos WhatsApps conectados ao KairoZ.
      </p>
    </div>
  );
}
