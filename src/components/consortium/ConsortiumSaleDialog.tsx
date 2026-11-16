import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConsortiumAdministrators, useCreateConsortiumSale, useLeadConsortiumProfile } from "@/hooks/useConsortium";
import { useOrganizationSegment } from "@/hooks/useOrganizationSegment";
import {
  ASSET_TYPES,
  maskMoneyInput,
  moneyToInput,
  parseMoneyInput,
  parseMonths,
  todayInBrazil,
  type AssetType,
} from "@/lib/consortium";

interface ConsortiumSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName?: string | null;
  /** Crédito sugerido (valor do lead ou crédito desejado). */
  suggestedCredit?: number | null;
  /** Chamado depois de salvar a cota. */
  onSaved?: () => void;
  /** Texto do botão principal. */
  confirmLabel?: string;
}

const NONE = "__none__";

/** Formulário de registro de uma cota vendida (modo consórcio). */
export function ConsortiumSaleDialog({
  open,
  onOpenChange,
  leadId,
  leadName,
  suggestedCredit,
  onSaved,
  confirmLabel = "Registrar cota",
}: ConsortiumSaleDialogProps) {
  const { saleRule } = useOrganizationSegment();
  const { data: administrators = [] } = useConsortiumAdministrators(open);
  const { data: profile } = useLeadConsortiumProfile(leadId, open);
  const createSale = useCreateConsortiumSale(leadId);

  const [administratorId, setAdministratorId] = useState(NONE);
  const [assetType, setAssetType] = useState<AssetType | typeof NONE>(NONE);
  const [credit, setCredit] = useState("");
  const [term, setTerm] = useState("");
  const [installment, setInstallment] = useState("");
  const [groupCode, setGroupCode] = useState("");
  const [quotaNumber, setQuotaNumber] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const [adhesionDate, setAdhesionDate] = useState(todayInBrazil());
  const [firstPaid, setFirstPaid] = useState(false);
  const [firstPaidOn, setFirstPaidOn] = useState(todayInBrazil());
  const [error, setError] = useState<string | null>(null);

  // Ao abrir, limpa o formulário e sugere o crédito do lead.
  useEffect(() => {
    if (!open) return;
    setAdministratorId(NONE);
    setAssetType(NONE);
    setCredit(moneyToInput(suggestedCredit ?? null));
    setTerm("");
    setInstallment("");
    setGroupCode("");
    setQuotaNumber("");
    setContractNumber("");
    setAdhesionDate(todayInBrazil());
    setFirstPaid(false);
    setFirstPaidOn(todayInBrazil());
    setError(null);
  }, [open, suggestedCredit]);

  // Quando a qualificação do lead chega, preenche o que ainda estiver vazio.
  useEffect(() => {
    if (!open || !profile) return;
    if (profile.asset_type) setAssetType((current) => (current === NONE ? (profile.asset_type as AssetType) : current));
    if (profile.desired_credit) setCredit((current) => current || moneyToInput(profile.desired_credit));
    if (profile.desired_term_months) setTerm((current) => current || String(profile.desired_term_months));
  }, [open, profile]);

  const activeAdministrators = administrators.filter((admin) => admin.is_active);

  const handleSubmit = async () => {
    const creditAmount = parseMoneyInput(credit);
    if (!creditAmount) {
      setError("Informe o crédito da carta, como R$ 250.000.");
      return;
    }
    const termMonths = term.trim() ? parseMonths(term) : null;
    if (term.trim() && !termMonths) {
      setError("O prazo vai de 1 a 300 meses.");
      return;
    }
    if (!adhesionDate) {
      setError("Informe a data da adesão.");
      return;
    }
    setError(null);

    try {
      await createSale.mutateAsync({
        administrator_id: administratorId === NONE ? null : administratorId,
        asset_type: assetType === NONE ? null : assetType,
        credit_amount: creditAmount,
        term_months: termMonths,
        installment_amount: parseMoneyInput(installment),
        group_code: groupCode.trim() || null,
        quota_number: quotaNumber.trim() || null,
        contract_number: contractNumber.trim() || null,
        adhesion_date: adhesionDate,
        status: firstPaid ? "ativa" : "aguardando_primeira_parcela",
        first_installment_paid_on: firstPaid ? firstPaidOn : null,
      });
      toast.success("Cota registrada.");
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      console.error("Erro ao registrar a cota:", err);
      toast.error("Não foi possível registrar a cota. Tente de novo.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar cota vendida</DialogTitle>
          <DialogDescription>
            {leadName ? `Cota de ${leadName}. ` : ""}
            {saleRule === "adesao"
              ? "Pela regra da organização, a cota entra na produção na adesão."
              : "Pela regra da organização, a cota entra na produção quando a 1ª parcela for confirmada."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5 sm:col-span-1">
            <Label>Administradora</Label>
            <Select value={administratorId} onValueChange={setAdministratorId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Não informar</SelectItem>
                {activeAdministrators.map((admin) => (
                  <SelectItem key={admin.id} value={admin.id}>{admin.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeAdministrators.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Cadastre em Configurações › Organização.</p>
            )}
          </div>
          <div className="col-span-2 space-y-1.5 sm:col-span-1">
            <Label>Tipo de bem</Label>
            <Select value={assetType} onValueChange={(value) => setAssetType(value as AssetType | typeof NONE)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Não informar</SelectItem>
                {ASSET_TYPES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="sale-credit">Crédito da carta *</Label>
            <Input
              id="sale-credit"
              value={credit}
              onChange={(e) => setCredit(maskMoneyInput(e.target.value))}
              placeholder="R$ 250.000"
              inputMode="decimal"
              aria-invalid={!!error && !parseMoneyInput(credit)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sale-term">Prazo (meses)</Label>
            <Input id="sale-term" value={term} onChange={(e) => setTerm(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="200" inputMode="numeric" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sale-installment">Parcela</Label>
            <Input id="sale-installment" value={installment} onChange={(e) => setInstallment(maskMoneyInput(e.target.value))} placeholder="R$ 1.500" inputMode="decimal" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sale-group">Grupo</Label>
            <Input id="sale-group" value={groupCode} onChange={(e) => setGroupCode(e.target.value.slice(0, 40))} placeholder="Ex.: 1234" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sale-quota">Cota</Label>
            <Input id="sale-quota" value={quotaNumber} onChange={(e) => setQuotaNumber(e.target.value.slice(0, 40))} placeholder="Ex.: 456" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sale-contract">Nº da proposta ou contrato</Label>
            <Input id="sale-contract" value={contractNumber} onChange={(e) => setContractNumber(e.target.value.slice(0, 60))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sale-adhesion">Data da adesão *</Label>
            <Input id="sale-adhesion" type="date" value={adhesionDate} onChange={(e) => setAdhesionDate(e.target.value)} />
          </div>

          <div className="col-span-2 flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
            <Label htmlFor="sale-first-paid" className="font-normal">A 1ª parcela já foi paga</Label>
            <Switch id="sale-first-paid" checked={firstPaid} onCheckedChange={setFirstPaid} />
          </div>
          {firstPaid && (
            <div className="col-span-2 space-y-1.5 sm:col-span-1">
              <Label htmlFor="sale-first-paid-on">Paga em</Label>
              <Input id="sale-first-paid-on" type="date" value={firstPaidOn} onChange={(e) => setFirstPaidOn(e.target.value)} />
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-md bg-destructive-tint px-3 py-2 text-[13px] font-medium text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createSale.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={createSale.isPending}>
            {createSale.isPending ? "Registrando..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
