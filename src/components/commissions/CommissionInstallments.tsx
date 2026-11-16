import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { todayInBrazil } from "@/lib/consortium";
import {
  COMMISSION_STATUS,
  addMonths,
  canMarkPaid,
  canMarkReceived,
  formatMoneyCents,
  formatMonth,
  formatPercent,
  monthOf,
  monthRange,
  type CommissionStatus,
} from "@/lib/consortiumCommission";
import {
  useCommissionInstallments,
  useUpdateInstallmentStatus,
  type CommissionInstallmentRow,
  type InstallmentAction,
} from "@/hooks/useConsortiumCommissions";
import type { ConsortiumAdministrator } from "@/hooks/useConsortium";
import { EmptyState, Panel, StatusBadge } from "./shared";
import { ALL, formatDay, plural } from "./format";

interface CommissionInstallmentsProps {
  mode: "admin" | "seller";
  administrators: ConsortiumAdministrator[];
  sellerName: (userId: string | null) => string;
}

const STATUS_OPTIONS = Object.entries(COMMISSION_STATUS) as Array<[CommissionStatus, { label: string }]>;

function quotaLabel(row: CommissionInstallmentRow) {
  const sale = row.sale;
  if (!sale) return "";
  if (sale.group_code || sale.quota_number) return [sale.group_code && `Grupo ${sale.group_code}`, sale.quota_number && `cota ${sale.quota_number}`].filter(Boolean).join(" · ");
  return sale.contract_number ? `Contrato ${sale.contract_number}` : "";
}

