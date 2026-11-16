import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Download, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { parseDelimited, parsePlanRows, planTemplateCsv, type PlanDraft, type PlanRowError } from "@/lib/consortiumPlanImport";
import { useImportConsortiumPlans } from "@/hooks/useConsortiumPlans";

const MAX_ROWS = 300;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Lê a 1ª aba de um XLSX. Células em formato de porcentagem (0,18 = 18%) viram 18. */
async function readSpreadsheet(file: File): Promise<Array<Record<string, unknown>>> {
  if (file.name.toLowerCase().endsWith(".csv")) {
    return parseDelimited(await file.text());
  }
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  for (const [address, cell] of Object.entries(sheet)) {
    if (address.startsWith("!") || !cell || typeof cell !== "object") continue;
    const typed = cell as { t?: string; v?: unknown; z?: unknown; w?: string };
    if (typed.t === "n" && typeof typed.v === "number" && typeof typed.z === "string" && typed.z.includes("%")) {
      typed.v = Math.round(typed.v * 100 * 10000) / 10000;
      delete typed.w;
    }
  }
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
}

export function PlanImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const importPlans = useImportConsortiumPlans();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanDraft[]>([]);
  const [errors, setErrors] = useState<PlanRowError[]>([]);
  const [readError, setReadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFileName(null);
    setPlans([]);
    setErrors([]);
    setReadError(null);
  }, [open]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setReadError(null);
    try {
      const rows = await readSpreadsheet(file);
      if (rows.length === 0) {
        setPlans([]);
        setErrors([]);
        setReadError("A planilha não tem linhas de plano. Use o modelo e preencha a partir da linha 2.");
        return;
      }
      if (rows.length > MAX_ROWS) {
        setPlans([]);
        setErrors([]);
        setReadError(`A planilha tem ${rows.length} linhas. Importe até ${MAX_ROWS} planos por vez.`);
        return;
      }
      const result = parsePlanRows(rows);
      setPlans(result.plans);
      setErrors(result.errors);
    } catch (err) {
      console.error("Erro ao ler a planilha de planos:", err);
      setReadError("Não foi possível ler o arquivo. Use um CSV ou XLSX no formato do modelo.");
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob(["\uFEFF" + planTemplateCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "modelo-planos-consorcio.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    importPlans.mutate(plans, {
      onSuccess: ({ created, updated, administratorsCreated }) => {
        const parts = [
          created > 0 && plural(created, "plano criado", "planos criados"),
          updated > 0 && plural(updated, "plano atualizado", "planos atualizados"),
          administratorsCreated > 0 && plural(administratorsCreated, "administradora nova", "administradoras novas"),
        ].filter(Boolean);
        toast.success(`${parts.join(", ")}.`);
        onOpenChange(false);
      },
      onError: (error) => {
        console.error("Erro ao importar planos:", error);
        toast.error("Não foi possível importar os planos. Tente novamente.");
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar planos</DialogTitle>
          <DialogDescription>
            CSV ou XLSX com uma linha por plano. Plano com a mesma administradora, tipo de bem e nome é atualizado; administradora nova é cadastrada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={importPlans.isPending}>
              <Upload />
              Escolher arquivo
            </Button>
            <Button variant="ghost" onClick={downloadTemplate}>
              <Download />
              Baixar modelo
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                handleFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
          {fileName && <p className="truncate text-xs text-muted-foreground">{fileName}</p>}

          {readError && (
            <p role="alert" className="flex items-start gap-2 rounded-md bg-destructive-tint px-3 py-2 text-[13px] font-medium text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              {readError}
            </p>
          )}

          {fileName && !readError && (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">
                {plans.length > 0
                  ? `${plural(plans.length, "plano pronto", "planos prontos")} para importar`
                  : "Nenhum plano válido nesta planilha."}
              </p>
              {errors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[13px] text-destructive">
                    {plural(errors.length, "linha com erro fica de fora", "linhas com erro ficam de fora")}:
                  </p>
                  <ul className="max-h-40 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                    {errors.map((error) => (
                      <li key={`${error.line}-${error.message}`}>
                        <span className="tabular-nums">Linha {error.line}</span>: {error.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importPlans.isPending}>Cancelar</Button>
          <Button onClick={handleImport} disabled={plans.length === 0 || importPlans.isPending}>
            {importPlans.isPending ? "Importando..." : plans.length > 0 ? `Importar ${plural(plans.length, "plano", "planos")}` : "Importar planos"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
