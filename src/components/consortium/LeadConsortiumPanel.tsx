import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/money";
import {
  ASSET_TYPES,
  PURCHASE_TIMEFRAMES,
  SALE_STATUS,
  assetTypeLabel,
  isSaleStatus,
  maskMoneyInput,
  moneyToInput,
  parseMoneyInput,
  parseMonths,
  saleCounts,
  todayInBrazil,
  type ConsortiumSaleStatus,
} from "@/lib/consortium";
import {
  useConsortiumAdministrators,
  useLeadConsortiumProfile,
  useLeadConsortiumSales,
  useSaveLeadConsortiumProfile,
  useUpdateConsortiumSale,
  type ConsortiumSale,
} from "@/hooks/useConsortium";
import { useOrganizationSegment } from "@/hooks/useOrganizationSegment";
import { ConsortiumSaleDialog } from "./ConsortiumSaleDialog";
import { LeadProposalsCard } from "./LeadProposalsCard";

const NONE = "__none__";

const STATUS_TONE: Record<ConsortiumSaleStatus, string> = {
  aguardando_primeira_parcela: "bg-warning-tint text-warning",
  ativa: "bg-success-tint text-success",
  cancelada: "bg-secondary text-muted-foreground",
};

const formatDate = (value: string | null) =>
  value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "";

interface LeadConsortiumPanelProps {
  leadId: string;
  leadName?: string | null;
  leadValue?: number | null;
}

/** Qualificação de consórcio e cotas vendidas, na ficha do lead (modo consórcio). */
export function LeadConsortiumPanel({ leadId, leadName, leadValue }: LeadConsortiumPanelProps) {
  return (
    <div className="space-y-3 sm:space-y-4">
      <QualificationCard leadId={leadId} />
      <LeadProposalsCard leadId={leadId} leadName={leadName} />
      <SalesCard leadId={leadId} leadName={leadName} leadValue={leadValue} />
    </div>
  );
}

