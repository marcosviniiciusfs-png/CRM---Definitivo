import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ASSET_TYPES, maskMoneyInput, moneyToInput, parseMoneyInput, type AssetType } from "@/lib/consortium";
import { ADJUSTMENT_INDEXES, parsePercent, parseTerms, percentToInput, type AdjustmentIndex } from "@/lib/consortiumSimulator";
import { useConsortiumAdministrators } from "@/hooks/useConsortium";
import { useSaveConsortiumPlan, type ConsortiumPlan } from "@/hooks/useConsortiumPlans";

interface PlanFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: ConsortiumPlan | null;
}

const NONE = "__none__";

/** Cadastro e edição de um plano (owner/admin). */
export function PlanFormDialog({ open, onOpenChange, plan }: PlanFormDialogProps) {
  const { data: administrators = [] } = useConsortiumAdministrators(open);
  const savePlan = useSaveConsortiumPlan();

  const [administratorId, setAdministratorId] = useState(NONE);
  const [name, setName] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("imovel");
  const [creditMin, setCreditMin] = useState("");
  const [creditMax, setCreditMax] = useState("");
  const [terms, setTerms] = useState("");
  const [adminFee, setAdminFee] = useState("");
  const [reserveFund, setReserveFund] = useState("");
  const [insurance, setInsurance] = useState("");
  const [adjustment, setAdjustment] = useState<AdjustmentIndex>("nenhum");
  const [reduced, setReduced] = useState("");
  const [embedded, setEmbedded] = useState("");
  const [fixed, setFixed] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAdministratorId(plan?.administrator_id ?? NONE);
    setName(plan?.name ?? "");
    setAssetType((plan?.asset_type as AssetType) ?? "imovel");
    setCreditMin(moneyToInput(plan?.credit_min));
    setCreditMax(moneyToInput(plan?.credit_max));
    setTerms(plan?.terms?.join(", ") ?? "");
    setAdminFee(percentToInput(plan?.admin_fee_percent));
    setReserveFund(percentToInput(plan?.reserve_fund_percent));
    setInsurance(percentToInput(plan?.insurance_monthly_percent));
    setAdjustment((plan?.adjustment_index as AdjustmentIndex) ?? "nenhum");
    setReduced(plan?.reduced_installment_percent ? percentToInput(plan.reduced_installment_percent) : "");
    setEmbedded(plan?.max_embedded_bid_percent ? percentToInput(plan.max_embedded_bid_percent) : "");
    setFixed(percentToInput(plan?.fixed_bid_percent));
    setNotes(plan?.notes ?? "");
    setActive(plan?.is_active ?? true);
    setError(null);
  }, [open, plan]);

  const activeAdministrators = administrators.filter((admin) => admin.is_active || admin.id === plan?.administrator_id);

  const optionalPercent = (raw: string, max: number) => {
    if (!raw.trim()) return 0;
    const value = parsePercent(raw);
    return value != null && value >= 0 && value <= max ? value : null;
  };

  const handleSubmit = async () => {
    if (administratorId === NONE) return setError("Escolha a administradora.");
    if (!name.trim()) return setError("Preencha o nome do plano.");
    const min = parseMoneyInput(creditMin);
    const max = parseMoneyInput(creditMax);
    if (!min || !max) return setError("Preencha o crédito mínimo e o máximo, como R$ 100.000.");
    if (max < min) return setError("O crédito máximo precisa ser maior ou igual ao mínimo.");
    const parsedTerms = parseTerms(terms);
    if (!parsedTerms) return setError("Preencha os prazos em meses, de 1 a 300, como 150, 180, 200.");
    const fee = parsePercent(adminFee);
    if (fee == null || fee < 0 || fee > 100) return setError("Preencha a taxa de administração em %, como 18.");
    const reserve = optionalPercent(reserveFund, 100);
    if (reserve == null) return setError("O fundo de reserva vai de 0 a 100%.");
    const insurancePercent = optionalPercent(insurance, 5);
    if (insurancePercent == null) return setError("O seguro vai de 0 a 5% ao mês, como 0,038.");
    const reducedPercent = optionalPercent(reduced, 60);
    if (reducedPercent == null) return setError("O redutor vai de 0 a 60%.");
    const embeddedPercent = optionalPercent(embedded, 100);
    if (embeddedPercent == null) return setError("O lance embutido vai de 0 a 100%.");
    let fixedPercent: number | null = null;
    if (fixed.trim()) {
      fixedPercent = parsePercent(fixed);
      if (fixedPercent == null || fixedPercent <= 0 || fixedPercent > 100) return setError("O lance fixo vai de 0 a 100% ou fica vazio.");
    }
    setError(null);

    try {
      await savePlan.mutateAsync({
        id: plan?.id,
        values: {
          administrator_id: administratorId,
          name: name.trim(),
          asset_type: assetType,
          credit_min: min,
          credit_max: max,
          terms: parsedTerms,
          admin_fee_percent: fee,
          reserve_fund_percent: reserve,
          insurance_monthly_percent: insurancePercent,
          adjustment_index: adjustment,
          reduced_installment_percent: reducedPercent,
          max_embedded_bid_percent: embeddedPercent,
          fixed_bid_percent: fixedPercent,
          notes: notes.trim() || null,
          is_active: active,
        },
      });
      toast.success(plan ? "Plano salvo." : "Plano cadastrado.");
      onOpenChange(false);
    } catch (err) {
      console.error("Erro ao salvar o plano:", err);
      const duplicate = (err as { code?: string })?.code === "23505";
      toast.error(
        duplicate
          ? "Já existe um plano com esse nome nesta administradora e tipo de bem. Use outro nome."
          : "Não foi possível salvar o plano. Tente novamente.",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plan ? "Editar plano" : "Novo plano"}</DialogTitle>
          <DialogDescription>Percentuais como a administradora informa: taxa e fundo sobre o crédito, seguro ao mês.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5 sm:col-span-1">
            <Label>Administradora *</Label>
            <Select value={administratorId} onValueChange={setAdministratorId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE} disabled>Escolha</SelectItem>
                {activeAdministrators.map((admin) => <SelectItem key={admin.id} value={admin.id}>{admin.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {activeAdministrators.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Cadastre em Configurações › Organização ou importe uma planilha.</p>
            )}
          </div>
          <div className="col-span-2 space-y-1.5 sm:col-span-1">
            <Label htmlFor="plan-name">Nome do plano *</Label>
            <Input id="plan-name" value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder="Ex.: Imóvel 200" />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de bem *</Label>
            <Select value={assetType} onValueChange={(value) => setAssetType(value as AssetType)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASSET_TYPES.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Índice de reajuste</Label>
            <Select value={adjustment} onValueChange={(value) => setAdjustment(value as AdjustmentIndex)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ADJUSTMENT_INDEXES.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-min">Crédito mínimo *</Label>
            <Input id="plan-min" value={creditMin} onChange={(e) => setCreditMin(maskMoneyInput(e.target.value))} placeholder="R$ 100.000" inputMode="decimal" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-max">Crédito máximo *</Label>
            <Input id="plan-max" value={creditMax} onChange={(e) => setCreditMax(maskMoneyInput(e.target.value))} placeholder="R$ 500.000" inputMode="decimal" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="plan-terms">Prazos em meses *</Label>
            <Input id="plan-terms" value={terms} onChange={(e) => setTerms(e.target.value.slice(0, 200))} placeholder="150, 180, 200" inputMode="numeric" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-fee">Taxa de administração (%) *</Label>
            <Input id="plan-fee" value={adminFee} onChange={(e) => setAdminFee(e.target.value)} placeholder="18" inputMode="decimal" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-reserve">Fundo de reserva (%)</Label>
            <Input id="plan-reserve" value={reserveFund} onChange={(e) => setReserveFund(e.target.value)} placeholder="2" inputMode="decimal" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-insurance">Seguro (% ao mês)</Label>
            <Input id="plan-insurance" value={insurance} onChange={(e) => setInsurance(e.target.value)} placeholder="0,038" inputMode="decimal" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-reduced">Redutor de parcela (%)</Label>
            <Input id="plan-reduced" value={reduced} onChange={(e) => setReduced(e.target.value)} placeholder="Ex.: 30" inputMode="decimal" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-embedded">Lance embutido máx. (%)</Label>
            <Input id="plan-embedded" value={embedded} onChange={(e) => setEmbedded(e.target.value)} placeholder="Ex.: 25" inputMode="decimal" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-fixed">Lance fixo (%)</Label>
            <Input id="plan-fixed" value={fixed} onChange={(e) => setFixed(e.target.value)} placeholder="Vazio se não tiver" inputMode="decimal" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="plan-notes">Observações</Label>
            <Textarea id="plan-notes" value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 500))} rows={2} />
          </div>
          <div className="col-span-2 flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
            <Label htmlFor="plan-active" className="font-normal">Aparece no simulador</Label>
            <Switch id="plan-active" checked={active} onCheckedChange={setActive} />
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-md bg-destructive-tint px-3 py-2 text-[13px] font-medium text-destructive">{error}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={savePlan.isPending}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={savePlan.isPending}>
            {savePlan.isPending ? "Salvando..." : "Salvar plano"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
