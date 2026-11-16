import { useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { todayInBrazil } from "@/lib/consortium";
import { addMonths, buildForecast, formatMoneyCents, formatMonth, monthOf, monthRange } from "@/lib/consortiumCommission";
import { useCommissionInstallments } from "@/hooks/useConsortiumCommissions";
import type { ConsortiumAdministrator } from "@/hooks/useConsortium";
import { EmptyState, Kpi, Panel } from "./shared";
import { ALL } from "./format";

interface CommissionForecastProps {
  mode: "admin" | "seller";
  administrators: ConsortiumAdministrator[];
}

/** Previsão mês a mês: 3 meses para trás e 12 para a frente. */
export function CommissionForecast({ mode, administrators }: CommissionForecastProps) {
  const currentMonth = monthOf(todayInBrazil());
  const range = useMemo(() => ({ from: addMonths(currentMonth, -3), to: addMonths(currentMonth, 12) }), [currentMonth]);
  const [administratorId, setAdministratorId] = useState(ALL);
  const { data: rows = [], isLoading, isError } = useCommissionInstallments(range);

  const filtered = administratorId === ALL ? rows : rows.filter((row) => row.administrator_id === administratorId);
  const months = useMemo(() => monthRange(range.from, range.to), [range]);
  const forecast = useMemo(() => buildForecast(filtered, months), [filtered, months]);
  const upcoming = forecast.filter((month) => month.month >= currentMonth);
  const overdue = forecast.filter((month) => month.month < currentMonth).reduce((total, month) => total + month.toReceive, 0);
  const total = (key: "toReceive" | "toPaySellers" | "chargebacks" | "sellerChargebacks" | "paidSellers", list = forecast) =>
    list.reduce((acc, month) => acc + month[key], 0);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError) {
    return <EmptyState>Não foi possível carregar a previsão. Recarregue a página para tentar de novo.</EmptyState>;
  }

  const isAdmin = mode === "admin";
  return (
    <div className="space-y-4">
      {isAdmin ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Kpi
            label="A receber das administradoras"
            value={formatMoneyCents(total("toReceive", upcoming))}
            detail={overdue > 0 ? `Mais ${formatMoneyCents(overdue)} de meses anteriores ainda sem recebimento.` : "Deste mês até daqui a 12 meses."}
          />
          <Kpi label="A pagar aos vendedores" value={formatMoneyCents(total("toPaySellers"))} detail="Parte dos vendedores ainda não paga." />
          <Kpi label="Estornos" value={formatMoneyCents(total("chargebacks"))} detail="Devoluções por cotas canceladas no período." />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Kpi label="A receber" value={formatMoneyCents(total("toPaySellers", upcoming))} detail="Sua comissão prevista deste mês até daqui a 12 meses." />
          <Kpi label="Já pago a você" value={formatMoneyCents(total("paidSellers"))} detail="Nos últimos 3 meses e nos próximos." />
          <Kpi label="Estornos" value={formatMoneyCents(total("sellerChargebacks"))} detail="Descontos por cotas canceladas." />
        </div>
      )}

      <Panel
        title="Mês a mês"
        description={isAdmin
          ? "Pelo mês de vencimento de cada parcela da comissão."
          : "Sua parte em cada mês, pelo vencimento das parcelas."}
        action={isAdmin && administrators.length > 0 ? (
          <Select value={administratorId} onValueChange={setAdministratorId}>
            <SelectTrigger className="h-9 w-full sm:w-56" aria-label="Administradora"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas as administradoras</SelectItem>
              {administrators.map((admin) => <SelectItem key={admin.id} value={admin.id}>{admin.name}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : undefined}
      >
        {rows.length === 0 ? (
          <EmptyState>
            {isAdmin
              ? "Nenhuma comissão neste período. Cadastre as regras na aba Regras para as cotas gerarem parcelas."
              : "Nenhuma comissão sua neste período."}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] tabular-nums">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Mês</th>
                  {isAdmin ? (
                    <>
                      <th className="py-2 pr-3 text-right font-medium">A receber</th>
                      <th className="py-2 pr-3 text-right font-medium">Recebido</th>
                      <th className="py-2 pr-3 text-right font-medium">A pagar aos vendedores</th>
                      <th className="py-2 pr-3 text-right font-medium">Pago aos vendedores</th>
                      <th className="py-2 text-right font-medium">Estornos</th>
                    </>
                  ) : (
                    <>
                      <th className="py-2 pr-3 text-right font-medium">A receber</th>
                      <th className="py-2 pr-3 text-right font-medium">Pago</th>
                      <th className="py-2 text-right font-medium">Estornos</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {forecast.map((month) => (
                  <tr key={month.month} className={cn("border-t", month.month === currentMonth && "bg-secondary/60 font-medium")}>
                    <td className="py-1.5 pr-3">{formatMonth(month.month)}</td>
                    {isAdmin ? (
                      <>
                        <Cell value={month.toReceive} />
                        <Cell value={month.received} />
                        <Cell value={month.toPaySellers} />
                        <Cell value={month.paidSellers} />
                        <Cell value={month.chargebacks} last />
                      </>
                    ) : (
                      <>
                        <Cell value={month.toPaySellers} />
                        <Cell value={month.paidSellers} />
                        <Cell value={month.sellerChargebacks} last />
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Cell({ value, last }: { value: number; last?: boolean }) {
  return (
    <td className={cn("py-1.5 text-right", !last && "pr-3", value === 0 && "text-muted-foreground", value < 0 && "text-destructive")}>
      {value === 0 ? "—" : formatMoneyCents(value)}
    </td>
  );
}
