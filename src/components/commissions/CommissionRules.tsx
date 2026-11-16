import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { ASSET_TYPES, assetTypeLabel, maskMoneyInput, moneyToInput, parseMoneyInput } from "@/lib/consortium";
import {
  formatPercent,
  parseChargeback,
  parsePercentInput,
  parseSellerTiers,
  ruleSpecificity,
  splitEvenly,
  validateCommissionRule,
} from "@/lib/consortiumCommission";
import {
  useCommissionRules,
  useDeleteCommissionRule,
  useGeneratePendingCommissions,
  useSaveCommissionRule,
  useSetCommissionRuleActive,
  type CommissionRule,
} from "@/hooks/useConsortiumCommissions";
import type { ConsortiumAdministrator } from "@/hooks/useConsortium";
import { EmptyState, Panel } from "./shared";
import { ALL, plural } from "./format";

const pctText = (value: number) => String(value).replace(".", ",");

/** Regras de comissão por administradora e tipo de bem. */
export function CommissionRules({ administrators }: { administrators: ConsortiumAdministrator[] }) {
  const { data: rules = [], isLoading, isError } = useCommissionRules();
  const setActive = useSetCommissionRuleActive();
  const deleteRule = useDeleteCommissionRule();
  const generate = useGeneratePendingCommissions();
  const [editing, setEditing] = useState<CommissionRule | "new" | null>(null);
  const [deleting, setDeleting] = useState<CommissionRule | null>(null);
  const [confirmGenerate, setConfirmGenerate] = useState(false);

  const adminName = (id: string | null) => (id ? administrators.find((admin) => admin.id === id)?.name ?? "Administradora removida" : "Todas as administradoras");
  const sorted = [...rules].sort((a, b) => ruleSpecificity(b) - ruleSpecificity(a) || adminName(a.administrator_id).localeCompare(adminName(b.administrator_id)));

  const remove = () => {
    if (!deleting) return;
    deleteRule.mutate(deleting.id, {
      onSuccess: () => {
        toast.success("Regra excluída.");
        setDeleting(null);
      },
      onError: (error) => {
        console.error("Erro ao excluir regra:", error);
        const code = (error as { code?: string }).code;
        toast.error(code === "23503"
          ? "Esta regra já gerou comissões. Desligue a regra em vez de excluir."
          : "Não foi possível excluir a regra. Tente novamente.");
        setDeleting(null);
      },
    });
  };

  const runGenerate = () => {
    generate.mutate(undefined, {
      onSuccess: (count) => {
        toast.success(count === 0 ? "Nenhuma cota sem comissão encontrou regra." : `${plural(count, "cota ganhou", "cotas ganharam")} parcelas de comissão.`);
        setConfirmGenerate(false);
      },
      onError: (error) => {
        console.error("Erro ao gerar comissões:", error);
        toast.error("Não foi possível gerar as comissões. Tente novamente.");
        setConfirmGenerate(false);
      },
    });
  };

  return (
    <Panel
      title="Regras de comissão"
      description="Vale a regra mais específica: administradora e bem, depois só administradora, depois só bem, depois a regra geral. Mudar uma regra vale para as próximas cotas; parcelas já geradas não mudam."
      action={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setConfirmGenerate(true)} disabled={rules.length === 0}>
            Gerar parcelas pendentes
          </Button>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            Nova regra
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : isError ? (
        <EmptyState>Não foi possível carregar as regras. Recarregue a página para tentar de novo.</EmptyState>
      ) : sorted.length === 0 ? (
        <EmptyState>Nenhuma regra de comissão ainda. Crie uma para as cotas vendidas gerarem parcelas.</EmptyState>
      ) : (
        <ul className="divide-y rounded-md border">
          {sorted.map((rule) => {
            const chargeback = parseChargeback(rule.chargeback);
            const tiers = parseSellerTiers(rule.seller_tiers);
            return (
              <li key={rule.id} className={cn("flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center", !rule.is_active && "opacity-60")}>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-sm font-semibold text-foreground">
                    {adminName(rule.administrator_id)} · {assetTypeLabel(rule.asset_type) ?? "Todos os bens"}
                  </p>
                  <p className="text-[13px] tabular-nums text-muted-foreground">
                    {formatPercent(Number(rule.commission_percent))} do crédito em {plural(rule.installment_percents.length, "parcela", "parcelas")}
                    {" ("}{rule.installment_percents.map((value) => formatPercent(Number(value))).join(" · ")}{")"}
                  </p>
                  <p className="text-[13px] tabular-nums text-muted-foreground">
                    Vendedor: {formatPercent(Number(rule.seller_share_percent))}
                    {tiers.length > 0 && `, ${tiers.map((tier) => `${formatPercent(tier.share_percent)} a partir de ${formatBRL(tier.min_monthly_production)}`).join(", ")} no mês`}
                    {" · Estorno: "}
                    {chargeback.length === 0 ? "nenhum" : chargeback.map((tier) => `até a ${tier.until_installment}ª, ${formatPercent(tier.percent)}`).join("; ")}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Switch
                    checked={rule.is_active}
                    onCheckedChange={(checked) => setActive.mutate(
                      { id: rule.id, is_active: checked },
                      { onError: () => toast.error("Não foi possível atualizar a regra. Tente novamente.") },
                    )}
                    aria-label={rule.is_active ? "Desligar regra" : "Ligar regra"}
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(rule)} aria-label="Editar regra">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleting(rule)} aria-label="Excluir regra">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <RuleDialog
          rule={editing === "new" ? null : editing}
          rules={rules}
          administrators={administrators}
          onClose={() => setEditing(null)}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta regra?</AlertDialogTitle>
            <AlertDialogDescription>
              As próximas cotas passam a usar a regra mais geral que sobrar. Uma regra que já gerou comissões não pode ser excluída, só desligada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={remove}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmGenerate} onOpenChange={setConfirmGenerate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gerar parcelas pendentes?</AlertDialogTitle>
            <AlertDialogDescription>
              As cotas que já contam na produção e ainda não têm comissão ganham parcelas pelas regras ativas, a partir do mês em que contaram. Parcelas de meses passados aparecem como previstas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); runGenerate(); }} disabled={generate.isPending}>
              {generate.isPending ? "Gerando..." : "Gerar parcelas"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}

interface RuleDialogProps {
  rule: CommissionRule | null;
  rules: CommissionRule[];
  administrators: ConsortiumAdministrator[];
  onClose: () => void;
}

function RuleDialog({ rule, rules, administrators, onClose }: RuleDialogProps) {
  const save = useSaveCommissionRule();
  const [administratorId, setAdministratorId] = useState(rule?.administrator_id ?? ALL);
  const [assetType, setAssetType] = useState(rule?.asset_type ?? ALL);
  const [total, setTotal] = useState(rule ? pctText(Number(rule.commission_percent)) : "");
  const [installments, setInstallments] = useState<string[]>(rule ? rule.installment_percents.map((value) => pctText(Number(value))) : [""]);
  const [count, setCount] = useState(String(rule?.installment_percents.length ?? 1));
  const [chargeback, setChargeback] = useState(
    parseChargeback(rule?.chargeback).map((tier) => ({ until: String(tier.until_installment), percent: pctText(tier.percent) })),
  );
  const [sellerShare, setSellerShare] = useState(rule ? pctText(Number(rule.seller_share_percent)) : "");
  const [tiers, setTiers] = useState(
    parseSellerTiers(rule?.seller_tiers).map((tier) => ({ min: moneyToInput(tier.min_monthly_production) || "R$ 0", share: pctText(tier.share_percent) })),
  );
  const [isActive, setIsActive] = useState(rule?.is_active ?? true);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    const n = Math.min(Math.max(Number(count) || 0, 0), 60);
    if (n < 1) return;
    setInstallments((current) => (current.length === n ? current : Array.from({ length: n }, (_, i) => current[i] ?? "")));
  }, [count]);

  const totalValue = parsePercentInput(total);
  const parsedInstallments = installments.map((value) => parsePercentInput(value === "" ? "0" : value));
  const installmentSum = parsedInstallments.reduce<number>((acc, value) => acc + (value ?? 0), 0);

  const fillEvenly = () => {
    if (!totalValue) {
      setErrors(["Informe a comissão total antes de dividir."]);
      return;
    }
    setInstallments(splitEvenly(totalValue, installments.length).map(pctText));
  };

  const submit = () => {
    const input = {
      id: rule?.id,
      administrator_id: administratorId === ALL ? null : administratorId,
      asset_type: assetType === ALL ? null : assetType,
      commission_percent: totalValue ?? 0,
      installment_percents: parsedInstallments.map((value) => value ?? -1),
      chargeback: chargeback
        .filter((row) => row.until.trim() || row.percent.trim())
        .map((row) => ({ until_installment: Number(row.until), percent: parsePercentInput(row.percent) ?? -1 }))
        .sort((a, b) => a.until_installment - b.until_installment),
      seller_share_percent: parsePercentInput(sellerShare === "" ? "0" : sellerShare) ?? -1,
      seller_tiers: tiers
        .filter((row) => row.min.trim() || row.share.trim())
        .map((row) => ({ min_monthly_production: /^0+$/.test(row.min.replace(/\D/g, "")) ? 0 : parseMoneyInput(row.min) ?? -1, share_percent: parsePercentInput(row.share) ?? -1 }))
        .sort((a, b) => a.min_monthly_production - b.min_monthly_production),
      is_active: isActive,
    };
    const problems = validateCommissionRule(input);
    const duplicate = rules.find((other) => other.id !== rule?.id
      && (other.administrator_id ?? null) === input.administrator_id
      && (other.asset_type ?? null) === input.asset_type);
    if (duplicate) problems.unshift("Já existe uma regra para esta administradora e este bem. Edite a regra existente.");
    setErrors(problems);
    if (problems.length > 0) return;

    save.mutate(input, {
      onSuccess: () => {
        toast.success(rule ? "Regra salva." : "Regra criada.");
        onClose();
      },
      onError: (error) => {
        console.error("Erro ao salvar regra de comissão:", error);
        toast.error("Não foi possível salvar a regra. Tente novamente.");
      },
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{rule ? "Editar regra" : "Nova regra de comissão"}</DialogTitle>
          <DialogDescription>O que a administradora paga à corretora e quanto vai para o vendedor.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Administradora">
              <Select value={administratorId} onValueChange={setAdministratorId}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas as administradoras</SelectItem>
                  {administrators.map((admin) => <SelectItem key={admin.id} value={admin.id}>{admin.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Bem">
              <Select value={assetType} onValueChange={setAssetType}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos os bens</SelectItem>
                  {ASSET_TYPES.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Comissão total (% do crédito)">
              <Input className="h-9" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="3" inputMode="decimal" />
            </Field>
            <Field label="Paga em quantas parcelas">
              <Input className="h-9" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="6" inputMode="numeric" />
            </Field>
          </div>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Percentual de cada parcela</h3>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={fillEvenly}>Dividir igualmente</Button>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {installments.map((value, index) => (
                <div key={index} className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">{index + 1}ª</Label>
                  <Input
                    className="h-9 tabular-nums"
                    value={value}
                    onChange={(e) => setInstallments((current) => current.map((item, i) => (i === index ? e.target.value : item)))}
                    placeholder="0"
                    inputMode="decimal"
                    aria-label={`Percentual da ${index + 1}ª parcela`}
                  />
                </div>
              ))}
            </div>
            <p className={cn("text-xs tabular-nums", totalValue !== null && Math.abs(installmentSum - totalValue) > 0.001 ? "text-destructive" : "text-muted-foreground")}>
              Soma: {formatPercent(Math.round(installmentSum * 10000) / 10000)} de {formatPercent(totalValue ?? 0)}. Mês com 0% não gera parcela.
            </p>
          </section>

          <section className="space-y-2">
            <div>
              <h3 className="text-sm font-semibold">Estorno se a cota cancelar</h3>
              <p className="text-xs text-muted-foreground">Quanto a corretora devolve do que já recebeu, pela parcela em que o cliente cancelou. Vale a primeira faixa que cobre a parcela.</p>
            </div>
            {chargeback.map((row, index) => (
              <div key={index} className="flex items-center gap-2 text-[13px]">
                <span className="whitespace-nowrap text-muted-foreground">Até a parcela</span>
                <Input className="h-9 w-20 tabular-nums" value={row.until} inputMode="numeric" aria-label="Até a parcela"
                  onChange={(e) => setChargeback((current) => current.map((item, i) => (i === index ? { ...item, until: e.target.value.replace(/\D/g, "").slice(0, 3) } : item)))} />
                <span className="whitespace-nowrap text-muted-foreground">devolve</span>
                <Input className="h-9 w-20 tabular-nums" value={row.percent} inputMode="decimal" aria-label="Percentual devolvido"
                  onChange={(e) => setChargeback((current) => current.map((item, i) => (i === index ? { ...item, percent: e.target.value } : item)))} />
                <span className="text-muted-foreground">%</span>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Remover faixa"
                  onClick={() => setChargeback((current) => current.filter((_, i) => i !== index))}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setChargeback((current) => [...current, { until: "", percent: "" }])}>
              <Plus className="h-4 w-4" />
              Adicionar faixa
            </Button>
          </section>

          <section className="space-y-2">
            <div>
              <h3 className="text-sm font-semibold">Parte do vendedor</h3>
              <p className="text-xs text-muted-foreground">Percentual da comissão que vai para o vendedor. As faixas trocam esse percentual pela produção do vendedor no mês em que a cota contou.</p>
            </div>
            <Field label="Vendedor recebe (% da comissão)">
              <Input className="h-9 w-32 tabular-nums" value={sellerShare} onChange={(e) => setSellerShare(e.target.value)} placeholder="30" inputMode="decimal" />
            </Field>
            {tiers.map((row, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="whitespace-nowrap text-muted-foreground">A partir de</span>
                <Input className="h-9 w-36 tabular-nums" value={row.min} inputMode="decimal" aria-label="Produção mínima no mês"
                  onChange={(e) => setTiers((current) => current.map((item, i) => (i === index ? { ...item, min: maskMoneyInput(e.target.value) } : item)))} />
                <span className="whitespace-nowrap text-muted-foreground">no mês, recebe</span>
                <Input className="h-9 w-20 tabular-nums" value={row.share} inputMode="decimal" aria-label="Percentual do vendedor"
                  onChange={(e) => setTiers((current) => current.map((item, i) => (i === index ? { ...item, share: e.target.value } : item)))} />
                <span className="text-muted-foreground">%</span>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Remover faixa"
                  onClick={() => setTiers((current) => current.filter((_, i) => i !== index))}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setTiers((current) => [...current, { min: "", share: "" }])}>
              <Plus className="h-4 w-4" />
              Adicionar faixa por produção
            </Button>
          </section>

          <div className="flex items-center gap-2">
            <Switch id="rule-active" checked={isActive} onCheckedChange={setIsActive} />
            <Label htmlFor="rule-active">Regra ligada</Label>
          </div>

          {errors.length > 0 && (
            <ul className="space-y-1 rounded-md bg-destructive-tint p-3 text-[13px] text-destructive" role="alert">
              {errors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={save.isPending}>{save.isPending ? "Salvando..." : "Salvar regra"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
