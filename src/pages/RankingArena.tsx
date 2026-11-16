import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL, formatBRLCompact, formatRelativeShort } from "@/lib/money";
import {
  aggregateByTeam,
  gapToNext,
  periodRange,
  periodUntilYesterday,
  rankDelta,
  rankRows,
  scoreKindLabel,
  type RankingMetric,
  type RankingPeriod,
  type RankingRow,
} from "@/lib/scoring";
import { useOrganizationSegment } from "@/hooks/useOrganizationSegment";
import {
  useCurrentUserId,
  useMembersMap,
  useMyScoreEvents,
  useRankingBoard,
  useTeamsWithMembers,
  type MemberInfo,
} from "@/hooks/useRanking";
import { isDemoRoute } from "@/lib/demoMode";
import { usePermissions } from "@/hooks/usePermissions";
import { useGamificationRefresh } from "@/hooks/useGamification";
import { CampaignsPanel, FeedCard, GoalsPanel, SellerProfileCard } from "@/components/ranking/GamificationPanels";

type Tab = RankingMetric | "teams" | "goals" | "campaigns";

const PERIODS: Array<{ value: RankingPeriod; label: string; noun: string }> = [
  { value: "today", label: "Hoje", noun: "hoje" },
  { value: "week", label: "Semana", noun: "nesta semana" },
  { value: "month", label: "Mês", noun: "neste mês" },
];

const nf = new Intl.NumberFormat("pt-BR");