/** Parcelas da comissão com filtros. O admin marca recebidas e pagas em lote; o vendedor só consulta. */
export function CommissionInstallments({ mode, administrators, sellerName }: CommissionInstallmentsProps) {
  const isAdmin = mode === "admin";
  const currentMonth = monthOf(todayInBrazil());
  const [month, setMonth] = useState(currentMonth);
  const [status, setStatus] = useState(ALL);
  const [seller, setSeller] = useState(ALL);
  const [administratorId, setAdministratorId] = useState(ALL);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const range = month === ALL ? null : { from: month, to: month };
  const { data: rows = [], isLoading, isError } = useCommissionInstallments(range);
  const updateStatus = useUpdateInstallmentStatus();

  const monthOptions = useMemo(() => monthRange(addMonths(currentMonth, -12), addMonths(currentMonth, 12)).reverse(), [currentMonth]);
  const sellers = useMemo(
    () => [...new Set(rows.map((row) => row.seller_user_id).filter((id): id is string => !!id))]
      .map((id) => ({ id, name: sellerName(id) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [rows, sellerName],
  );
  const adminName = (id: string | null) => administrators.find((admin) => admin.id === id)?.name ?? "";

  const visible = rows.filter((row) =>
    (status === ALL || row.status === status)
    && (seller === ALL || row.seller_user_id === seller)
    && (administratorId === ALL || row.administrator_id === administratorId));

  const selectedRows = visible.filter((row) => selected.has(row.id));
  const receivable = selectedRows.filter((row) => canMarkReceived(row.status));
  const payable = selectedRows.filter((row) => canMarkPaid(row.status));
  const selectable = visible.filter((row) => canMarkReceived(row.status) || canMarkPaid(row.status));
  const allSelected = selectable.length > 0 && selectable.every((row) => selected.has(row.id));

  const toggle = (id: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const apply = (ids: string[], action: InstallmentAction, success: (count: number) => string) => {
    if (ids.length === 0) return;
    updateStatus.mutate(
      { ids, status: action, date: action === "prevista" ? undefined : todayInBrazil() },
      {
        onSuccess: (count) => {
          toast.success(success(count));
          setSelected(new Set());
        },
        onError: (error) => {
          console.error("Erro ao atualizar parcelas:", error);
          toast.error("Não foi possível atualizar as parcelas. Tente novamente.");
        },
      },
    );
  };

  const totalAmount = visible.reduce((sum, row) => sum + Number(row.amount), 0);
  const totalSeller = visible.reduce((sum, row) => sum + Number(row.seller_amount), 0);

  return (
    <Panel
      title={isAdmin ? "Parcelas da comissão" : "Suas parcelas"}
      description={isAdmin
        ? "Marque o que a administradora pagou e o que já foi repassado ao vendedor."
        : "Cada parcela que a administradora paga sobre as suas cotas, e a sua parte."}
    >
      <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Select value={month} onValueChange={(value) => { setMonth(value); setSelected(new Set()); }}>
          <SelectTrigger className="h-9" aria-label="Mês de vencimento"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os meses</SelectItem>
            {monthOptions.map((option) => <SelectItem key={option} value={option}>{formatMonth(option)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9" aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {STATUS_OPTIONS.map(([value, info]) => <SelectItem key={value} value={value}>{info.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {isAdmin && (
          <Select value={seller} onValueChange={setSeller}>
            <SelectTrigger className="h-9" aria-label="Vendedor"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os vendedores</SelectItem>
              {sellers.map((option) => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {administrators.length > 0 && (
          <Select value={administratorId} onValueChange={setAdministratorId}>
            <SelectTrigger className="h-9" aria-label="Administradora"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as administradoras</SelectItem>
              {administrators.map((admin) => <SelectItem key={admin.id} value={admin.id}>{admin.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {isAdmin && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted-foreground">
            {selectedRows.length === 0 ? "Selecione parcelas para conciliar." : `${plural(selectedRows.length, "parcela selecionada", "parcelas selecionadas")}.`}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={receivable.length === 0 || updateStatus.isPending}
              onClick={() => apply(receivable.map((row) => row.id), "recebida", (count) => count === 1 ? "1 parcela marcada como recebida." : `${count} parcelas marcadas como recebidas.`)}
            >
              Marcar como recebidas
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={payable.length === 0 || updateStatus.isPending}
              onClick={() => apply(payable.map((row) => row.id), "paga_vendedor", (count) => count === 1 ? "1 parcela marcada como paga ao vendedor." : `${count} parcelas marcadas como pagas ao vendedor.`)}
            >
              Marcar como pagas ao vendedor
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : isError ? (
        <EmptyState>Não foi possível carregar as parcelas. Recarregue a página para tentar de novo.</EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState>{rows.length === 0 ? "Nenhuma parcela neste mês." : "Nenhuma parcela neste filtro."}</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] tabular-nums">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                {isAdmin && (
                  <th className="w-8 py-2 pr-2">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(checked) => setSelected(checked ? new Set(selectable.map((row) => row.id)) : new Set())}
                      aria-label="Selecionar todas"
                    />
                  </th>
                )}
                <th className="py-2 pr-3 font-medium">Vencimento</th>
                <th className="py-2 pr-3 font-medium">Cliente</th>
                <th className="py-2 pr-3 font-medium">Administradora</th>
                {isAdmin && <th className="py-2 pr-3 font-medium">Vendedor</th>}
                <th className="py-2 pr-3 text-right font-medium">Parcela</th>
                {isAdmin && <th className="py-2 pr-3 text-right font-medium">Valor</th>}
                <th className="py-2 pr-3 text-right font-medium">{isAdmin ? "Do vendedor" : "Sua parte"}</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                {isAdmin && <th className="py-2 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const canSelect = canMarkReceived(row.status) || canMarkPaid(row.status);
                return (
                  <tr key={row.id} className="border-t align-top">
                    {isAdmin && (
                      <td className="py-2 pr-2">
                        {canSelect && (
                          <Checkbox checked={selected.has(row.id)} onCheckedChange={(checked) => toggle(row.id, checked === true)} aria-label="Selecionar parcela" />
                        )}
                      </td>
                    )}
                    <td className="py-2 pr-3 whitespace-nowrap">{formatMonth(row.due_month)}</td>
                    <td className="py-2 pr-3">
                      <p className="max-w-[220px] truncate font-medium text-foreground">{row.sale?.lead?.nome_lead || "Lead sem nome"}</p>
                      <p className="max-w-[220px] truncate text-xs text-muted-foreground">{quotaLabel(row)}</p>
                    </td>
                    <td className="py-2 pr-3">{adminName(row.administrator_id) || "—"}</td>
                    {isAdmin && <td className="py-2 pr-3">{sellerName(row.seller_user_id)}</td>}
                    <td className="py-2 pr-3 text-right whitespace-nowrap">
                      {row.n === 0 ? "—" : `${row.n}ª`}
                    </td>
                    {isAdmin && <td className={`py-2 pr-3 text-right ${Number(row.amount) < 0 ? "text-destructive" : ""}`}>{formatMoneyCents(Number(row.amount))}</td>}
                    <td className={`py-2 pr-3 text-right ${Number(row.seller_amount) < 0 ? "text-destructive" : ""}`}>
                      {formatMoneyCents(Number(row.seller_amount))}
                      <span className="block text-[11px] text-muted-foreground">{formatPercent(Number(row.seller_share_percent))}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <StatusBadge status={row.status} />
                      {row.received_on && <span className="mt-0.5 block text-[11px] text-muted-foreground">Recebida em {formatDay(row.received_on)}</span>}
                      {row.paid_on && <span className="block text-[11px] text-muted-foreground">Paga em {formatDay(row.paid_on)}</span>}
                    </td>
                    {isAdmin && (
                      <td className="py-2 text-right">
                        {(row.status === "recebida" || row.status === "paga_vendedor") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground"
                            disabled={updateStatus.isPending}
                            onClick={() => apply(
                              [row.id],
                              row.status === "paga_vendedor" ? "recebida" : "prevista",
                              () => "Parcela atualizada.",
                            )}
                          >
                            Desfazer
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
              <tr className="border-t-2 font-semibold">
                {isAdmin && <td />}
                <td className="py-2 pr-3" colSpan={isAdmin ? 5 : 4}>Total</td>
                {isAdmin && <td className="py-2 pr-3 text-right">{formatMoneyCents(totalAmount)}</td>}
                <td className="py-2 pr-3 text-right">{formatMoneyCents(totalSeller)}</td>
                <td colSpan={isAdmin ? 2 : 1} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
