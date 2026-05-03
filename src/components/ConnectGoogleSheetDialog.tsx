import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowRight, ArrowLeft, FileSpreadsheet, AlertCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";

interface ConnectGoogleSheetDialogProps {
  saEmail: string;
  onClose: () => void;
  onCreated: () => void;
}

interface SheetTab {
  sheetId: number;
  title: string;
  rowCount: number;
}

interface FieldMapping {
  excelColumn: string;
  columnIndex: number;
  crmField: string;
  preview: string[];
}

const CRM_FIELDS = [
  { value: "ignore", label: "Ignorar" },
  { value: "nome_lead", label: "Nome do Lead *" },
  { value: "telefone_lead", label: "Telefone *" },
  { value: "email", label: "Email" },
  { value: "empresa", label: "Empresa" },
  { value: "valor", label: "Valor" },
  { value: "responsavel", label: "Responsável" },
  { value: "descricao_negocio", label: "Descrição do Negócio" },
  { value: "source", label: "Origem" },
  { value: "additional_data", label: "→ Dados Adicionais" },
];

// Extrai spreadsheetId de uma URL ou retorna a string se já parecer um ID.
function parseSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // URLs do tipo: https://docs.google.com/spreadsheets/d/{ID}/edit#gid=0
  const m = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  // Se for puro ID
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