function formatMetric(value: number | null, metric: RankingMetric): string {
  if (value === null) return "—";
  if (metric === "production") return formatBRL(value);
  if (metric === "conversion") return `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  return nf.format(value);
}

function Avatar({ member, size = 32 }: { member?: MemberInfo; size?: number }) {
  const initial = (member?.name ?? "?").charAt(0).toUpperCase();
  if (member?.avatarUrl) {
    return <img src={member.avatarUrl} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-muted-foreground"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initial}
    </span>
  );
}

function Delta({ value }: { value: number }) {
  if (value === 0) return <span className="w-8 text-center text-xs text-muted-foreground">—</span>;
  const up = value > 0;
  return (
    <span
      className={cn("inline-flex w-8 items-center justify-center gap-0.5 text-xs font-semibold tabular-nums", up ? "text-success" : "text-destructive")}
      title={up ? `Subiu ${value} desde ontem` : `Caiu ${-value} desde ontem`}
    >
      {up ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />}
      {Math.abs(value)}
    </span>
  );
}

export default function RankingArena() {
  const { terms, rankingShowValues } = useOrganizationSegment();
  const [period, setPeriod] = useState<RankingPeriod>("month");
  const [tab, setTab] = useState<Tab>("production");
  const currentUserId = useCurrentUserId();
  const permissions = usePermissions();
  const isAdmin = permissions.role === "owner" || permissions.role === "admin";
  useGamificationRefresh();

  const range = useMemo(() => periodRange(period), [period]);
  const previousRange = useMemo(() => periodUntilYesterday(period), [period]);

  const { data: rows = [], isLoading } = useRankingBoard(range);
  const { data: previousRows = [] } = useRankingBoard(previousRange);
  const { data: members = {} } = useMembersMap();
  const { data: teamData } = useTeamsWithMembers();
  const { data: myEvents = [] } = useMyScoreEvents(range);

  const metric: RankingMetric = tab === "teams" || tab === "goals" || tab === "campaigns" ? "production" : tab;
  const tabs: Array<{ value: Tab; label: string }> = [
    { value: "production", label: terms.revenue === "Receita ganha" ? "Receita" : terms.revenue },
    { value: "sales", label: terms.sales },
    { value: "points", label: "Pontos" },
    { value: "conversion", label: "Conversão" },
    { value: "teams", label: "Equipes" },
    { value: "goals", label: "Metas" },
    { value: "campaigns", label: "Campanhas" },
  ];
  const teamsList = teamData?.teams ?? [];

  const ranked = useMemo(() => rankRows(rows, metric), [rows, metric]);
  const previousRanks = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rankRows(previousRows, metric)) map.set(r.row.user_id, r.rank);
    return map;
  }, [previousRows, metric]);

  const teamRanked = useMemo(() => {
    if (!teamData) return [];
    return rankRows(aggregateByTeam(rows, teamData.memberships), "production");
  }, [rows, teamData]);

  const me = ranked.find((r) => r.row.user_id === currentUserId);
  const gap = currentUserId ? gapToNext(ranked, currentUserId) : null;
  const periodNoun = PERIODS.find((p) => p.value === period)?.noun ?? "";
  const valuesHidden = !rankingShowValues && rows.some((r) => r.production === null);
  const podium = ranked.filter((r) => r.rank > 0 && (r.value ?? 0) > 0).slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-[1280px] px-1 pb-8 pt-2 sm:px-2 sm:pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-[-0.01em] text-foreground sm:text-2xl">Ranking</h1>
            {isDemoRoute() && <span className="rounded-full bg-info-tint px-2 py-0.5 text-[11px] font-semibold text-info">Dados de exemplo</span>}
          </div>
          <p className="text-[13px] text-muted-foreground">Quem mais vendeu {periodNoun}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-md border bg-card p-0.5" role="group" aria-label="Período">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                aria-pressed={period === p.value}
                onClick={() => setPeriod(p.value)}
                className={cn(
                  "h-7 rounded px-3 text-[13px] font-medium transition-colors",
                  period === p.value ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label="Quadros do ranking">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-[13px] transition-colors",
              tab === t.value ? "border-foreground font-semibold text-foreground" : "border-transparent font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {valuesHidden && (tab === "production" || tab === "teams") && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
          A organização escondeu os valores dos colegas. Você vê o seu e a posição de todos.
        </p>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {tab === "goals" ? (
            <GoalsPanel members={members} teams={teamsList} isAdmin={isAdmin} currentUserId={currentUserId} />
          ) : tab === "campaigns" ? (
            <CampaignsPanel members={members} teams={teamsList} isAdmin={isAdmin} currentUserId={currentUserId} />
          ) : tab === "teams" ? (
            <section className="rounded-lg border bg-card">
              {teamRanked.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">Nenhuma equipe cadastrada. Crie equipes em Administrativo › Equipes.</p>
              ) : (
                <ol className="divide-y divide-border">
                  {teamRanked.map((r) => {
                    const team = teamData?.teams.find((t) => t.id === r.row.team_id);
                    return (
                      <li key={r.row.team_id} className="flex items-center gap-3 px-4 py-3">
                        <span className="w-6 text-sm font-semibold tabular-nums text-muted-foreground">{r.rank || "—"}</span>
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: team?.color ?? "#A1A1AA" }} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{team?.name ?? "Equipe"}</span>
                        <span className="hidden text-xs text-muted-foreground sm:block">
                          {r.row.members} {r.row.members === 1 ? "pessoa" : "pessoas"} · {nf.format(r.row.sales)} {terms.sales.toLowerCase()} · {nf.format(r.row.points)} pts
                        </span>
                        <span className="w-28 text-right text-sm font-semibold tabular-nums text-foreground">{formatMetric(r.value, "production")}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          ) : (
            <>
              {podium.length > 0 && (
                <section className="grid grid-cols-3 items-end gap-2 sm:gap-3" aria-label="Pódio">
                  {[podium[1], podium[0], podium[2]].map((item, slot) => {
                    if (!item) return <div key={`vazio-${slot}`} />;
                    const member = members[item.row.user_id];
                    const first = item.rank === 1;
                    return (
                      <div
                        key={item.row.user_id}
                        className={cn(
                          "flex flex-col items-center gap-2 rounded-lg border bg-card px-2 text-center",
                          first ? "pb-5 pt-6" : "pb-4 pt-4",
                          item.row.user_id === currentUserId && "border-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                            first ? "bg-foreground text-background" : "bg-secondary text-foreground",
                          )}
                        >
                          {item.rank}
                        </span>
                        <Avatar member={member} size={first ? 56 : 44} />
                        <span className="w-full truncate text-sm font-semibold text-foreground">{member?.name ?? "Colaborador"}</span>
                        <span className={cn("font-semibold tabular-nums text-foreground", first ? "text-lg sm:text-xl" : "text-base")}>
                          {formatMetric(item.value, metric)}
                        </span>
                      </div>
                    );
                  })}
                </section>
              )}

              <section className="rounded-lg border bg-card">
                {isLoading ? (
                  <p className="p-8 text-center text-sm text-muted-foreground">Carregando o ranking...</p>
                ) : ranked.length === 0 ? (
                  <p className="p-8 text-center text-sm text-muted-foreground">Ninguém pontuou {periodNoun} ainda.</p>
                ) : (
                  <ol className="divide-y divide-border">
                    {ranked.map((item) => {
                      const member = members[item.row.user_id];
                      const mine = item.row.user_id === currentUserId;
                      return (
                        <li key={item.row.user_id} className={cn("flex items-center gap-3 px-4 py-2.5", mine && "bg-accent/50")}>
                          <span className="w-6 text-sm font-semibold tabular-nums text-muted-foreground">{item.rank || "—"}</span>
                          <Delta value={rankDelta(item.rank, previousRanks.get(item.row.user_id))} />
                          <Avatar member={member} />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                            {member?.name ?? "Colaborador"}
                            {mine && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(você)</span>}
                          </span>
                          {metric === "conversion" && (
                            <span className="hidden text-xs tabular-nums text-muted-foreground sm:block">
                              {nf.format(item.row.sales)} de {nf.format(item.row.leads_received)} leads
                            </span>
                          )}
                          {metric !== "points" && (
                            <span className="hidden w-16 text-right text-xs tabular-nums text-muted-foreground sm:block">{nf.format(item.row.points)} pts</span>
                          )}
                          <span className="w-28 text-right text-sm font-semibold tabular-nums text-foreground">{formatMetric(item.value, metric)}</span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </>
          )}
        </div>

        <aside className="space-y-4">
          <SellerProfileCard userId={currentUserId} />
          <section className="rounded-lg border bg-card p-4">
            <h2 className="text-base font-semibold text-foreground">Sua posição</h2>
            {me && me.rank > 0 ? (
              <>
                <p className="mt-2 text-[32px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-foreground">{me.rank}º</p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {formatMetric(me.value, metric)} · {nf.format(me.row.points)} pontos
                </p>
                {gap && (
                  <p className="mt-3 rounded-md bg-secondary px-3 py-2 text-[13px] text-foreground">
                    Faltam {metric === "production" ? formatBRLCompact(gap.gap) : formatMetric(gap.gap, metric)} para passar{" "}
                    <span className="font-semibold">{members[gap.target.user_id]?.name ?? "o próximo"}</span>.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Você ainda não pontuou neste quadro {periodNoun}.</p>
            )}
          </section>

          <section className="rounded-lg border bg-card p-4">
            <h2 className="text-base font-semibold text-foreground">De onde vieram seus pontos</h2>
            {myEvents.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nenhum ponto {periodNoun}.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {myEvents.map((event) => (
                  <li key={event.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className={cn("truncate text-sm text-foreground", event.voided_at && "text-muted-foreground line-through")}>
                        {scoreKindLabel(event.event_kind)}
                        {event.amount ? ` · ${formatBRL(event.amount)}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatRelativeShort(event.occurred_at)}
                        {event.voided_at && " · estornado"}
                      </p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-foreground">+{nf.format(event.points)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <FeedCard members={members} />

          <p className="px-1 text-xs text-muted-foreground">
            Procurando o ranking de tarefas ou a corrida de agendamentos?{" "}
            <Link to="/ranking/classico" className="font-medium text-foreground underline underline-offset-2">
              Abrir o ranking antigo
            </Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
