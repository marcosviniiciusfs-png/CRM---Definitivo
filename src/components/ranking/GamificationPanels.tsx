import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Flame, Plus, Trash2, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBRL, formatRelativeShort } from "@/lib/money";
import { maskMoneyInput, parseMoneyInput } from "@/lib/consortium";
import { brtDate } from "@/lib/scoring";
import {
  ACHIEVEMENTS,
  CAMPAIGN_FORMATS,
  GOAL_METRICS,
  achievementLabel,
  campaignFormatLabel,
  campaignStatus,
  goalMetricLabel,
  goalPace,
  isMoneyMetric,
  levelProgress,
  levelTier,
  type CampaignFormat,
  type GoalMetric,
} from "@/lib/gamification";
import {
  useCampaignStandings,
  useCampaigns,
  useDeleteCampaign,
  useDeleteGoal,
  useGoalsProgress,
  useRankingFeed,
  useSaveCampaign,
  useSaveGoal,
  useSellerProfile,
  type CampaignRow,
} from "@/hooks/useGamification";
import type { MemberInfo } from "@/hooks/useRanking";

const nf = new Intl.NumberFormat("pt-BR");
const formatMetricValue = (metric: string, value: number | null) =>
  value === null ? "—" : isMoneyMetric(metric) ? formatBRL(value) : nf.format(value);

interface Ctx {
  members: Record<string, MemberInfo>;
  teams: Array<{ id: string; name: string; color: string | null }>;
  isAdmin: boolean;
  currentUserId: string | null;
}

