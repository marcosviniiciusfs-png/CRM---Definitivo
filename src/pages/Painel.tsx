import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gauge, RefreshCw, Settings2, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MEETING_EVENT_INFO, missingMeetingEvents } from "@/lib/stageEvents";
import {
  attendanceRates,
  formatCurrency,
  formatNumber,
  formatPercent,
  goalProgress,
  sumAttendance,
  type AttendanceDay,
} from "@/lib/panelRates";
import { buildAdEntryTable, type AdEntryRow } from "@/lib/adEntries";

// ------------------------------------------------------------------
// Período (sempre no dia de Brasília)
// ------------------------------------------------------------------
type PresetKey = "today" | "yesterday" | "7d" | "14d" | "30d" | "this_month" | "last_month" | "custom";

const PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: "today", label: "Hoje" },
  { key: "yesterday", label: "Ontem" },
  { key: "7d", label: "7 dias" },
  { key: "14d", label: "14 dias" },
  { key: "30d", label: "30 dias" },
  { key: "this_month", label: "Este mês" },
  { key: "last_month", label: "Mês passado" },
  { key: "custom", label: "Escolher datas" },
];

const todayBrt = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const shiftDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const daysInMonth = (iso: string) => {
  const [year, month] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
};
const formatDay = (iso: string) => {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
};

function rangeFor(preset: PresetKey, custom: { from: string; to: string }): { from: string; to: string } {
  const today = todayBrt();
  switch (preset) {
    case "today": return { from: today, to: today };
    case "yesterday": return { from: shiftDays(today, -1), to: shiftDays(today, -1) };
    case "7d": return { from: shiftDays(today, -6), to: today };
    case "14d": return { from: shiftDays(today, -13), to: today };
    case "30d": return { from: shiftDays(today, -29), to: today };
    case "this_month": return { from: `${today.slice(0, 8)}01`, to: today };
    case "last_month": {
      const lastDay = shiftDays(`${today.slice(0, 8)}01`, -1);
      return { from: `${lastDay.slice(0, 8)}01`, to: lastDay };
    }
    case "custom": return custom;
  }
}

// ------------------------------------------------------------------
// Tipos das respostas
// ------------------------------------------------------------------
interface PanelStatus {
  enabled: boolean;
  tokenSource: "own" | "facebook_integration";
  adAccountIds: string[];
  monthlyConversationGoal: number | null;
  hasOwnToken: boolean;
  canConfigure: boolean;
  canEditGoal: boolean;
}

interface PeriodResult {
  conversations: number;
  realConversations: number;
  leads: number;
  spend: number;
  costPerLead?: number | null;
  costPerConversation: number | null;
}

interface Indicators {
  reach: number;
  impressions: number;
  linkClicks: number;
  videoViews: number;
  ctr: number | null;
  frequency: number | null;
  cpm: number | null;
}

interface MetaInsights {
  disabled?: boolean;
  error?: string;
  errorCode?: string;
  warning?: string;
  fetchedAt?: string;
  result?: PeriodResult;
  previousResult?: PeriodResult;
  indicators?: Indicators;
  previousIndicators?: Indicators;
  daily?: Array<{ date: string; spend: number; conversations: number; realConversations: number; leads?: number; costPerLead?: number | null; costPerConversation: number | null }>;
  creatives?: Array<{
    adId: string;
    name: string;
    campaignName: string;
    spend: number;
    conversations: number;
    cost: number | null;
    continuedRate: number | null;
    verdict: "best" | "review" | null;
    leads?: number;
    costPerLead?: number | null;
    leadVerdict?: "best" | "review" | null;
  }>;
}

async function invokePanel<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("panel-meta-insights", { body });
  if (error) throw error;
  return data as T;
}

