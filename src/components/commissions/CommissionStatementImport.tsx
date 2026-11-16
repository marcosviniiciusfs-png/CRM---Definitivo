import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { todayInBrazil } from "@/lib/consortium";
import {
  STATEMENT_COLUMNS,
  STATEMENT_MATCH_LABEL,
  formatMoneyCents,
  guessStatementColumns,
  matchStatement,
  type StatementColumn,
} from "@/lib/consortiumCommission";
import { useStatementReference, useUpdateInstallmentStatus } from "@/hooks/useConsortiumCommissions";
import { EmptyState, Panel } from "./shared";
import { plural } from "./format";

const NONE = "__none__";

interface ParsedFile {
  name: string;
  headers: string[];
  rows: unknown[][];
}

/** Importa o extrato da administradora (CSV ou planilha) e marca as parcelas encontradas como recebidas. */
export function CommissionStatementImport() {
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [columns, setColumns] = useState<Partial<Record<StatementColumn, number>>>({});
  const [receivedOn, setReceivedOn] = useState(todayInBrazil());
  const [reading, setReading] = useState(false);
  const reference = useStatementReference(!!file);
  const updateStatus = useUpdateInstallmentStatus();

  const readFile = async (selected: File | undefined) => {
    if (!selected) return;
    setReading(true);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await selected.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
      const headerIndex = table.findIndex((row) => row.filter((cell) => String(cell ?? "").trim()).length >= 2);
      if (headerIndex < 0) {
        toast.error("Não foi possível ler o arquivo. Use um CSV ou uma planilha com cabeçalho na primeira linha.");
        return;
      }
      const headers = table[headerIndex].map((cell, index) => String(cell ?? "").trim() || `Coluna ${index + 1}`);
      setFile({ name: selected.name, headers, rows: table.slice(headerIndex + 1) });
      setColumns(guessStatementColumns(headers));
    } catch (error) {
      console.error("Erro ao ler extrato:", error);
      toast.error("Não foi possível ler o arquivo. Use um CSV ou uma planilha .xlsx.");
    } finally {
      setReading(false);
    }
  };

  const hasKey = columns.contract !== undefined || (columns.group !== undefined && columns.quota !== undefined);
  const ready = !!file && hasKey && columns.installment !== undefined;
  const matches = useMemo(() => {
    if (!ready || !file || !reference.data) return [];
    return matchStatement(file.rows, columns, reference.data.sales, reference.data.installments);
  }, [ready, file, columns, reference.data]);
  const toMark = matches.filter((match) => match.status === "ok" && match.installmentId);
  const issues = matches.filter((match) => match.status !== "ok");
  const differing = toMark.filter((match) => match.valueDiffers).length;

  const confirm = () => {
    const ids = toMark.map((match) => match.installmentId as string);
    updateStatus.mutate(
      { ids, status: "recebida", date: receivedOn },
      {
        onSuccess: (count) => {
          toast.success(count === 1 ? "1 parcela marcada como recebida." : `${count} parcelas marcadas como recebidas.`);
          setFile(null);
          setColumns({});
        },
        onError: (error) => {
          console.error("Erro ao conciliar extrato:", error);
          toast.error("Não foi possível marcar as parcelas. Tente novamente.");
        },
      },
    );
  };

  return (
    <Panel
      title="Importar extrato"
      description="Envie o extrato de comissões da administradora em CSV ou planilha. As parcelas encontradas viram recebidas."
    >
      <div className="space-y-4">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed px-4 py-6 text-center hover:bg-secondary/60">
          <FileSpreadsheet className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
          <span className="text-sm font-medium text-foreground">{file ? file.name : "Escolher arquivo"}</span>
          <span className="text-xs text-muted-foreground">
            {reading ? "Lendo o arquivo..." : file ? `${plural(file.rows.length, "linha", "linhas")}. Clique para trocar.` : "CSV, XLSX ou XLS."}
          </span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="sr-only"
            onChange={(event) => {
              void readFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>

        {file && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {STATEMENT_COLUMNS.map((column) => (
                <div key={column.key} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{column.label}</Label>
                  <Select
                    value={columns[column.key] === undefined ? NONE : String(columns[column.key])}
                    onValueChange={(value) => setColumns((current) => ({ ...current, [column.key]: value === NONE ? undefined : Number(value) }))}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Não tem</SelectItem>
                      {file.headers.map((header, index) => <SelectItem key={index} value={String(index)}>{header}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              <div className="space-y-1">
                <Label htmlFor="received-on" className="text-xs text-muted-foreground">Recebida em</Label>
                <Input id="received-on" type="date" className="h-9" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value || todayInBrazil())} />
              </div>
            </div>

            {!ready ? (
              <EmptyState>Escolha a coluna do contrato (ou grupo e cota) e a do nº da parcela.</EmptyState>
            ) : reference.isLoading ? (
              <EmptyState>Procurando as cotas...</EmptyState>
            ) : reference.isError ? (
              <EmptyState>Não foi possível carregar as cotas. Tente novamente.</EmptyState>
            ) : matches.length === 0 ? (
              <EmptyState>Nenhuma linha com contrato ou grupo e cota neste arquivo.</EmptyState>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                  <span className="font-semibold text-foreground">{plural(toMark.length, "parcela encontrada", "parcelas encontradas")}</span>
                  {issues.length > 0 && <span className="text-warning">{plural(issues.length, "linha não entra", "linhas não entram")}</span>}
                  {differing > 0 && <span className="text-muted-foreground">{plural(differing, "valor diferente", "valores diferentes")} do previsto</span>}
                </div>
                <div className="max-h-[420px] overflow-auto rounded-md border">
                  <table className="w-full text-[13px] tabular-nums">
                    <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Linha</th>
                        <th className="px-3 py-2 font-medium">Cota</th>
                        <th className="px-3 py-2 text-right font-medium">Parcela</th>
                        <th className="px-3 py-2 text-right font-medium">Extrato</th>
                        <th className="px-3 py-2 text-right font-medium">Previsto</th>
                        <th className="px-3 py-2 font-medium">Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...issues, ...toMark].map((match) => (
                        <tr key={match.row} className="border-t">
                          <td className="px-3 py-1.5 text-muted-foreground">{match.row + 2}</td>
                          <td className="max-w-[220px] truncate px-3 py-1.5">{match.reference}</td>
                          <td className="px-3 py-1.5 text-right">{match.n ?? "—"}</td>
                          <td className={cn("px-3 py-1.5 text-right", match.valueDiffers && "font-semibold text-warning")}>
                            {match.value === null ? "—" : formatMoneyCents(match.value)}
                          </td>
                          <td className="px-3 py-1.5 text-right">{match.expected === undefined ? "—" : formatMoneyCents(match.expected)}</td>
                          <td className={cn("px-3 py-1.5", match.status === "ok" ? "text-success" : "text-muted-foreground")}>
                            {STATEMENT_MATCH_LABEL[match.status]}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button variant="outline" onClick={() => { setFile(null); setColumns({}); }}>Descartar</Button>
                  <Button onClick={confirm} disabled={toMark.length === 0 || updateStatus.isPending}>
                    {updateStatus.isPending ? "Marcando..." : toMark.length === 1 ? "Marcar 1 como recebida" : `Marcar ${toMark.length} como recebidas`}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Panel>
  );
}