function QualificationCard({ leadId }: { leadId: string }) {
  const { data: profile, isLoading } = useLeadConsortiumProfile(leadId);
  const saveProfile = useSaveLeadConsortiumProfile(leadId);

  const [assetType, setAssetType] = useState(NONE);
  const [desiredCredit, setDesiredCredit] = useState("");
  const [maxInstallment, setMaxInstallment] = useState("");
  const [term, setTerm] = useState("");
  const [bid, setBid] = useState("");
  const [fgts, setFgts] = useState(NONE);
  const [timeframe, setTimeframe] = useState(NONE);

  useEffect(() => {
    setAssetType(profile?.asset_type ?? NONE);
    setDesiredCredit(moneyToInput(profile?.desired_credit));
    setMaxInstallment(moneyToInput(profile?.max_installment));
    setTerm(profile?.desired_term_months ? String(profile.desired_term_months) : "");
    setBid(moneyToInput(profile?.bid_amount));
    setFgts(profile?.uses_fgts == null ? NONE : profile.uses_fgts ? "sim" : "nao");
    setTimeframe(profile?.purchase_timeframe ?? NONE);
  }, [profile]);

  const handleSave = () => {
    if (term.trim() && !parseMonths(term)) {
      toast.error("O prazo vai de 1 a 300 meses.");
      return;
    }
    saveProfile.mutate(
      {
        asset_type: assetType === NONE ? null : assetType,
        desired_credit: parseMoneyInput(desiredCredit),
        max_installment: parseMoneyInput(maxInstallment),
        desired_term_months: term.trim() ? parseMonths(term) : null,
        bid_amount: parseMoneyInput(bid),
        uses_fgts: fgts === NONE ? null : fgts === "sim",
        purchase_timeframe: timeframe === NONE ? null : timeframe,
      },
      {
        onSuccess: () => toast.success("Qualificação salva."),
        onError: (error) => {
          console.error("Erro ao salvar a qualificação:", error);
          toast.error("Não foi possível salvar a qualificação. Tente de novo.");
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Qualificação</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Bem">
            <Select value={assetType} onValueChange={setAssetType} disabled={isLoading}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Não informado</SelectItem>
                {ASSET_TYPES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Quando quer o bem">
            <Select value={timeframe} onValueChange={setTimeframe} disabled={isLoading}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Não informado</SelectItem>
                {PURCHASE_TIMEFRAMES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Crédito desejado">
            <Input className="h-9" value={desiredCredit} onChange={(e) => setDesiredCredit(maskMoneyInput(e.target.value))} placeholder="R$ 300.000" inputMode="decimal" />
          </Field>
          <Field label="Parcela que cabe">
            <Input className="h-9" value={maxInstallment} onChange={(e) => setMaxInstallment(maskMoneyInput(e.target.value))} placeholder="R$ 2.000" inputMode="decimal" />
          </Field>
          <Field label="Prazo (meses)">
            <Input className="h-9" value={term} onChange={(e) => setTerm(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="200" inputMode="numeric" />
          </Field>
          <Field label="Lance disponível">
            <Input className="h-9" value={bid} onChange={(e) => setBid(maskMoneyInput(e.target.value))} placeholder="R$ 50.000" inputMode="decimal" />
          </Field>
          <Field label="Usa FGTS">
            <Select value={fgts} onValueChange={setFgts} disabled={isLoading}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Não informado</SelectItem>
                <SelectItem value="sim">Sim</SelectItem>
                <SelectItem value="nao">Não</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saveProfile.isPending || isLoading}>
            {saveProfile.isPending ? "Salvando..." : "Salvar qualificação"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SalesCard({ leadId, leadName, leadValue }: LeadConsortiumPanelProps) {
  const { saleRule } = useOrganizationSegment();
  const { data: sales = [], isLoading } = useLeadConsortiumSales(leadId);
  const { data: administrators = [] } = useConsortiumAdministrators();
  const updateSale = useUpdateConsortiumSale(leadId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cancelling, setCancelling] = useState<ConsortiumSale | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelInstallment, setCancelInstallment] = useState("");

  const openCancel = (sale: ConsortiumSale) => {
    setCancelling(sale);
    setCancelReason("");
    // Sem a 1ª parcela paga, a cota cancela na parcela 1.
    setCancelInstallment(sale.status === "aguardando_primeira_parcela" ? "1" : "");
  };

  const adminName = (id: string | null) => administrators.find((a) => a.id === id)?.name ?? null;
  const countedTotal = sales
    .filter((sale) => isSaleStatus(sale.status) && saleCounts(sale.status, saleRule))
    .reduce((sum, sale) => sum + Number(sale.credit_amount), 0);

  const confirmPayment = (sale: ConsortiumSale) => {
    updateSale.mutate(
      { id: sale.id, patch: { status: "ativa", first_installment_paid_on: todayInBrazil() } },
      {
        onSuccess: () => toast.success("Pagamento da 1ª parcela confirmado."),
        onError: (error) => {
          console.error("Erro ao confirmar o pagamento:", error);
          toast.error("Não foi possível confirmar o pagamento. Tente de novo.");
        },
      },
    );
  };

  const confirmCancel = () => {
    if (!cancelling) return;
    const installment = parseMonths(cancelInstallment, cancelling.term_months ?? 300);
    if (!installment) {
      toast.error(cancelling.term_months
        ? `Informe a parcela do cancelamento, de 1 a ${cancelling.term_months}.`
        : "Informe a parcela do cancelamento, de 1 a 300.");
      return;
    }
    updateSale.mutate(
      {
        id: cancelling.id,
        patch: { status: "cancelada", cancel_reason: cancelReason.trim() || null, cancel_at_installment: installment },
      },
      {
        onSuccess: () => {
          toast.success("Cota cancelada. Ela saiu da produção.");
          setCancelling(null);
          setCancelReason("");
          setCancelInstallment("");
        },
        onError: (error) => {
          console.error("Erro ao cancelar a cota:", error);
          toast.error("Não foi possível cancelar a cota. Tente de novo.");
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold">Cotas</CardTitle>
        <Button variant="outline" size="sm" className="h-8" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Registrar cota
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando cotas...</p>
        ) : sales.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma cota registrada para este lead.</p>
        ) : (
          <>
            {sales.map((sale) => {
              const status = isSaleStatus(sale.status) ? sale.status : "aguardando_primeira_parcela";
              const details = [
                adminName(sale.administrator_id),
                assetTypeLabel(sale.asset_type),
                sale.group_code && `grupo ${sale.group_code}`,
                sale.quota_number && `cota ${sale.quota_number}`,
              ].filter(Boolean).join(" · ");
              return (
                <div key={sale.id} className="space-y-1.5 rounded-md border p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("text-sm font-semibold tabular-nums", status === "cancelada" && "text-muted-foreground line-through")}>
                      {formatBRL(Number(sale.credit_amount))}
                    </span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_TONE[status])}>
                      {SALE_STATUS[status].label}
                    </span>
                  </div>
                  {details && <p className="truncate text-xs text-muted-foreground">{details}</p>}
                  <p className="text-xs text-muted-foreground">
                    Adesão em {formatDate(sale.adhesion_date)}
                    {sale.first_installment_paid_on && ` · 1ª parcela em ${formatDate(sale.first_installment_paid_on)}`}
                    {sale.cancelled_on && ` · cancelada em ${formatDate(sale.cancelled_on)}`}
                  </p>
                  {status !== "cancelada" && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {status === "aguardando_primeira_parcela" && (
                        <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={() => confirmPayment(sale)} disabled={updateSale.isPending}>
                          Confirmar 1ª parcela
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs text-muted-foreground" onClick={() => openCancel(sale)}>
                        Cancelar cota
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
            <p className="pt-1 text-xs text-muted-foreground">
              Na produção: <span className="font-semibold tabular-nums text-foreground">{formatBRL(countedTotal)}</span>
              {saleRule === "primeira_parcela" ? " (cotas com a 1ª parcela paga)" : " (cotas não canceladas)"}
            </p>
          </>
        )}
      </CardContent>

      <ConsortiumSaleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        leadId={leadId}
        leadName={leadName}
        suggestedCredit={sales.length === 0 ? leadValue : null}
      />

      <AlertDialog open={!!cancelling} onOpenChange={(open) => !open && setCancelling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar esta cota?</AlertDialogTitle>
            <AlertDialogDescription>
              A cota de {cancelling ? formatBRL(Number(cancelling.credit_amount)) : ""} sai da produção e do ranking. As parcelas de comissão que faltam são canceladas e o estorno segue a regra da administradora. O registro continua no histórico do lead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-installment">Parcela do cliente em que cancelou</Label>
            <Input
              id="cancel-installment"
              className="h-9 w-28 tabular-nums"
              value={cancelInstallment}
              onChange={(e) => setCancelInstallment(e.target.value.replace(/\D/g, "").slice(0, 3))}
              inputMode="numeric"
              placeholder="Ex.: 4"
            />
            <p className="text-xs text-muted-foreground">Decide quanto da comissão volta para a administradora.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Motivo (opcional)</Label>
            <Textarea id="cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value.slice(0, 300))} rows={2} placeholder="Ex.: cliente desistiu antes da 1ª parcela" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter cota</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                confirmCancel();
              }}
              disabled={updateSale.isPending}
            >
              Cancelar cota
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
