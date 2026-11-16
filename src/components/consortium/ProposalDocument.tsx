import { assetTypeLabel } from "@/lib/consortium";
import { formatBRL } from "@/lib/money";
import { adjustmentIndexLabel, formatBRLCents, formatPercent } from "@/lib/consortiumSimulator";
import type { ProposalPayload, ProposalPlan } from "@/lib/consortiumProposal";

const formatDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" }) : null;

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2 last:border-b-0 print:border-zinc-200">
      <dt className="text-[13px] text-muted-foreground print:text-zinc-600">{label}</dt>
      <dd className={strong ? "text-right text-[15px] font-semibold tabular-nums" : "text-right text-[13px] tabular-nums"}>{value}</dd>
    </div>
  );
}

function PlanSection({ plan }: { plan: ProposalPlan }) {
  const title = [plan.administrator, plan.plan_name].filter(Boolean).join(" · ");
  return (
    <section className="break-inside-avoid rounded-lg border bg-card p-4 sm:p-5 print:border-zinc-300 print:bg-white">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground print:text-zinc-600">{plan.label}</p>
      <h2 className="mt-0.5 text-base font-semibold">{title}</h2>
      <p className="mt-0.5 text-[13px] text-muted-foreground print:text-zinc-600">
        {[assetTypeLabel(plan.asset_type), `${plan.term_months} meses`, `reajuste ${adjustmentIndexLabel(plan.adjustment_index)}`]
          .filter(Boolean)
          .join(" · ")}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-md bg-secondary p-3 print:bg-zinc-100">
          <p className="text-xs text-muted-foreground print:text-zinc-600">Crédito</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums sm:text-xl">{formatBRL(plan.credit)}</p>
        </div>
        <div className="rounded-md bg-secondary p-3 print:bg-zinc-100">
          <p className="text-xs text-muted-foreground print:text-zinc-600">{plan.reduced_installment ? "Parcela reduzida" : "Parcela"}</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums sm:text-xl">{formatBRLCents(plan.reduced_installment ?? plan.full_installment)}</p>
        </div>
      </div>

      <dl className="mt-3">
        {plan.reduced_installment != null && (
          <Row label={`Parcela reduzida (${formatPercent(plan.reduced_installment_percent)} a menos) até a contemplação`} value={formatBRLCents(plan.reduced_installment)} />
        )}
        <Row label="Parcela cheia" value={formatBRLCents(plan.full_installment)} />
        <Row label={`Taxa de administração (${formatPercent(plan.admin_fee_percent)})`} value={formatBRLCents(plan.admin_fee_amount)} />
        <Row label={`Fundo de reserva (${formatPercent(plan.reserve_fund_percent)})`} value={formatBRLCents(plan.reserve_fund_amount)} />
        <Row label={`Seguro (${formatPercent(plan.insurance_monthly_percent)} ao mês)`} value={formatBRLCents(plan.insurance_total)} />
        <Row label="Custo total" value={formatBRLCents(plan.total_cost)} />
        <Row label="Total pago no plano" value={formatBRLCents(plan.total_paid)} strong />
      </dl>

      {plan.bid && (
        <div className="mt-4 rounded-md border border-dashed p-3 print:border-zinc-300">
          <p className="text-sm font-semibold">{plan.bid.mode === "fixo" ? "Lance fixo" : "Lance"} no mês {plan.bid.contemplation_month}</p>
          <dl className="mt-1">
            <Row label={`Lance total (${formatPercent(plan.bid.total_percent)} do crédito)`} value={formatBRLCents(plan.bid.total_amount)} />
            {plan.bid.embedded_amount > 0 && (
              <Row label={`Embutido no crédito (${formatPercent(plan.bid.embedded_percent)})`} value={formatBRLCents(plan.bid.embedded_amount)} />
            )}
            {plan.bid.own_amount > 0 && <Row label="Recurso próprio" value={formatBRLCents(plan.bid.own_amount)} />}
            <Row label="Crédito que você recebe" value={formatBRLCents(plan.bid.net_credit)} strong />
            {plan.bid.installment_after_bid > 0 && (
              <Row label="Parcela depois do lance (mesmo prazo)" value={formatBRLCents(plan.bid.installment_after_bid)} />
            )}
            <Row label="Ou meses restantes (mesma parcela)" value={`${plan.bid.remaining_months_after_bid}`} />
          </dl>
        </div>
      )}
    </section>
  );
}

/** Proposta de consórcio pronta para o cliente (tela e impressão). */
export function ProposalDocument({ payload }: { payload: ProposalPayload }) {
  const created = formatDate(payload.created_at);
  const expires = formatDate(payload.expires_at);
  return (
    <article className="space-y-5">
      <header className="flex flex-col gap-1 border-b pb-4 print:border-zinc-300">
        <p className="text-sm font-semibold">{payload.organization.name ?? "Proposta de consórcio"}</p>
        <h1 className="text-xl font-semibold tracking-[-0.01em] sm:text-2xl">
          {payload.client.name ? `Proposta de consórcio para ${payload.client.name}` : "Proposta de consórcio"}
        </h1>
        <p className="text-[13px] text-muted-foreground print:text-zinc-600">
          {[payload.seller.name && `Consultor: ${payload.seller.name}`, created && `Feita em ${created}`, expires && `válida até ${expires}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      <div className={payload.plans.length > 1 ? "grid gap-4 md:grid-cols-2" : "grid gap-4"}>
        {payload.plans.map((plan) => (
          <PlanSection key={plan.label} plan={plan} />
        ))}
      </div>

      {payload.financing && (
        <section className="break-inside-avoid rounded-lg border bg-card p-4 sm:p-5 print:border-zinc-300 print:bg-white">
          <h2 className="text-base font-semibold">Comparação com financiamento</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground print:text-zinc-600">
            Mesmo crédito em {payload.financing.term_months} meses, com juros de {formatPercent(payload.financing.monthly_rate_percent)} ao mês.
          </p>
          <dl className="mt-2">
            <Row label="Parcela do financiamento" value={formatBRLCents(payload.financing.installment)} />
            <Row label="Juros pagos" value={formatBRLCents(payload.financing.total_interest)} />
            <Row label="Total pago no financiamento" value={formatBRLCents(payload.financing.total_paid)} strong />
            {payload.plans.map((plan) => {
              const difference = payload.financing!.total_paid - plan.total_paid;
              return (
                <Row
                  key={plan.label}
                  label={difference >= 0 ? `Economia com o ${plan.label}` : `Diferença do ${plan.label}`}
                  value={formatBRLCents(Math.abs(difference))}
                />
              );
            })}
          </dl>
        </section>
      )}

      <p className="rounded-md bg-secondary px-3 py-2.5 text-[13px] text-foreground/80 print:bg-zinc-100 print:text-zinc-700">{payload.disclaimer}</p>
    </article>
  );
}
