import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertCircle, Calculator, Check, ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/money";
import { ASSET_TYPES, maskMoneyInput, moneyToInput, parseMoneyInput, type AssetType } from "@/lib/consortium";
import {
  adjustmentIndexLabel,
  availableTerms,
  bidAmountFromPercent,
  formatBRLCents,
  formatPercent,
  installmentAfterContemplation,
  parsePercent,
  planConditions,
  planFits,
  simulateBid,
  simulateFinancing,
  simulateInstallments,
  type BidMode,
  type BidResult,
  type InstallmentResult,
  type PlanConditions,
} from "@/lib/consortiumSimulator";
import { buildProposalPayload } from "@/lib/consortiumProposal";
import { useOrganizationSegment } from "@/hooks/useOrganizationSegment";
import { useConsortiumAdministrators } from "@/hooks/useConsortium";
import { useConsortiumPlans, useCreateConsortiumProposal, type ConsortiumPlan } from "@/hooks/useConsortiumPlans";
import { ConsortiumOnlyNotice } from "@/components/consortium/ConsortiumOnlyNotice";
import { LeadPicker, type PickedLead } from "@/components/consortium/LeadPicker";
import { ProposalCreatedDialog } from "@/components/consortium/ProposalCreatedDialog";

const MAX_COMPARE = 3;
const NONE = "__none__";

interface PlanResult {
  plan: ConsortiumPlan;
  administrator: string | null;
  conditions: PlanConditions;
  installments: InstallmentResult;
  bid: BidResult | null;
  /** Parcela depois da contemplação sem lance (planos com redutor). */
  afterContemplation: number | null;
}

const BID_MODES: Array<{ value: BidMode; label: string }> = [
  { value: "nenhum", label: "Sem lance" },
  { value: "livre", label: "Lance livre" },
  { value: "fixo", label: "Lance fixo" },
];

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Panel({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border bg-card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description && <p className="text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-[15px] font-semibold tabular-nums text-foreground">{value}</p>
      {detail && <p className="text-[11px] text-muted-foreground">{detail}</p>}
    </div>
  );
}

const planTitle = (result: PlanResult) => [result.administrator, result.plan.name].filter(Boolean).join(" · ");