// ------------------------------------------------------------------
// Peças
// ------------------------------------------------------------------
function Delta({ current, previous, lowerIsBetter = false }: { current: number | null | undefined; previous: number | null | undefined; lowerIsBetter?: boolean }) {
  if (current == null || previous == null || previous === 0) {
    return <span className="text-xs text-muted-foreground">sem comparação</span>;
  }
  const delta = (current - previous) / previous;
  if (Math.abs(delta) < 0.005) {
    return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Minus className="h-3 w-3" />igual ao período anterior</span>;
  }
  const good = lowerIsBetter ? delta < 0 : delta > 0;
  const Icon = delta > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", good ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
      <Icon className="h-3 w-3" />
      {formatPercent(Math.abs(delta))} {delta > 0 ? "a mais" : "a menos"} que o período anterior
    </span>
  );
}

function Stat({ label, value, help, children }: { label: string; value: string; help?: string; children?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {children}
        {help && <p className="text-xs text-muted-foreground">{help}</p>}
      </CardContent>
    </Card>
  );
}

function ConfigureDialog({
  open,
  onOpenChange,
  organizationId,
  status,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  status: PanelStatus;
}) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(status.enabled);
  const [tokenSource, setTokenSource] = useState(status.tokenSource);
  const [accounts, setAccounts] = useState(status.adAccountIds.join("\n"));
  const [token, setToken] = useState("");
  const [goal, setGoal] = useState(status.monthlyConversationGoal?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [found, setFound] = useState<Array<{ id: string; name: string; active: boolean; currency: string | null; business: string | null }> | null>(null);
  const [testMessage, setTestMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const selectedIds = accounts.split(/[\s,;]+/).map((id) => id.trim()).filter(Boolean);
  const toggleAccount = (id: string) => {
    const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
    setAccounts(next.join("\n"));
  };

  const testConnection = async () => {
    setTesting(true);
    setTestMessage(null);
    try {
      const result = await invokePanel<{ accounts?: typeof found; warning?: string; error?: string }>({
        mode: "list_accounts",
        organization_id: organizationId,
        ...(token.trim() ? { access_token: token.trim() } : {}),
      });
      if (result.error) throw new Error(result.error);
      setFound(result.accounts ?? []);
      setTestMessage(result.warning
        ? { tone: "error", text: result.warning }
        : { tone: "ok", text: `Conexão funcionando. ${(result.accounts ?? []).length} ${(result.accounts ?? []).length === 1 ? "conta encontrada" : "contas encontradas"}. Marque as que o painel deve somar.` });
    } catch (error) {
      setFound(null);
      setTestMessage({ tone: "error", text: error instanceof Error && error.message ? error.message : "Não foi possível testar a conexão. Tente de novo." });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      if (status.canConfigure) {
        const result = await invokePanel<{ success?: boolean; error?: string }>({
          mode: "configure",
          organization_id: organizationId,
          enabled,
          token_source: tokenSource,
          ad_account_ids: accounts.split(/[\s,;]+/).map((id) => id.trim()).filter(Boolean),
          ...(token.trim() ? { access_token: token.trim() } : {}),
        });
        if (result.error) throw new Error(result.error);
      }
      if (status.canEditGoal) {
        const result = await invokePanel<{ success?: boolean; error?: string }>({
          mode: "set_goal",
          organization_id: organizationId,
          monthly_conversation_goal: goal.trim() ? Number(goal) : null,
        });
        if (result.error) throw new Error(result.error);
      }
      await queryClient.invalidateQueries({ queryKey: ["panel"] });
      toast.success("Painel salvo.");
      setToken("");
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      toast.error(message ? `Não foi possível salvar o painel: ${message}` : "Não foi possível salvar o painel. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurar painel</DialogTitle>
          <DialogDescription>
            O painel só lê os anúncios. Desligado, nenhuma consulta é feita à Meta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {status.canConfigure && (
            <>
              <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div>
                  <Label htmlFor="panel-enabled" className="text-sm font-semibold">Ligar painel</Label>
                  <p className="text-xs text-muted-foreground">Só lê anúncios, e só depois de ligado. Você pode desligar quando quiser.</p>
                </div>
                <Switch id="panel-enabled" checked={enabled} onCheckedChange={setEnabled} />
              </div>

              <div className="space-y-2">
                <Label>Token da Meta</Label>
                <Select value={tokenSource} onValueChange={(value) => setTokenSource(value as PanelStatus["tokenSource"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="own">Token próprio do painel</SelectItem>
                    <SelectItem value="facebook_integration">Facebook conectado nesta organização</SelectItem>
                  </SelectContent>
                </Select>
                {tokenSource === "own" && (
                  <>
                    <Input
                      type="password"
                      autoComplete="off"
                      value={token}
                      onChange={(event) => setToken(event.target.value)}
                      placeholder={status.hasOwnToken ? "Token salvo. Preencha só para trocar." : "Cole o token de acesso da Meta"}
                    />
                    <p className="text-xs text-muted-foreground">
                      O token é guardado criptografado e nunca volta para o navegador.
                    </p>
                    <details className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      <summary className="cursor-pointer font-medium text-foreground">Como gerar o token (usuário do sistema)</summary>
                      <ol className="mt-2 list-decimal space-y-1 pl-4">
                        <li>Abra o Business Manager (business.facebook.com) › Configurações do negócio › Usuários › Usuários do sistema.</li>
                        <li>Clique em Adicionar, dê um nome (por exemplo, KairoZ) e escolha a função de funcionário.</li>
                        <li>Em Atribuir ativos, escolha Contas de anúncios, marque as contas e dê a permissão Ver desempenho.</li>
                        <li>Clique em Gerar novo token, escolha um app do seu negócio, marque só a permissão <span className="font-mono">ads_read</span> e a validade Nunca.</li>
                        <li>Copie o token e cole aqui. Depois toque em Testar conexão.</li>
                      </ol>
                    </details>
                    <Button type="button" variant="outline" size="sm" onClick={testConnection} disabled={testing || (!token.trim() && !status.hasOwnToken)}>
                      {testing ? "Testando..." : "Testar conexão"}
                    </Button>
                    {testMessage && (
                      <p role="status" className={testMessage.tone === "ok" ? "text-xs font-medium text-success" : "text-xs font-medium text-destructive"}>
                        {testMessage.text}
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="panel-accounts">Contas de anúncios</Label>
                <Textarea
                  id="panel-accounts"
                  value={accounts}
                  onChange={(event) => setAccounts(event.target.value)}
                  placeholder={"act_123456789\nact_987654321"}
                  rows={3}
                />
                {found && found.length > 0 && (
                  <ul className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-1.5">
                    {found.map((account) => (
                      <li key={account.id}>
                        <label className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
                          <input type="checkbox" className="mt-1" checked={selectedIds.includes(account.id)} onChange={() => toggleAccount(account.id)} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-foreground">{account.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {account.id}{account.business ? ` · ${account.business}` : ""}{account.currency ? ` · ${account.currency}` : ""}{account.active ? "" : " · inativa"}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground">
                  Uma por linha. Os números das contas são somados. Vazio usa a conta do Facebook conectado.
                </p>
              </div>
            </>
          )}

          {status.canEditGoal && (
            <div className="space-y-2">
              <Label htmlFor="panel-goal">Meta de conversas no mês</Label>
              <Input
                id="panel-goal"
                type="number"
                min={1}
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                placeholder="Ex.: 300"
              />
              <p className="text-xs text-muted-foreground">Vazio esconde o bloco da meta.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar painel"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------
// Página
// ------------------------------------------------------------------
export default function Painel() {
  const { organizationId } = useOrganization();
  const [preset, setPreset] = useState<PresetKey>("7d");
  const [custom, setCustom] = useState(() => ({ from: shiftDays(todayBrt(), -6), to: todayBrt() }));
  const [configOpen, setConfigOpen] = useState(false);
  const range = rangeFor(preset, custom);
  const endsToday = range.to >= todayBrt();
  const validRange = range.from <= range.to;

  // Atualiza sozinho a cada 5 min quando o período termina hoje e a aba está visível.
  const refetchInterval = () =>
    endsToday && typeof document !== "undefined" && document.visibilityState === "visible" ? 5 * 60_000 : false;

  const statusQuery = useQuery({
    queryKey: ["panel", "status", organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => invokePanel<PanelStatus>({ mode: "status", organization_id: organizationId }),
  });

  const metaQuery = useQuery({
    queryKey: ["panel", "meta", organizationId, range.from, range.to],
    enabled: Boolean(organizationId) && statusQuery.data?.enabled === true && validRange,
    queryFn: () => invokePanel<MetaInsights>({ mode: "insights", organization_id: organizationId, from: range.from, to: range.to }),
    refetchInterval,
    placeholderData: (previous) => previous,
  });

  const attendanceQuery = useQuery({
    queryKey: ["panel", "attendance", organizationId, range.from, range.to],
    enabled: Boolean(organizationId) && validRange,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("panel_attendance", {
        p_organization_id: organizationId!,
        p_from: range.from,
        p_to: range.to,
      });
      if (error) throw error;
      return (data ?? []) as AttendanceDay[];
    },
    refetchInterval,
    placeholderData: (previous) => previous,
  });

  const adEntriesQuery = useQuery({
    queryKey: ["panel", "ad-entries", organizationId, range.from, range.to],
    enabled: Boolean(organizationId) && validRange,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("panel_ad_entries_daily", {
        p_organization_id: organizationId!,
        p_from: range.from,
        p_to: range.to,
      });
      if (error) throw error;
      return (data ?? []) as AdEntryRow[];
    },
    refetchInterval,
    placeholderData: (previous) => previous,
  });

  const stagesQuery = useQuery({
    queryKey: ["panel", "stage-events", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("funnel_stages")
        .select("id, linked_event, sales_funnels!inner(organization_id)")
        .eq("sales_funnels.organization_id", organizationId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const attendanceTotals = useMemo(() => sumAttendance(attendanceQuery.data ?? []), [attendanceQuery.data]);
  const rates = attendanceRates(attendanceTotals);
  const missingEvents = stagesQuery.data ? missingMeetingEvents(stagesQuery.data) : [];
  const adEntryTable = useMemo(() => {
    const scheduledByDay = Object.fromEntries(
      (attendanceQuery.data ?? []).map((row) => [String(row.day).slice(0, 10), row.scheduled_from_ads]),
    );
    return buildAdEntryTable(adEntriesQuery.data ?? [], scheduledByDay, range.from, range.to);
  }, [adEntriesQuery.data, attendanceQuery.data, range.from, range.to]);

  const status = statusQuery.data;
  const meta = metaQuery.data;
  const result = meta?.result;
  const previous = meta?.previousResult;
  const indicators = meta?.indicators;
  const costPerScheduledFromAds = result && attendanceTotals.scheduled_from_ads > 0
    ? result.spend / attendanceTotals.scheduled_from_ads
    : null;

  // Negócio de formulário: leads viram o número principal; conversas só aparecem se houver.
  const leadMode = !!result && (result.leads ?? 0) > 0 && (result.leads ?? 0) >= result.conversations;
  const mainCount = result ? (leadMode ? result.leads ?? 0 : result.conversations) : 0;
  const unit = leadMode ? "leads" : "conversas";
  const goal = status?.monthlyConversationGoal && preset === "this_month" && result
    ? goalProgress(status.monthlyConversationGoal, mainCount, Number(todayBrt().slice(8)), daysInMonth(todayBrt()))
    : null;

  const refresh = () => {
    void statusQuery.refetch();
    void attendanceQuery.refetch();
    void adEntriesQuery.refetch();
    if (status?.enabled) {
      void invokePanel<MetaInsights>({ mode: "insights", organization_id: organizationId, from: range.from, to: range.to, refresh: true })
        .then(() => metaQuery.refetch());
    }
  };

  if (!organizationId) {
    return <div className="p-6 text-sm text-muted-foreground">Nenhuma organização ativa.</div>;
  }

  return (
    <div className="space-y-6 p-3 sm:p-4 md:p-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Gauge className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Painel de acompanhamento</h1>
            <p className="text-sm text-muted-foreground">
              Anúncios e atendimento no mesmo lugar. Horário de Brasília.
              {meta?.fetchedAt && ` Meta lida às ${new Date(meta.fetchedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={preset} onValueChange={(value) => setPreset(value as PresetKey)}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRESETS.map((item) => <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {preset === "custom" && (
            <div className="flex items-center gap-1">
              <Input type="date" className="h-9 w-[150px]" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="Data inicial" />
              <span className="text-sm text-muted-foreground">até</span>
              <Input type="date" className="h-9 w-[150px]" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="Data final" />
            </div>
          )}
          <Button variant="outline" size="sm" className="h-9 gap-2" onClick={refresh}>
            <RefreshCw className={cn("h-4 w-4", (metaQuery.isFetching || attendanceQuery.isFetching) && "animate-spin")} />
            Atualizar
          </Button>
          {(status?.canConfigure || status?.canEditGoal) && (
            <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => setConfigOpen(true)}>
              <Settings2 className="h-4 w-4" />
              Configurar
            </Button>
          )}
        </div>
      </div>

      {!validRange && <p className="text-sm text-destructive">A data inicial precisa ser antes da final.</p>}

      {/* Anúncios */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Resultado dos anúncios</h2>
        {statusQuery.isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : statusQuery.isError ? (
          <Card><CardContent className="p-4 text-sm text-destructive">Não foi possível carregar o painel. Recarregue a página para tentar de novo.</CardContent></Card>
        ) : !status?.enabled ? (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              Os números da Meta não estão ligados nesta organização.
              {status?.canConfigure ? " Use Configurar para ligar." : " Peça ao dono ou a um administrador da organização para ligar."}
              {" "}O atendimento abaixo não depende da Meta.
            </CardContent>
          </Card>
        ) : metaQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        ) : meta?.error ? (
          <Card><CardContent className="p-4 text-sm text-destructive">{meta.error}</CardContent></Card>
        ) : result ? (
          <>
            {meta.warning && <p className="text-sm text-amber-600 dark:text-amber-400">{meta.warning}</p>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {leadMode ? (
                <>
                  <Stat label="Leads" value={formatNumber(result.leads)} help="Pessoas que preencheram o formulário dos anúncios.">
                    <Delta current={result.leads} previous={previous?.leads} />
                  </Stat>
                  <Stat label="Custo por lead" value={formatCurrency(result.costPerLead ?? null)} help="Gasto das campanhas que geraram leads ÷ leads.">
                    <Delta current={result.costPerLead ?? null} previous={previous?.costPerLead ?? null} lowerIsBetter />
                  </Stat>
                  <Stat label="Investido" value={formatCurrency(result.spend)}>
                    <Delta current={result.spend} previous={previous?.spend} />
                  </Stat>
                  {result.conversations > 0 ? (
                    <Stat label="Conversas" value={formatNumber(result.conversations)} help="Conversas no WhatsApp iniciadas pelos anúncios.">
                      <Delta current={result.conversations} previous={previous?.conversations} />
                    </Stat>
                  ) : (
                    <Stat label="CPM" value={formatCurrency(indicators?.cpm ?? null)} help="Custo a cada mil impressões." />
                  )}
                </>
              ) : (
                <>
                  <Stat label="Conversas" value={formatNumber(result.conversations)} help="Conversas no WhatsApp iniciadas pelos anúncios.">
                    <Delta current={result.conversations} previous={previous?.conversations} />
                  </Stat>
                  <Stat label="Custo por conversa" value={formatCurrency(result.costPerConversation)} help="Gasto das campanhas de conversa ÷ conversas. Tráfego e alcance ficam de fora.">
                    <Delta current={result.costPerConversation} previous={previous?.costPerConversation} lowerIsBetter />
                  </Stat>
                  <Stat label="Investido" value={formatCurrency(result.spend)}>
                    <Delta current={result.spend} previous={previous?.spend} />
                  </Stat>
                  <Stat label="Conversas reais" value={formatNumber(result.realConversations)} help="Conversas em que o lead mandou a segunda mensagem, ou seja, continuou o papo.">
                    <Delta current={result.realConversations} previous={previous?.realConversations} />
                  </Stat>
                </>
              )}
            </div>

            {indicators && (
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Alcance" value={formatNumber(indicators.reach)} help="Pessoas diferentes que viram os anúncios." />
                <Stat label="Impressões" value={formatNumber(indicators.impressions)} />
                <Stat label="Cliques no link" value={formatNumber(indicators.linkClicks)} />
                <Stat label="CTR" value={formatPercent(indicators.ctr, 2)} help="Cliques ÷ impressões." />
                <Stat label="Frequência" value={formatNumber(indicators.frequency, 2)} help="Quantas vezes, em média, cada pessoa viu." />
                <Stat label="CPM" value={formatCurrency(indicators.cpm)} help="Custo a cada mil impressões." />
              </div>
            )}

            {goal && (
              <Card>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Meta do mês: {formatNumber(goal.goal)} {unit}</p>
                    <Badge variant={goal.state === "behind" ? "destructive" : "secondary"}>
                      {goal.state === "reached" ? "Meta batida" : goal.state === "on_pace" ? "No ritmo" : goal.state === "behind" ? "Abaixo do ritmo" : "Começo do mês"}
                    </Badge>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${Math.min(100, (goal.done / goal.goal) * 100)}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatNumber(goal.done)} feitas; o esperado até hoje era {formatNumber(goal.expected)}.
                    {goal.state === "on_pace" && ` No ritmo atual, a meta é batida: cerca de ${formatNumber(goal.pace)} ${unit} no mês.`}
                    {goal.state === "behind" && ` Faltam cerca de ${formatNumber(goal.perDayNeeded)} por dia para bater.`}
                  </p>
                </CardContent>
              </Card>
            )}

            {meta.daily && meta.daily.length > 1 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{leadMode ? "Leads e custo por dia" : "Conversas por dia"}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Barras: {unit} por dia (eixo da esquerda). Linha: {leadMode ? "custo por lead" : "custo por conversa"} (eixo da direita).
                  </p>
                </CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={meta.daily.map((point) => ({
                      ...point,
                      count: leadMode ? point.leads ?? 0 : point.conversations,
                      cost: leadMode ? point.costPerLead ?? null : point.costPerConversation,
                      label: formatDay(point.date),
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} domain={[0, "auto"]} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} domain={[0, "auto"]} tickFormatter={(v: number) => formatCurrency(v)} width={68} />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                        formatter={(value: number, name: string) => name.startsWith("Custo") ? formatCurrency(value) : formatNumber(value)}
                      />
                      <Bar yAxisId="left" dataKey="count" name={leadMode ? "Leads" : "Conversas"} fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} maxBarSize={28} />
                      <Line yAxisId="right" type="linear" dataKey="cost" name={leadMode ? "Custo por lead" : "Custo por conversa"} stroke="hsl(var(--foreground))" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                  
                </CardContent>
              </Card>
            )}

            {meta.creatives && meta.creatives.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Criativo por criativo</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Anúncio</th>
                        <th className="py-2 pr-3 text-right font-medium">Investido</th>
                        <th className="py-2 pr-3 text-right font-medium">{leadMode ? "Leads" : "Conversas"}</th>
                        <th className="py-2 pr-3 text-right font-medium">{leadMode ? "Custo por lead" : "Custo"}</th>
                        {!leadMode && <th className="py-2 pr-3 text-right font-medium">Continuaram</th>}
                        <th className="py-2 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {(leadMode ? [...meta.creatives].sort((x, y) => (y.leads ?? 0) - (x.leads ?? 0) || y.spend - x.spend) : meta.creatives).slice(0, 30).map((creative) => {
                        const verdict = leadMode ? creative.leadVerdict : creative.verdict;
                        return (
                        <tr key={creative.adId} className="border-t">
                          <td className="py-2 pr-3">
                            <p className="font-medium">{creative.name}</p>
                            {creative.campaignName && <p className="text-xs text-muted-foreground">{creative.campaignName}</p>}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(creative.spend)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatNumber(leadMode ? creative.leads ?? 0 : creative.conversations)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(leadMode ? creative.costPerLead ?? null : creative.cost)}</td>
                          {!leadMode && <td className="py-2 pr-3 text-right tabular-nums">{formatPercent(creative.continuedRate)}</td>}
                          <td className="py-2">
                            {verdict === "best" && <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Melhor</Badge>}
                            {verdict === "review" && <Badge variant="destructive">Revisar</Badge>}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {leadMode
                      ? "Melhor: 5 leads ou mais e custo até a média. Revisar: custo 25% acima da média."
                      : "Melhor: 5 conversas ou mais, custo até a média e metade ou mais continuou a conversa. Revisar: custo 25% acima da média, ou menos de 30% continuou."}
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        ) : null}
      </section>

      {/* Atendimento */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Atendimento</h2>
        {missingEvents.length > 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Para completar o atendimento, marque nas etapas do funil: {missingEvents.map((event) => MEETING_EVENT_INFO[event].label).join(", ")}.
            Isso fica em Funil de Vendas, configuração das etapas, campo "Esta etapa representa".
          </p>
        )}
        {attendanceQuery.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : attendanceQuery.isError ? (
          <Card><CardContent className="p-4 text-sm text-destructive">Não foi possível carregar o atendimento. Recarregue a página para tentar de novo.</CardContent></Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Agendamento" value={formatPercent(rates.scheduling)} help="Agendados ÷ leads novos." />
              <Stat label="Confirmação" value={formatPercent(rates.confirmation)} help="Confirmados ÷ agendados." />
              <Stat label="Comparecimento" value={formatPercent(rates.attendance)} help="Compareceram ÷ (compareceram + faltas)." />
              <Stat label="Fechamento" value={formatPercent(rates.closing)} help="Vendas ÷ compareceram." />
              <Stat label="Lead → venda" value={formatPercent(rates.leadToWon, 1)} help="Vendas ÷ leads novos." />
              <Stat
                label="Custo por agendado de anúncio"
                value={status?.enabled ? formatCurrency(costPerScheduledFromAds) : "-"}
                help={`Investido ÷ agendados que vieram de anúncio (${formatNumber(attendanceTotals.scheduled_from_ads)}).`}
              />
            </div>

            <Card>
              <CardContent className="overflow-x-auto p-4">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Dia</th>
                      <th className="py-2 pr-3 text-right font-medium">Leads novos</th>
                      <th className="py-2 pr-3 text-right font-medium">Agendados</th>
                      <th className="py-2 pr-3 text-right font-medium">De anúncio</th>
                      <th className="py-2 pr-3 text-right font-medium">Confirmados</th>
                      <th className="py-2 pr-3 text-right font-medium">Compareceram</th>
                      <th className="py-2 pr-3 text-right font-medium">Faltaram</th>
                      <th className="py-2 pr-3 text-right font-medium">Vendas</th>
                      <th className="py-2 text-right font-medium">Perdidos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(attendanceQuery.data ?? [])].reverse().map((day) => (
                      <tr key={day.day} className="border-t tabular-nums">
                        <td className="py-1.5 pr-3">{formatDay(String(day.day).slice(0, 10))}</td>
                        <td className="py-1.5 pr-3 text-right">{day.new_leads}</td>
                        <td className="py-1.5 pr-3 text-right">{day.scheduled}</td>
                        <td className="py-1.5 pr-3 text-right">{day.scheduled_from_ads}</td>
                        <td className="py-1.5 pr-3 text-right">{day.confirmed}</td>
                        <td className="py-1.5 pr-3 text-right">{day.attended}</td>
                        <td className="py-1.5 pr-3 text-right">{day.no_show}</td>
                        <td className="py-1.5 pr-3 text-right">{day.won}</td>
                        <td className="py-1.5 text-right">{day.lost}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 font-semibold tabular-nums">
                      <td className="py-1.5 pr-3">Total</td>
                      <td className="py-1.5 pr-3 text-right">{attendanceTotals.new_leads}</td>
                      <td className="py-1.5 pr-3 text-right">{attendanceTotals.scheduled}</td>
                      <td className="py-1.5 pr-3 text-right">{attendanceTotals.scheduled_from_ads}</td>
                      <td className="py-1.5 pr-3 text-right">{attendanceTotals.confirmed}</td>
                      <td className="py-1.5 pr-3 text-right">{attendanceTotals.attended}</td>
                      <td className="py-1.5 pr-3 text-right">{attendanceTotals.no_show}</td>
                      <td className="py-1.5 pr-3 text-right">{attendanceTotals.won}</td>
                      <td className="py-1.5 text-right">{attendanceTotals.lost}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-muted-foreground">
                  Cada lead conta uma vez por dia em cada coluna. Compareceram e faltaram também contam a marcação feita no card.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </section>

      {/* Leads de anúncio por dia */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Leads de anúncio por dia</h2>
          <p className="text-sm text-muted-foreground">
            Leads que chegaram pela palavra-chave do anúncio no WhatsApp ou pelo formulário da Meta.
            As palavras-chave ficam em Integrações, rastreamento do canal.
          </p>
        </div>
        {adEntriesQuery.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : adEntriesQuery.isError ? (
          <Card><CardContent className="p-4 text-sm text-destructive">Não foi possível carregar os leads de anúncio. Recarregue a página para tentar de novo.</CardContent></Card>
        ) : adEntryTable.sources.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              Nenhum lead de anúncio neste período. Cadastre as palavras-chave do anúncio no rastreamento do canal para começar a contar.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="overflow-x-auto p-4">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Dia</th>
                    {adEntryTable.sources.map((source) => (
                      <th key={source.key} className="py-2 pr-3 text-right font-medium" title={source.label}>
                        <span className="inline-block max-w-[140px] truncate align-bottom">{source.label}</span>
                      </th>
                    ))}
                    <th className="py-2 pr-3 text-right font-medium">Total</th>
                    <th className="py-2 text-right font-medium">Agendados</th>
                  </tr>
                </thead>
                <tbody>
                  {adEntryTable.days.map((row) => (
                    <tr key={row.day} className={cn("border-t tabular-nums", row.total === 0 && "text-muted-foreground")}>
                      <td className="py-1.5 pr-3">{formatDay(row.day)}</td>
                      {adEntryTable.sources.map((source) => (
                        <td key={source.key} className="py-1.5 pr-3 text-right">{row.bySource[source.key] ?? 0}</td>
                      ))}
                      <td className="py-1.5 pr-3 text-right font-medium">{row.total}</td>
                      <td className="py-1.5 text-right">{row.scheduled}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 font-semibold tabular-nums">
                    <td className="py-1.5 pr-3">Total</td>
                    {adEntryTable.sources.map((source) => (
                      <td key={source.key} className="py-1.5 pr-3 text-right">{adEntryTable.totals.bySource[source.key] ?? 0}</td>
                    ))}
                    <td className="py-1.5 pr-3 text-right">{adEntryTable.totals.total}</td>
                    <td className="py-1.5 text-right">{adEntryTable.totals.scheduled}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">
                Agendados: leads de anúncio que entraram na etapa de agendamento naquele dia.
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      {status && configOpen && (
        <ConfigureDialog open={configOpen} onOpenChange={setConfigOpen} organizationId={organizationId} status={status} />
      )}
    </div>
  );
}