export const ConnectGoogleSheetDialog = ({
  saEmail, onClose, onCreated,
}: ConnectGoogleSheetDialogProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { organizationId } = useOrganization();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [linkInput, setLinkInput] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState<string>("");
  const [spreadsheetName, setSpreadsheetName] = useState<string>("");
  const [tabs, setTabs] = useState<SheetTab[]>([]);
  const [selectedTab, setSelectedTab] = useState<string>("");
  const [headerRow, setHeaderRow] = useState<number>(1);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [funnels, setFunnels] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [selectedFunnel, setSelectedFunnel] = useState<string>("");
  const [selectedStage, setSelectedStage] = useState<string>("");
  const [intervalMin, setIntervalMin] = useState<number>(2);
  const [attribution, setAttribution] = useState<"connector" | "roleta" | "spreadsheet_column">("connector");
  const [attributionColumn, setAttributionColumn] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // Carrega funis ao abrir
  useEffect(() => {
    if (!organizationId) return;
    (async () => {
      const { data } = await supabase
        .from("sales_funnels")
        .select("id, name, is_default")
        .eq("organization_id", organizationId)
        .order("is_default", { ascending: false });
      setFunnels(data || []);
      if (data && data.length > 0) {
        const def = data.find((f: any) => f.is_default) || data[0];
        setSelectedFunnel(def.id);
        const { data: st } = await supabase
          .from("funnel_stages")
          .select("id, name, position")
          .eq("funnel_id", def.id)
          .eq("is_final", false)
          .order("position");
        setStages(st || []);
        if (st && st.length > 0) setSelectedStage(st[0].id);
      }
    })();
  }, [organizationId]);

  const loadStagesFor = async (funnelId: string) => {
    setSelectedFunnel(funnelId);
    const { data: st } = await supabase
      .from("funnel_stages")
      .select("id, name, position")
      .eq("funnel_id", funnelId)
      .eq("is_final", false)
      .order("position");
    setStages(st || []);
    if (st && st.length > 0) setSelectedStage(st[0].id);
  };

  // Step 1 → 2: chama Sheets API via fetch direto (com access_token via Edge Function)
  const fetchSpreadsheetMeta = async () => {
    const id = parseSpreadsheetId(linkInput);
    if (!id) {
      toast({ title: "Link inválido", description: "Cole o link completo da planilha do Google Sheets", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      // Reusa o backend para buscar metadados (não expor token ao client)
      const { data, error } = await supabase.functions.invoke("sync-google-sheets-meta", {
        body: { spreadsheet_id: id },
      });
      if (error) throw new Error(error.message || "Erro ao consultar planilha");
      if (data?.error) throw new Error(data.error);
      setSpreadsheetId(id);
      setSpreadsheetName(data.title || "Planilha");
      setTabs(data.sheets || []);
      if (data.sheets && data.sheets.length > 0) {
        setSelectedTab(data.sheets[0].title);
      }
      setStep(2);
    } catch (err: any) {
      const isPermissionErr = /permiss|403|compartilhad/i.test(err.message || '');
      toast({
        title: isPermissionErr ? "Planilha não compartilhada" : "Não consegui ler a planilha",
        description: isPermissionErr
          ? `Compartilhe a planilha com ${saEmail || 'o email do CRM'} (Visualização) e tente novamente.`
          : err.message || 'Verifique o link e tente novamente.',
        variant: "destructive",
        duration: isPermissionErr ? 8000 : 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  // Step 2 → 3: lê preview da aba e auto-mapeia
  const fetchTabPreview = async () => {
    if (!selectedTab) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-google-sheets-meta", {
        body: { spreadsheet_id: spreadsheetId, sheet_name: selectedTab, preview: true, header_row: headerRow },
      });
      if (error) throw new Error(error.message || "Erro ao ler aba");
      if (data?.error) throw new Error(data.error);

      const all: string[][] = data.values || [];
      const hIdx = Math.max(0, headerRow - 1);
      const hdrs = (all[hIdx] || []).map((h: any) => String(h || ""));
      const rows = all.slice(hIdx + 1, hIdx + 4); // 3 linhas de preview

      setHeaders(hdrs);
      setPreviewRows(rows);

      // Auto-map
      const auto: FieldMapping[] = hdrs.map((col, idx) => {
        const c = col.toLowerCase().trim();
        let crmField = "additional_data";
        if (c.includes("nome") || c === "name") crmField = "nome_lead";
        else if (c.includes("telefone") || c.includes("phone") || c.includes("whatsapp") || c.includes("celular")) crmField = "telefone_lead";
        else if (c.includes("email") || c.includes("e-mail")) crmField = "email";
        else if (c.includes("empresa") || c.includes("company")) crmField = "empresa";
        else if (c.includes("valor") || c.includes("price")) crmField = "valor";
        else if (c.includes("responsável") || c.includes("responsavel")) crmField = "responsavel";
        else if (c.includes("origem") || c.includes("source")) crmField = "source";
        else if (c.includes("descrição") || c.includes("descricao")) crmField = "descricao_negocio";
        const preview = rows.slice(0, 3).map(r => String(r[idx] ?? ""));
        return { excelColumn: col, columnIndex: idx, crmField, preview };
      });
      setMappings(auto);
      setStep(3);
    } catch (err: any) {
      toast({ title: "Erro ao carregar aba", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user || !organizationId) return;
    const hasNome = mappings.some(m => m.crmField === "nome_lead");
    const hasTel = mappings.some(m => m.crmField === "telefone_lead");
    if (!hasNome || !hasTel) {
      toast({ title: "Mapeamento incompleto", description: "É obrigatório mapear Nome e Telefone.", variant: "destructive" });
      return;
    }
    if (attribution === "spreadsheet_column" && !attributionColumn) {
      toast({ title: "Coluna de responsável", description: "Selecione qual coluna da planilha indica o responsável.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
      const { error } = await supabase.from("sheet_sync_configs").insert({
        organization_id: organizationId,
        user_id: user.id,
        spreadsheet_id: spreadsheetId,
        spreadsheet_url: url,
        spreadsheet_name: spreadsheetName,
        sheet_name: selectedTab,
        header_row: headerRow,
        column_map: mappings,
        funnel_id: selectedFunnel || null,
        funnel_stage_id: selectedStage || null,
        source_label: `Sheets · ${spreadsheetName}`,
        attribution_strategy: attribution,
        attribution_column: attribution === "spreadsheet_column" ? attributionColumn : null,
        sync_interval_minutes: intervalMin,
        is_active: true,
        next_sync_at: new Date().toISOString(), // sincroniza imediatamente no próximo tick
      });
      if (error) throw error;
      toast({ title: "Planilha conectada!", description: "A primeira sincronização acontecerá em alguns segundos." });
      onCreated();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const updateMapping = (idx: number, newField: string) => {
    setMappings(prev => prev.map((m, i) => i === idx ? { ...m, crmField: newField } : m));
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-[#0F9D58]" />
            Conectar planilha · Etapa {step} de 3
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <Card className="border-[#0F9D58]/30 bg-[#0F9D58]/5">
              <CardContent className="p-3 flex gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#0F9D58]" />
                <div className="text-xs space-y-1">
                  <p><strong>Antes de continuar:</strong> compartilhe a planilha com o email abaixo (Visualização):</p>
                  <code className="block bg-background border rounded px-2 py-1 text-[11px] font-mono break-all select-all">
                    {saEmail || '(email não configurado)'}
                  </code>
                  <p className="text-muted-foreground">Sem isso, o CRM não consegue ler os dados.</p>
                </div>
              </CardContent>
            </Card>
            <div>
              <Label htmlFor="link">Link da planilha</Label>
              <Input
                id="link"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Cole o link completo. A planilha precisa estar compartilhada com a conta Google que você conectou.
              </p>
            </div>
            <Card className="border-muted bg-muted/40">
              <CardContent className="p-3 flex gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>Como pegar o link?</strong></p>
                  <p>Abra a planilha no Google Sheets, copie a URL da barra de endereço do navegador e cole acima.</p>
                  <p>Você pode escolher qual aba usar na próxima etapa.</p>
                </div>
              </CardContent>
            </Card>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={fetchSpreadsheetMeta} disabled={!linkInput || loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                Continuar
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="text-sm">
              <span className="text-muted-foreground">Planilha:</span> <strong>{spreadsheetName}</strong>
            </div>
            <div>
              <Label>Aba a sincronizar</Label>
              <Select value={selectedTab} onValueChange={setSelectedTab}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {tabs.map(t => (
                    <SelectItem key={t.title} value={t.title}>
                      {t.title} · {t.rowCount} linhas
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Linha do cabeçalho</Label>
              <Input
                type="number" min={1} max={20}
                value={headerRow}
                onChange={(e) => setHeaderRow(Math.max(1, parseInt(e.target.value) || 1))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Em qual linha estão os títulos das colunas? Geralmente é a linha 1, mas se a planilha tem título antes use o número correto.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
              </Button>
              <Button onClick={fetchTabPreview} disabled={!selectedTab || loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                Continuar
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="text-sm">
              <span className="text-muted-foreground">{spreadsheetName}</span> · aba <strong>{selectedTab}</strong>
            </div>

            <div>
              <Label className="mb-2 block">Mapeamento das colunas</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Escolha qual coluna da sua planilha corresponde a cada campo do CRM. Nome e Telefone são obrigatórios.
              </p>
              <ScrollArea className="h-[280px] border rounded">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Coluna</TableHead>
                      <TableHead>Exemplo</TableHead>
                      <TableHead>Campo no CRM</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mappings.map((m, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium text-sm">{m.excelColumn || `Coluna ${idx + 1}`}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                          {m.preview.filter(Boolean).join(" · ") || "(vazio)"}
                        </TableCell>
                        <TableCell>
                          <Select value={m.crmField} onValueChange={(v) => updateMapping(idx, v)}>
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {CRM_FIELDS.map(f => (
                                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Funil destino</Label>
                <Select value={selectedFunnel} onValueChange={loadStagesFor}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {funnels.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Etapa inicial</Label>
                <Select value={selectedStage} onValueChange={setSelectedStage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Frequência de verificação</Label>
                <Select value={String(intervalMin)} onValueChange={(v) => setIntervalMin(parseInt(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">A cada 2 minutos (recomendado)</SelectItem>
                    <SelectItem value="5">A cada 5 minutos</SelectItem>
                    <SelectItem value="15">A cada 15 minutos</SelectItem>
                    <SelectItem value="60">A cada 1 hora</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quem fica com o lead</Label>
                <Select value={attribution} onValueChange={(v: any) => setAttribution(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="connector">Eu (quem conectou)</SelectItem>
                    <SelectItem value="roleta">Roleta de leads</SelectItem>
                    <SelectItem value="spreadsheet_column">Por coluna da planilha</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {attribution === "spreadsheet_column" && (
              <div>
                <Label>Coluna que indica o responsável</Label>
                <Select value={attributionColumn} onValueChange={setAttributionColumn}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {headers.map((h, i) => h ? <SelectItem key={i} value={h}>{h}</SelectItem> : null)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
              </Button>
              <Button onClick={handleSave} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Salvar e ativar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