/** Simulador de consórcio (/simulador): planos que atendem, comparação, financiamento e proposta. */
export default function Simulador() {
  const { isConsorcio, loading } = useOrganizationSegment();
  const [searchParams] = useSearchParams();
  const leadParam = searchParams.get("lead");
  const { data: plans = [], isLoading: plansLoading } = useConsortiumPlans(isConsorcio);
  const { data: administrators = [] } = useConsortiumAdministrators(isConsorcio);
  const createProposal = useCreateConsortiumProposal();

  const [lead, setLead] = useState<PickedLead | null>(null);
  const [assetType, setAssetType] = useState<AssetType>("imovel");
  const [creditInput, setCreditInput] = useState("");
  const [term, setTerm] = useState<number | null>(null);
  const [preferredTerm, setPreferredTerm] = useState<number | null>(null);
  const [bidMode, setBidMode] = useState<BidMode>("nenhum");
  const [embeddedInput, setEmbeddedInput] = useState("");
  const [ownUnit, setOwnUnit] = useState<"valor" | "percentual">("valor");
  const [ownInput, setOwnInput] = useState("");
  const [monthInput, setMonthInput] = useState("1");
  const [selected, setSelected] = useState<string[]>([]);
  const [rateInput, setRateInput] = useState("");
  const [financingTermInput, setFinancingTermInput] = useState("");
  const [planA, setPlanA] = useState<string>(NONE);
  const [planB, setPlanB] = useState<string>(NONE);
  const [created, setCreated] = useState<{ token: string; planCount: number; leadAdvanced: boolean; clientName: string | null } | null>(null);

  // Lead vindo da ficha (?lead=<id>): carrega o lead e preenche com a qualificação.
  useEffect(() => {
    if (!leadParam || !isConsorcio) return;
    let cancelled = false;
    (async () => {
      const [{ data: leadRow }, { data: profile }] = await Promise.all([
        supabase.from("leads").select("id, nome_lead, telefone_lead").eq("id", leadParam).maybeSingle(),
        supabase.from("lead_consortium_profiles").select("*").eq("lead_id", leadParam).maybeSingle(),
      ]);
      if (cancelled) return;
      if (leadRow) setLead(leadRow);
      if (profile) {
        if (profile.asset_type && ASSET_TYPES.some((option) => option.value === profile.asset_type)) {
          setAssetType(profile.asset_type as AssetType);
        }
        if (profile.desired_credit) setCreditInput(moneyToInput(profile.desired_credit));
        if (profile.desired_term_months) setPreferredTerm(profile.desired_term_months);
        if (profile.bid_amount) {
          setBidMode("livre");
          setOwnUnit("valor");
          setOwnInput(moneyToInput(profile.bid_amount));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leadParam, isConsorcio]);

  const credit = parseMoneyInput(creditInput);
  const terms = useMemo(() => availableTerms(plans, assetType, credit), [plans, assetType, credit]);
  const termMonths =
    term != null && terms.includes(term)
      ? term
      : preferredTerm != null && terms.includes(preferredTerm)
        ? preferredTerm
        : terms.length > 0
          ? terms[terms.length - 1]
          : null;

  const embeddedPercent = parsePercent(embeddedInput) ?? 0;
  const ownRaw = ownUnit === "valor" ? parseMoneyInput(ownInput) ?? 0 : parsePercent(ownInput) ?? 0;
  const ownAmount = credit ? (ownUnit === "valor" ? ownRaw : bidAmountFromPercent(credit, ownRaw)) : 0;
  const contemplationMonth = Math.max(1, Number(monthInput.replace(/\D/g, "")) || 1);

  const results = useMemo<PlanResult[]>(() => {
    if (!credit || !termMonths) return [];
    return plans
      .filter((plan) => planFits(plan, { assetType, credit, termMonths }))
      .map((plan) => {
        const conditions = planConditions(plan);
        const installments = simulateInstallments(credit, termMonths, conditions);
        return {
          plan,
          administrator: administrators.find((admin) => admin.id === plan.administrator_id)?.name ?? null,
          conditions,
          installments,
          bid: simulateBid(installments, conditions, { mode: bidMode, embeddedPercent, ownAmount, contemplationMonth }),
          afterContemplation:
            installments.reducedInstallment != null ? installmentAfterContemplation(installments, conditions, contemplationMonth) : null,
        };
      })
      .sort((a, b) => (a.installments.reducedInstallment ?? a.installments.fullInstallment) - (b.installments.reducedInstallment ?? b.installments.fullInstallment));
  }, [plans, administrators, assetType, credit, termMonths, bidMode, embeddedPercent, ownAmount, contemplationMonth]);

  const compared = selected
    .map((id) => results.find((result) => result.plan.id === id))
    .filter((result): result is PlanResult => !!result);

  const rate = parsePercent(rateInput);
  const financingTerm = Number(financingTermInput.replace(/\D/g, "")) || termMonths || 0;
  const financing =
    credit && rate != null && rate >= 0 && rate <= 20 && financingTerm >= 1 && financingTerm <= 480
      ? simulateFinancing(credit, rate, financingTerm)
      : null;

  const resultA = compared.find((result) => result.plan.id === planA) ?? compared[0] ?? null;
  const resultB = compared.find((result) => result.plan.id === planB && result.plan.id !== resultA?.plan.id) ?? null;

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= MAX_COMPARE) {
        toast.error(`Compare até ${MAX_COMPARE} planos. Tire um para escolher outro.`);
        return current;
      }
      return [...current, id];
    });
  };

  const handleCreateProposal = () => {
    if (!lead) {
      toast.error("Escolha o lead que vai receber a proposta.");
      return;
    }
    if (!resultA || !credit) {
      toast.error("Escolha ao menos um plano para comparar.");
      return;
    }
    const chosen = [resultA, resultB].filter((result): result is PlanResult => !!result);
    const payload = buildProposalPayload({
      credit,
      assetType,
      financing,
      plans: chosen.map((result) => ({
        administrator: result.administrator,
        planName: result.plan.name,
        assetType: result.plan.asset_type,
        adjustmentIndex: result.plan.adjustment_index,
        conditions: result.conditions,
        installments: result.installments,
        bid: result.bid,
      })),
    });
    createProposal.mutate(
      { leadId: lead.id, payload },
      {
        onSuccess: (data) =>
          setCreated({ token: data.token, planCount: chosen.length, leadAdvanced: data.leadAdvanced, clientName: lead.nome_lead }),
        onError: (error) => {
          console.error("Erro ao criar a proposta:", error);
          toast.error("Não foi possível criar a proposta. Tente novamente.");
        },
      },
    );
  };

  if (loading) return <p className="p-4 text-sm text-muted-foreground">Carregando...</p>;
  if (!isConsorcio) return <ConsortiumOnlyNotice />;

  const activePlans = plans.filter((plan) => plan.is_active).length;
  const comparisonRows: Array<{ label: string; value: (result: PlanResult) => string }> = [
    { label: "Prazo", value: (r) => `${r.installments.termMonths} meses` },
    { label: "Parcela cheia", value: (r) => formatBRLCents(r.installments.fullInstallment) },
    { label: "Parcela reduzida", value: (r) => (r.installments.reducedInstallment != null ? formatBRLCents(r.installments.reducedInstallment) : "—") },
    { label: "Taxa de administração", value: (r) => formatPercent(r.conditions.adminFeePercent) },
    { label: "Fundo de reserva", value: (r) => formatPercent(r.conditions.reserveFundPercent) },
    { label: "Seguro ao mês", value: (r) => formatPercent(r.conditions.insuranceMonthlyPercent) },
    { label: "Reajuste", value: (r) => adjustmentIndexLabel(r.plan.adjustment_index) },
    { label: "Custo total", value: (r) => `${formatBRLCents(r.installments.totalCost)} (${formatPercent(r.installments.costPercent)})` },
    { label: "Total pago", value: (r) => formatBRLCents(r.installments.totalPaid) },
    ...(bidMode !== "nenhum"
      ? [
          { label: "Lance total", value: (r: PlanResult) => (r.bid && !r.bid.unavailable ? `${formatBRLCents(r.bid.totalAmount)} (${formatPercent(r.bid.totalPercent)})` : "Sem lance fixo") },
          { label: "Crédito líquido", value: (r: PlanResult) => (r.bid && !r.bid.unavailable ? formatBRLCents(r.bid.netCredit) : "—") },
          { label: "Parcela depois do lance", value: (r: PlanResult) => (r.bid && !r.bid.unavailable ? formatBRLCents(r.bid.installmentAfterBid) : "—") },
        ]
      : []),
    ...(financing
      ? [{ label: "Economia sobre o financiamento", value: (r: PlanResult) => formatBRLCents(financing.totalPaid - r.installments.totalPaid) }]
      : []),
  ];

  return (
    <div className="mx-auto w-full max-w-[1280px] px-1 pb-6 pt-2 sm:px-2 sm:pt-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-[-0.01em] text-foreground sm:text-2xl">Simulador</h1>
          <p className="text-[13px] text-muted-foreground">
            {activePlans === 1 ? "1 plano ativo" : `${activePlans} planos ativos`} · valores estimados, as condições finais são as da administradora
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/simulador/planos">
            <ListChecks />
            Planos
          </Link>
        </Button>
      </div>

      <div className="mt-5 space-y-4">
        <Panel title="Simulação" description={lead ? `Para ${lead.nome_lead}` : undefined}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Tipo de bem">
              <Select value={assetType} onValueChange={(value) => setAssetType(value as AssetType)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSET_TYPES.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Crédito" htmlFor="sim-credit">
              <Input id="sim-credit" value={creditInput} onChange={(e) => setCreditInput(maskMoneyInput(e.target.value))} placeholder="R$ 300.000" inputMode="decimal" />
            </Field>
            <Field label="Prazo">
              <Select
                value={termMonths ? String(termMonths) : NONE}
                onValueChange={(value) => setTerm(value === NONE ? null : Number(value))}
                disabled={terms.length === 0}
              >
                <SelectTrigger className="h-9"><SelectValue placeholder="Sem prazo" /></SelectTrigger>
                <SelectContent>
                  {terms.length === 0 && <SelectItem value={NONE} disabled>Nenhum prazo</SelectItem>}
                  {terms.map((value) => <SelectItem key={value} value={String(value)}>{value} meses</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="mt-4 border-t pt-4">
            <div className="flex w-full items-center gap-0.5 overflow-x-auto rounded-md border bg-card p-0.5 sm:w-auto sm:max-w-fit" role="group" aria-label="Lance">
              {BID_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  aria-pressed={bidMode === mode.value}
                  onClick={() => setBidMode(mode.value)}
                  className={cn(
                    "h-7 flex-1 whitespace-nowrap rounded px-3 text-[13px] font-medium transition-colors sm:flex-none",
                    bidMode === mode.value ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            {bidMode !== "nenhum" && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Lance embutido (% do crédito)" htmlFor="sim-embedded" hint="Limitado ao máximo de cada plano.">
                  <Input id="sim-embedded" value={embeddedInput} onChange={(e) => setEmbeddedInput(e.target.value.slice(0, 6))} placeholder="0" inputMode="decimal" />
                </Field>
                {bidMode === "livre" && (
                  <Field label="Recurso próprio" htmlFor="sim-own" hint={credit && ownAmount > 0 ? `${formatBRL(ownAmount)} · ${formatPercent((ownAmount / credit) * 100)} do crédito` : undefined}>
                    <div className="flex gap-1.5">
                      <Input
                        id="sim-own"
                        className="min-w-0"
                        value={ownInput}
                        onChange={(e) => setOwnInput(ownUnit === "valor" ? maskMoneyInput(e.target.value) : e.target.value.slice(0, 6))}
                        placeholder={ownUnit === "valor" ? "R$ 50.000" : "20"}
                        inputMode="decimal"
                      />
                      <Select
                        value={ownUnit}
                        onValueChange={(value) => {
                          setOwnUnit(value as "valor" | "percentual");
                          setOwnInput("");
                        }}
                      >
                        <SelectTrigger className="h-9 w-[76px] flex-shrink-0" aria-label="Unidade do recurso próprio"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="valor">R$</SelectItem>
                          <SelectItem value="percentual">%</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </Field>
                )}
                <Field label="Mês do lance" htmlFor="sim-month" hint="Use 1 para a primeira assembleia.">
                  <Input id="sim-month" value={monthInput} onChange={(e) => setMonthInput(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" />
                </Field>
              </div>
            )}
          </div>
        </Panel>

        <Panel
          title="Planos que atendem"
          description={
            results.length > 0
              ? `${results.length === 1 ? "1 plano" : `${results.length} planos`} para ${credit ? formatBRL(credit) : ""} em ${termMonths} meses. Marque até ${MAX_COMPARE} para comparar.`
              : undefined
          }
        >
          {plansLoading ? (
            <p className="text-sm text-muted-foreground">Carregando planos...</p>
          ) : activePlans === 0 ? (
            <EmptyState text="Nenhum plano cadastrado ainda. Cadastre os planos das administradoras para simular." link />
          ) : !credit ? (
            <EmptyState text="Informe o crédito para ver os planos." />
          ) : results.length === 0 ? (
            <EmptyState text="Nenhum plano para este tipo de bem, crédito e prazo. Mude o crédito ou cadastre outro plano." link />
          ) : (
            <ul className="space-y-2">
              {results.map((result) => {
                const isSelected = selected.includes(result.plan.id);
                const { installments, bid } = result;
                return (
                  <li key={result.plan.id} className={cn("rounded-md border p-3 transition-colors", isSelected && "border-foreground")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{planTitle(result)}</p>
                        <p className="text-xs text-muted-foreground">
                          Taxa {formatPercent(result.conditions.adminFeePercent)} · fundo {formatPercent(result.conditions.reserveFundPercent)} · seguro{" "}
                          {formatPercent(result.conditions.insuranceMonthlyPercent)} ao mês · {adjustmentIndexLabel(result.plan.adjustment_index)}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-pressed={isSelected}
                        onClick={() => toggleSelected(result.plan.id)}
                        className={cn("flex-shrink-0", isSelected && "bg-accent")}
                      >
                        {isSelected && <Check />}
                        {isSelected ? "Comparando" : "Comparar"}
                      </Button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <Stat label="Parcela cheia" value={formatBRLCents(installments.fullInstallment)} />
                      <Stat
                        label="Parcela reduzida"
                        value={installments.reducedInstallment != null ? formatBRLCents(installments.reducedInstallment) : "—"}
                        detail={
                          result.afterContemplation != null
                            ? `Depois da contemplação no mês ${contemplationMonth}: ${formatBRLCents(result.afterContemplation)}`
                            : "Plano sem redutor"
                        }
                      />
                      <Stat label="Custo total" value={formatBRLCents(installments.totalCost)} detail={`${formatPercent(installments.costPercent)} do crédito`} />
                      <Stat label="Total pago" value={formatBRLCents(installments.totalPaid)} />
                    </div>
                    {bid && (
                      <div className="mt-3 rounded-md bg-secondary px-3 py-2 text-[13px]">
                        {bid.unavailable ? (
                          <span className="text-muted-foreground">Este plano não tem lance fixo.</span>
                        ) : (
                          <>
                            <span className="tabular-nums">
                              Lance de <strong>{formatBRLCents(bid.totalAmount)}</strong> ({formatPercent(bid.totalPercent)}) · crédito líquido{" "}
                              <strong>{formatBRLCents(bid.netCredit)}</strong> · depois, parcela de {formatBRLCents(bid.installmentAfterBid)} ou{" "}
                              {bid.remainingMonthsAfterBid} meses restantes
                            </span>
                            {bid.embeddedCapped && (
                              <span className="mt-1 flex items-center gap-1 text-xs text-warning">
                                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                Lance embutido limitado a {formatPercent(result.conditions.maxEmbeddedBidPercent)} neste plano.
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <Panel title="Comparação" description={compared.length === 0 ? "Marque planos na lista para ver lado a lado." : undefined}>
              {compared.length > 0 && (
                <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
                  <table className="w-full min-w-[480px] text-[13px] tabular-nums">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="py-2 pr-3 font-medium text-muted-foreground" scope="col"><span className="sr-only">Item</span></th>
                        {compared.map((result) => (
                          <th key={result.plan.id} scope="col" className="py-2 pr-3 font-semibold text-foreground">{planTitle(result)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonRows.map((row) => (
                        <tr key={row.label} className="border-b last:border-b-0">
                          <th scope="row" className="py-2 pr-3 text-left font-normal text-muted-foreground">{row.label}</th>
                          {compared.map((result) => (
                            <td key={result.plan.id} className="py-2 pr-3">{row.value(result)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          <Panel title="Financiamento" description="Mesmo crédito na tabela Price, para comparar.">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Juros (% ao mês)" htmlFor="sim-rate">
                <Input id="sim-rate" value={rateInput} onChange={(e) => setRateInput(e.target.value.slice(0, 6))} placeholder="1,2" inputMode="decimal" />
              </Field>
              <Field label="Prazo (meses)" htmlFor="sim-fin-term">
                <Input
                  id="sim-fin-term"
                  value={financingTermInput}
                  onChange={(e) => setFinancingTermInput(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  placeholder={termMonths ? String(termMonths) : "200"}
                  inputMode="numeric"
                />
              </Field>
            </div>
            {financing ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Stat label="Parcela" value={formatBRLCents(financing.installment)} />
                <Stat label="Total pago" value={formatBRLCents(financing.totalPaid)} detail={`${formatBRLCents(financing.totalInterest)} de juros`} />
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">Informe o crédito e os juros para comparar.</p>
            )}
          </Panel>
        </div>

        <Panel title="Proposta" description="Plano A e, se quiser, Plano B. O cliente recebe um link que vale 30 dias.">
          {compared.length === 0 ? (
            <EmptyState text="Marque ao menos um plano para montar a proposta." />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
              <Field label="Plano A">
                <Select value={resultA?.plan.id ?? NONE} onValueChange={setPlanA}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {compared.map((result) => <SelectItem key={result.plan.id} value={result.plan.id}>{planTitle(result)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Plano B">
                <Select value={resultB?.plan.id ?? NONE} onValueChange={setPlanB}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem Plano B</SelectItem>
                    {compared
                      .filter((result) => result.plan.id !== resultA?.plan.id)
                      .map((result) => <SelectItem key={result.plan.id} value={result.plan.id}>{planTitle(result)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Lead" htmlFor="sim-proposal-lead">
                <LeadPicker id="sim-proposal-lead" value={lead} onChange={setLead} />
              </Field>
              <Button onClick={handleCreateProposal} disabled={createProposal.isPending}>
                <Calculator />
                {createProposal.isPending ? "Criando..." : "Criar proposta"}
              </Button>
            </div>
          )}
        </Panel>
      </div>

      <ProposalCreatedDialog
        open={!!created}
        onOpenChange={(open) => !open && setCreated(null)}
        token={created?.token ?? null}
        clientName={created?.clientName ?? null}
        planCount={created?.planCount ?? 1}
        leadAdvanced={created?.leadAdvanced ?? false}
      />
    </div>
  );
}

function EmptyState({ text, link }: { text: string; link?: boolean }) {
  return (
    <div className="rounded-md border border-dashed px-4 py-6 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
      {link && (
        <Button variant="outline" size="sm" className="mt-3" asChild>
          <Link to="/simulador/planos">Ver planos</Link>
        </Button>
      )}
    </div>
  );
}