// ------------------------------------------------------------
// Nível, sequência e medalhas
// ------------------------------------------------------------
export function SellerProfileCard({ userId }: { userId: string | null }) {
  const { data: profile } = useSellerProfile(userId);
  if (!profile) return null;
  const progress = levelProgress(profile.lifetime_points);
  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Seu nível</h2>
          <p className="mt-1 text-[28px] font-semibold leading-none tabular-nums text-foreground">
            {progress.level} <span className="text-sm font-medium text-muted-foreground">{levelTier(progress.level)}</span>
          </p>
        </div>
        {profile.streak_days > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning-tint px-2 py-1 text-xs font-semibold text-warning" title={`Dias úteis seguidos com ${profile.daily_points_target} pontos ou mais`}>
            <Flame className="h-3.5 w-3.5" aria-hidden="true" />
            {profile.streak_days} {profile.streak_days === 1 ? "dia" : "dias"} seguidos
          </span>
        )}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={Math.round(progress.ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-foreground" style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {progress.next === null
          ? `${nf.format(profile.lifetime_points)} pontos. Nível máximo.`
          : `${nf.format(profile.lifetime_points)} pontos · faltam ${nf.format(progress.next - profile.lifetime_points)} para o nível ${progress.level + 1}`}
      </p>
      {profile.achievements.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {profile.achievements.slice(0, 8).map((a) => (
            <span
              key={`${a.code}-${a.period}`}
              title={ACHIEVEMENTS[a.code]?.description}
              className="inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-semibold text-foreground"
            >
              <Trophy className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
              {achievementLabel(a.code)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------
// Feed ao vivo
// ------------------------------------------------------------
export function feedText(kind: string, name: string, amount: number | null): string {
  if (kind === "venda") return amount !== null ? `${name} fechou ${formatBRL(amount)}` : `${name} fechou uma venda`;
  if (kind === "meta_batida") return `${name} bateu a meta do mês`;
  if (kind === "recorde_pessoal") return `${name} bateu o próprio recorde`;
  if (kind.startsWith("medalha:")) return `${name} ganhou a medalha ${achievementLabel(kind.slice(8))}`;
  return name;
}

export function FeedCard({ members }: { members: Record<string, MemberInfo> }) {
  const { data: feed = [] } = useRankingFeed(10);
  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="text-base font-semibold text-foreground">Acontecendo agora</h2>
      {feed.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Nenhuma venda ou conquista ainda.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {feed.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="py-2">
              <p className="text-sm text-foreground">{feedText(item.kind, members[item.user_id]?.name ?? "Alguém da equipe", item.amount)}</p>
              <p className="text-xs text-muted-foreground">{formatRelativeShort(item.occurred_at)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ------------------------------------------------------------
// Metas
// ------------------------------------------------------------
export function GoalsPanel({ members, teams, isAdmin, currentUserId }: Ctx) {
  const { data: goals = [], isLoading } = useGoalsProgress();
  const deleteGoal = useDeleteGoal();
  const [open, setOpen] = useState(false);
  const today = brtDate();

  const label = (scope: string, scopeId: string | null) => {
    if (scope === "org") return "Organização";
    if (scope === "team") return teams.find((t) => t.id === scopeId)?.name ?? "Equipe";
    return members[scopeId ?? ""]?.name ?? "Vendedor";
  };

  const sorted = [...goals].sort((a, b) => {
    const order = { org: 0, team: 1, user: 2 } as Record<string, number>;
    if (order[a.scope] !== order[b.scope]) return order[a.scope] - order[b.scope];
    return (a.scope_id === currentUserId ? -1 : 0) - (b.scope_id === currentUserId ? -1 : 0);
  });

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Metas do mês</h2>
          <p className="text-xs text-muted-foreground">O ritmo compara o realizado com o esperado pelos dias úteis que já passaram.</p>
        </div>
        {isAdmin && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Nova meta
          </Button>
        )}
      </div>
      {isLoading ? (
        <p className="p-6 text-center text-sm text-muted-foreground">Carregando metas...</p>
      ) : sorted.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          {isAdmin ? "Nenhuma meta para este mês. Crie a primeira em Nova meta." : "Nenhuma meta definida para este mês."}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {sorted.map((goal) => {
            const hidden = goal.target === null || goal.achieved === null;
            const pace = hidden ? null : goalPace(goal.achieved as number, goal.target as number, today);
            return (
              <li key={goal.goal_id} className="space-y-2 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {label(goal.scope, goal.scope_id)}
                      {goal.scope_id === currentUserId && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(você)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{goalMetricLabel(goal.metric)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {pace && (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          pace.status === "batida" && "bg-success-tint text-success",
                          pace.status === "no_ritmo" && "bg-info-tint text-info",
                          pace.status === "abaixo" && "bg-warning-tint text-warning",
                        )}
                      >
                        {pace.status === "batida" ? "Meta batida" : pace.status === "no_ritmo" ? "No ritmo" : "Abaixo do ritmo"}
                      </span>
                    )}
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground"
                        aria-label="Excluir meta"
                        onClick={() => deleteGoal.mutate(goal.goal_id, { onError: () => toast.error("Não foi possível excluir a meta.") })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                {hidden ? (
                  <p className="text-xs text-muted-foreground">Valores escondidos pela organização.</p>
                ) : (
                  <>
                    <div className="relative h-2 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-foreground" style={{ width: `${Math.round((pace?.ratio ?? 0) * 100)}%` }} />
                      {pace && pace.expected < (goal.target as number) && (
                        <span
                          className="absolute top-0 h-full w-0.5 bg-muted-foreground/60"
                          style={{ left: `${Math.min(100, (pace.expected / (goal.target as number)) * 100)}%` }}
                          title="Onde deveria estar hoje"
                        />
                      )}
                    </div>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      <span className="font-semibold text-foreground">{formatMetricValue(goal.metric, goal.achieved)}</span> de {formatMetricValue(goal.metric, goal.target)}
                      {pace && pace.status !== "batida" && pace.daysLeft > 0 && (
                        <> · faltam {formatMetricValue(goal.metric, pace.remaining)}, {formatMetricValue(goal.metric, isMoneyMetric(goal.metric) ? pace.perDay : Math.ceil(pace.perDay))} por dia útil</>
                      )}
                    </p>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <GoalDialog open={open} onOpenChange={setOpen} members={members} teams={teams} />
    </section>
  );
}

function GoalDialog({ open, onOpenChange, members, teams }: { open: boolean; onOpenChange: (open: boolean) => void; members: Record<string, MemberInfo>; teams: Ctx["teams"] }) {
  const saveGoal = useSaveGoal();
  const [scope, setScope] = useState<"org" | "team" | "user">("user");
  const [scopeId, setScopeId] = useState("");
  const [metric, setMetric] = useState<GoalMetric>("producao");
  const [target, setTarget] = useState("");

  const memberList = useMemo(() => Object.entries(members).sort((a, b) => a[1].name.localeCompare(b[1].name)), [members]);

  const submit = () => {
    const value = isMoneyMetric(metric) ? parseMoneyInput(target) : Number(target.replace(/\D/g, ""));
    if (!value || value <= 0) {
      toast.error("Informe um alvo maior que zero.");
      return;
    }
    if (scope !== "org" && !scopeId) {
      toast.error(scope === "team" ? "Escolha a equipe." : "Escolha o vendedor.");
      return;
    }
    saveGoal.mutate(
      { scope, scope_id: scope === "org" ? null : scopeId, metric, target: value },
      {
        onSuccess: () => {
          toast.success("Meta criada.");
          onOpenChange(false);
          setTarget("");
        },
        onError: (error) => {
          console.error(error);
          toast.error("Não foi possível criar a meta. Já existe uma igual neste mês?");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova meta do mês</DialogTitle>
          <DialogDescription>Vale para o mês atual. Ao bater a meta individual, o vendedor ganha pontos e medalha.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Para quem</Label>
              <Select value={scope} onValueChange={(v) => { setScope(v as typeof scope); setScopeId(""); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Vendedor</SelectItem>
                  <SelectItem value="team">Equipe</SelectItem>
                  <SelectItem value="org">Organização</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Métrica</Label>
              <Select value={metric} onValueChange={(v) => { setMetric(v as GoalMetric); setTarget(""); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GOAL_METRICS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          {scope !== "org" && (
            <div className="space-y-1.5">
              <Label>{scope === "team" ? "Equipe" : "Vendedor"}</Label>
              <Select value={scopeId} onValueChange={setScopeId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Escolha" /></SelectTrigger>
                <SelectContent>
                  {scope === "team"
                    ? teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)
                    : memberList.map(([id, m]) => <SelectItem key={id} value={id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="goal-target">Alvo</Label>
            <Input
              id="goal-target"
              inputMode="decimal"
              value={target}
              placeholder={isMoneyMetric(metric) ? "R$ 500.000" : "20"}
              onChange={(e) => setTarget(isMoneyMetric(metric) ? maskMoneyInput(e.target.value) : e.target.value.replace(/\D/g, "").slice(0, 7))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saveGoal.isPending}>{saveGoal.isPending ? "Salvando..." : "Criar meta"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------
// Campanhas
// ------------------------------------------------------------
export function CampaignsPanel({ members, teams, isAdmin, currentUserId }: Ctx) {
  const { data: campaigns = [], isLoading } = useCampaigns();
  const deleteCampaign = useDeleteCampaign();
  const [open, setOpen] = useState(false);
  const today = brtDate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = campaigns.find((c) => c.id === selectedId) ?? campaigns.find((c) => campaignStatus(c, today) === "em_andamento") ?? campaigns[0] ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <section className="rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="text-base font-semibold text-foreground">Campanhas</h2>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Nova campanha
            </Button>
          )}
        </div>
        {isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Carregando...</p>
        ) : campaigns.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma campanha ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {campaigns.map((c) => {
              const status = campaignStatus(c, today);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={cn("flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-accent/40", selected?.id === c.id && "bg-accent/60")}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {campaignFormatLabel(c.format)} · {goalMetricLabel(c.metric)}
                        {c.prize && ` · Prêmio: ${c.prize}`}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        status === "em_andamento" && "bg-info-tint text-info",
                        status === "agendada" && "bg-secondary text-muted-foreground",
                        status === "encerrada" && "bg-secondary text-foreground/70",
                      )}
                    >
                      {status === "em_andamento" ? `Até ${formatShortDate(c.ends_on)}` : status === "agendada" ? `Começa ${formatShortDate(c.starts_on)}` : "Encerrada"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {selected && (
        <CampaignStandings
          campaign={selected}
          members={members}
          teams={teams}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onDelete={() =>
            deleteCampaign.mutate(selected.id, {
              onSuccess: () => {
                toast.success("Campanha excluída.");
                setSelectedId(null);
              },
              onError: () => toast.error("Não foi possível excluir a campanha."),
            })
          }
        />
      )}
      <CampaignDialog open={open} onOpenChange={setOpen} members={members} teams={teams} />
    </div>
  );
}

const formatShortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

function CampaignStandings({
  campaign,
  members,
  teams,
  currentUserId,
  isAdmin,
  onDelete,
}: {
  campaign: CampaignRow;
  members: Record<string, MemberInfo>;
  teams: Ctx["teams"];
  currentUserId: string | null;
  isAdmin: boolean;
  onDelete: () => void;
}) {
  const { data: standings = [], isLoading } = useCampaignStandings(campaign.id);
  const hidden = standings.some((s) => s.hidden);
  const winners = Array.isArray(campaign.winners) ? (campaign.winners as Array<{ type: string; id: string }>) : [];
  const nameOf = (type: string, id: string) =>
    type === "team" ? teams.find((t) => t.id === id)?.name ?? "Equipe" : members[id]?.name ?? "Colaborador";

  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-foreground">{campaign.name}</h2>
          <p className="text-xs text-muted-foreground">
            {formatShortDate(campaign.starts_on)} a {formatShortDate(campaign.ends_on)}
            {campaign.format === "meta" && campaign.target !== null && ` · alvo ${formatMetricValue(campaign.metric, campaign.target)}`}
          </p>
        </div>
        {isAdmin && (
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" aria-label="Excluir campanha" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {campaign.prize && (
        <p className="mx-4 mt-3 inline-flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1.5 text-[13px] text-foreground">
          <Trophy className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          Prêmio: {campaign.prize}
        </p>
      )}
      {campaign.closed_at && (
        <p className="mx-4 mt-3 text-sm text-foreground">
          {winners.length === 0 ? "Encerrada sem vencedor." : `Vencedor${winners.length > 1 ? "es" : ""}: ${winners.map((w) => nameOf(w.type, w.id)).join(", ")}`}
        </p>
      )}
      {hidden && (
        <p className="mx-4 mt-3 text-xs text-muted-foreground">
          O resultado fica escondido até {campaign.reveal_on ? formatShortDate(campaign.reveal_on) : "a revelação"}. Você vê só o seu.
        </p>
      )}
      {isLoading ? (
        <p className="p-6 text-center text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <ol className="mt-2 divide-y divide-border">
          {standings.map((s, index) => {
            const reached = campaign.format === "meta" && campaign.target !== null && (s.value ?? 0) >= campaign.target;
            return (
              <li key={s.entity_id} className={cn("flex items-center gap-3 px-4 py-2.5", s.entity_id === currentUserId && "bg-accent/50")}>
                <span className="w-6 text-sm font-semibold tabular-nums text-muted-foreground">{hidden ? "—" : index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{nameOf(s.entity_type, s.entity_id)}</span>
                {reached && <span className="rounded-full bg-success-tint px-2 py-0.5 text-[11px] font-semibold text-success">Alcançou</span>}
                <span className="w-28 text-right text-sm font-semibold tabular-nums text-foreground">{formatMetricValue(campaign.metric, s.value)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function CampaignDialog({ open, onOpenChange, members, teams }: { open: boolean; onOpenChange: (open: boolean) => void; members: Record<string, MemberInfo>; teams: Ctx["teams"] }) {
  const saveCampaign = useSaveCampaign();
  const today = brtDate();
  const [name, setName] = useState("");
  const [format, setFormat] = useState<CampaignFormat>("corrida");
  const [metric, setMetric] = useState<GoalMetric>("producao");
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(today);
  const [target, setTarget] = useState("");
  const [prize, setPrize] = useState("");
  const [revealOn, setRevealOn] = useState("");
  const [battle, setBattle] = useState<[string, string]>(["", ""]);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const memberList = useMemo(() => Object.entries(members).sort((a, b) => a[1].name.localeCompare(b[1].name)), [members]);

  const submit = () => {
    if (!name.trim()) return toast.error("Dê um nome para a campanha.");
    if (endsOn < startsOn) return toast.error("O fim precisa ser depois do início.");
    const targetValue = format === "meta" ? (isMoneyMetric(metric) ? parseMoneyInput(target) : Number(target.replace(/\D/g, ""))) : null;
    if (format === "meta" && (!targetValue || targetValue <= 0)) return toast.error("Informe o alvo da campanha.");
    if (format === "batalha" && (!battle[0] || !battle[1] || battle[0] === battle[1])) return toast.error("Escolha dois vendedores diferentes.");
    if (format === "equipes" && teamIds.length < 2) return toast.error("Escolha pelo menos duas equipes.");

    saveCampaign.mutate(
      {
        name: name.trim(),
        format,
        metric,
        starts_on: startsOn,
        ends_on: endsOn,
        target: targetValue,
        prize: prize.trim() || null,
        reveal_on: revealOn || null,
        participant_user_ids: format === "batalha" ? battle : null,
        team_ids: format === "equipes" ? teamIds : null,
      },
      {
        onSuccess: () => {
          toast.success("Campanha criada.");
          onOpenChange(false);
          setName("");
          setPrize("");
          setTarget("");
        },
        onError: (error) => {
          console.error(error);
          toast.error("Não foi possível criar a campanha. Tente de novo.");
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova campanha</DialogTitle>
          <DialogDescription>O sistema apura o resultado e anuncia os vencedores no fim do período.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="campaign-name">Nome</Label>
            <Input id="campaign-name" value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder="Ex.: Corrida de dezembro" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Formato</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as CampaignFormat)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CAMPAIGN_FORMATS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Métrica</Label>
              <Select value={metric} onValueChange={(v) => setMetric(v as GoalMetric)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GOAL_METRICS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="-mt-1 text-xs text-muted-foreground">{CAMPAIGN_FORMATS.find((f) => f.value === format)?.description}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="campaign-start">Início</Label>
              <Input id="campaign-start" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-end">Fim</Label>
              <Input id="campaign-end" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
          </div>
          {format === "meta" && (
            <div className="space-y-1.5">
              <Label htmlFor="campaign-target">Alvo</Label>
              <Input
                id="campaign-target"
                inputMode="decimal"
                value={target}
                placeholder={isMoneyMetric(metric) ? "R$ 300.000" : "10"}
                onChange={(e) => setTarget(isMoneyMetric(metric) ? maskMoneyInput(e.target.value) : e.target.value.replace(/\D/g, "").slice(0, 7))}
              />
            </div>
          )}
          {format === "batalha" && (
            <div className="grid grid-cols-2 gap-3">
              {[0, 1].map((i) => (
                <div key={i} className="space-y-1.5">
                  <Label>{i === 0 ? "Vendedor 1" : "Vendedor 2"}</Label>
                  <Select value={battle[i]} onValueChange={(v) => setBattle((b) => (i === 0 ? [v, b[1]] : [b[0], v]))}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Escolha" /></SelectTrigger>
                    <SelectContent>
                      {memberList.map(([id, m]) => <SelectItem key={id} value={id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
          {format === "equipes" && (
            <div className="space-y-1.5">
              <Label>Equipes</Label>
              {teams.length < 2 ? (
                <p className="text-xs text-muted-foreground">Cadastre pelo menos duas equipes em Administrativo › Equipes.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {teams.map((t) => {
                    const on = teamIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setTeamIds((ids) => (on ? ids.filter((id) => id !== t.id) : [...ids, t.id]))}
                        className={cn("h-8 rounded-full border px-3 text-xs font-medium", on ? "border-foreground bg-foreground text-background" : "text-foreground/80 hover:bg-accent")}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="campaign-prize">Prêmio</Label>
            <Input id="campaign-prize" value={prize} onChange={(e) => setPrize(e.target.value.slice(0, 200))} placeholder="Ex.: Jantar para dois" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campaign-reveal">Revelar o resultado em (opcional)</Label>
            <Input id="campaign-reveal" type="date" value={revealOn} onChange={(e) => setRevealOn(e.target.value)} />
            <p className="text-xs text-muted-foreground">Até essa data, cada vendedor vê só o próprio resultado.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saveCampaign.isPending}>{saveCampaign.isPending ? "Criando..." : "Criar campanha"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
