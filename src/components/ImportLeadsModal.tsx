import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, FileSpreadsheet, ArrowRight, ArrowLeft, Check, AlertCircle, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { read, utils } from "xlsx";

interface ImportLeadsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FieldMapping {
  excelColumn: string;
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

export function ImportLeadsModal({ open, onOpenChange }: ImportLeadsModalProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [funnels, setFunnels] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [selectedFunnel, setSelectedFunnel] = useState<string>("");
  const [selectedStage, setSelectedStage] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<{ success: number; errors: number; errorDetails: string[] }>({
    success: 0,
    errors: 0,
    errorDetails: [],
  });

  const resetState = () => {
    setStep(1);
    setFile(null);
    setParsedData([]);
    setColumns([]);
    setMappings([]);
    setSelectedFunnel("");
    setSelectedStage("");
    setImporting(false);
    setImportProgress(0);
    setImportResults({ success: 0, errors: 0, errorDetails: [] });
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const handleFileUpload = useCallback(async (uploadedFile: File) => {
    setFile(uploadedFile);
    
    try {
      let jsonData: any[] = [];
      
      // Try parsing with xlsx library
      const data = await uploadedFile.arrayBuffer();
      const workbook = read(data, { type: "array", codepage: 65001 });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      jsonData = utils.sheet_to_json(worksheet, { defval: "" });
      
      if (jsonData.length === 0) {
        toast({
          title: "Arquivo vazio",
          description: "A planilha não contém dados para importar",
          variant: "destructive",
        });
        return;
      }
      
      const cols = Object.keys(jsonData[0] as object);
      setColumns(cols);
      setParsedData(jsonData);
      
      // Auto-map common fields
      const autoMappings: FieldMapping[] = cols.map((col) => {
        const colLower = col.toLowerCase().trim();
        let crmField = "additional_data";
        
        // Auto-detect common column names
        if (colLower.includes("nome") || colLower.includes("name")) {
          crmField = "nome_lead";
        } else if (colLower.includes("telefone") || colLower.includes("phone") || colLower.includes("whatsapp") || colLower.includes("celular")) {
          crmField = "telefone_lead";
        } else if (colLower.includes("email") || colLower.includes("e-mail")) {
          crmField = "email";
        } else if (colLower.includes("empresa") || colLower.includes("company")) {
          crmField = "empresa";
        } else if (colLower.includes("valor") || colLower.includes("value") || colLower.includes("price")) {
          crmField = "valor";
        } else if (colLower.includes("responsavel") || colLower.includes("responsável")) {
          crmField = "responsavel";
        } else if (colLower.includes("origem") || colLower.includes("source")) {
          crmField = "source";
        } else if (colLower.includes("descricao") || colLower.includes("descrição") || colLower.includes("description")) {
          crmField = "descricao_negocio";
        }
        
        // Preview first 3 values
        const preview = jsonData.slice(0, 3).map((row: any) => String(row[col] || ""));
        
        return {
          excelColumn: col,
          crmField,
          preview,
        };
      });
      
      setMappings(autoMappings);
      
      // Load funnels for step 3
      const { data: funnelData } = await supabase
        .from("sales_funnels")
        .select("id, name, is_default")
        .eq("is_active", true)
        .order("is_default", { ascending: false });
      
      setFunnels(funnelData || []);
      if (funnelData && funnelData.length > 0) {
        const defaultFunnel = funnelData.find(f => f.is_default) || funnelData[0];
        setSelectedFunnel(defaultFunnel.id);
        
        // Load stages for default funnel
        const { data: stageData } = await supabase
          .from("funnel_stages")
          .select("id, name, position")
          .eq("funnel_id", defaultFunnel.id)
          .eq("is_final", false)
          .order("position");
        
        setStages(stageData || []);
        if (stageData && stageData.length > 0) {
          setSelectedStage(stageData[0].id);
        }
      }
      
      setStep(2);
    } catch (error) {
      console.error("Erro ao processar arquivo:", error);
      toast({
        title: "Erro ao processar arquivo",
        description: "Verifique se o arquivo está no formato correto (Excel ou CSV)",
        variant: "destructive",
      });
    }
  }, [toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileUpload(droppedFile);
    }
  }, [handleFileUpload]);

  const handleMappingChange = (columnIndex: number, newCrmField: string) => {
    setMappings((prev) =>
      prev.map((m, i) => (i === columnIndex ? { ...m, crmField: newCrmField } : m))
    );
  };

  const handleFunnelChange = async (funnelId: string) => {
    setSelectedFunnel(funnelId);
    
    const { data: stageData } = await supabase
      .from("funnel_stages")
      .select("id, name, position")
      .eq("funnel_id", funnelId)
      .eq("is_final", false)
      .order("position");
    
    setStages(stageData || []);
    if (stageData && stageData.length > 0) {
      setSelectedStage(stageData[0].id);
    }
  };

  const validateMappings = () => {
    const hasTelefone = mappings.some((m) => m.crmField === "telefone_lead");
    const hasNome = mappings.some((m) => m.crmField === "nome_lead");
    
    if (!hasTelefone) {
      toast({
        title: "Mapeamento obrigatório",
        description: "É necessário mapear uma coluna para o campo Telefone",
        variant: "destructive",
      });
      return false;
    }
    
    if (!hasNome) {
      toast({
        title: "Mapeamento obrigatório",
        description: "É necessário mapear uma coluna para o campo Nome do Lead",
        variant: "destructive",
      });
      return false;
    }
    
    return true;
  };

  const processLeads = () => {
    return parsedData.map((row) => {
      const lead: Record<string, any> = {
        source: "Importação",
        funnel_id: selectedFunnel || null,
        funnel_stage_id: selectedStage || null,
      };
      const additionalData: Record<string, any> = {};
      
      mappings.forEach((mapping) => {
        const value = row[mapping.excelColumn];
        
        if (mapping.crmField === "ignore" || !value) {
          return;
        }
        
        if (mapping.crmField === "additional_data") {
          additionalData[mapping.excelColumn] = value;
        } else if (mapping.crmField === "valor") {
          // Parse value - handle different formats
          const cleanValue = String(value)
            .replace(/[R$\s]/g, "")
            .replace(/\./g, "")
            .replace(",", ".");
          lead.valor = parseFloat(cleanValue) || 0;
        } else if (mapping.crmField === "telefone_lead") {
          // Clean phone number
          lead.telefone_lead = String(value).replace(/\D/g, "");
        } else {
          lead[mapping.crmField] = String(value).trim();
        }
      });
      
      if (Object.keys(additionalData).length > 0) {
        lead.additional_data = additionalData;
      }
      
      return lead;
    });
  };

  const handleImport = async () => {
    if (!validateMappings()) return;
    
    setImporting(true);
    setImportProgress(0);
    
    const leads = processLeads();
    const validLeads = leads.filter((lead) => lead.nome_lead && lead.telefone_lead) as {
      nome_lead: string;
      telefone_lead: string;
      [key: string]: any;
    }[];
    
    if (validLeads.length === 0) {
      toast({
        title: "Nenhum lead válido",
        description: "Todos os registros estão faltando nome ou telefone",
        variant: "destructive",
      });
      setImporting(false);
      return;
    }
    
    const BATCH_SIZE = 50;
    let successCount = 0;
    let errorCount = 0;
    const errorDetails: string[] = [];
    
    for (let i = 0; i < validLeads.length; i += BATCH_SIZE) {
      const batch = validLeads.slice(i, i + BATCH_SIZE);
      
      try {
        const { data, error } = await supabase.from("leads").insert(batch).select();
        
        if (error) {
          errorCount += batch.length;
          errorDetails.push(`Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
        } else {
          successCount += data?.length || 0;
        }
      } catch (err: any) {
        errorCount += batch.length;
        errorDetails.push(`Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${err.message}`);
      }
      
      setImportProgress(Math.round(((i + batch.length) / validLeads.length) * 100));
    }
    
    setImportResults({ success: successCount, errors: errorCount, errorDetails });
    setImporting(false);
    setStep(4);
    
    if (successCount > 0) {
      toast({
        title: "Importação concluída",
        description: `${successCount} leads importados com sucesso`,
      });
    }
  };

  const getStepTitle = () => {
    switch (step) {
      case 1: return "Upload do Arquivo";
      case 2: return "Mapeamento de Campos";
      case 3: return "Configuração";
      case 4: return "Resultado da Importação";
      default: return "";
    }
  };

  const getMappedFieldsCount = () => {
    return mappings.filter((m) => m.crmField !== "ignore" && m.crmField !== "additional_data").length;
  };

  const getAdditionalFieldsCount = () => {
    return mappings.filter((m) => m.crmField === "additional_data").length;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Importar Leads - {getStepTitle()}
          </DialogTitle>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-2 py-4 border-b">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  s === step
                    ? "bg-primary text-primary-foreground"
                    : s < step
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {s < step ? <Check className="h-4 w-4" /> : s}
              </div>
              {s < 4 && (
                <div className={`w-12 h-0.5 mx-2 ${s < step ? "bg-primary" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-hidden">
          {/* Step 1: Upload */}
          {step === 1 && (
            <div className="flex flex-col items-center justify-center h-full p-8">
              <div
                className="w-full max-w-md border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => document.getElementById("file-input")?.click()}
              >
                <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">Arraste sua planilha aqui</p>
                <p className="text-sm text-muted-foreground mb-4">ou clique para selecionar</p>
                <p className="text-xs text-muted-foreground">Formatos aceitos: .xlsx, .xls, .csv</p>
                <input
                  id="file-input"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f);
                  }}
                />
              </div>
              {file && (
                <div className="mt-4 flex items-center gap-2 text-sm">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  <span>{file.name}</span>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Mapping */}
          {step === 2 && (
            <ScrollArea className="h-[400px] px-4">
              <div className="space-y-2 py-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-muted-foreground">
                    {parsedData.length} registros encontrados • {columns.length} colunas
                  </p>
                  <div className="flex gap-2">
                    <Badge variant="secondary">{getMappedFieldsCount()} campos mapeados</Badge>
                    <Badge variant="outline">{getAdditionalFieldsCount()} dados adicionais</Badge>
                  </div>
                </div>
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[200px]">Coluna da Planilha</TableHead>
                      <TableHead className="w-[200px]">Mapear para</TableHead>
                      <TableHead>Preview (3 primeiras linhas)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mappings.map((mapping, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{mapping.excelColumn}</TableCell>
                        <TableCell>
                          <Select
                            value={mapping.crmField}
                            onValueChange={(value) => handleMappingChange(index, value)}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CRM_FIELDS.map((field) => (
                                <SelectItem key={field.value} value={field.value}>
                                  {field.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {mapping.preview.filter(Boolean).join(" | ") || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          )}

          {/* Step 3: Configuration */}
          {step === 3 && (
            <div className="p-6 space-y-6">
              <div className="grid gap-6">
                <div className="space-y-2">
                  <Label>Funil de Destino</Label>
                  <Select value={selectedFunnel} onValueChange={handleFunnelChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o funil" />
                    </SelectTrigger>
                    <SelectContent>
                      {funnels.map((funnel) => (
                        <SelectItem key={funnel.id} value={funnel.id}>
                          {funnel.name} {funnel.is_default && "(Padrão)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Etapa Inicial</Label>
                  <Select value={selectedStage} onValueChange={setSelectedStage}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a etapa inicial" />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <h4 className="font-medium">Resumo da Importação</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total de registros:</span>
                    <span className="ml-2 font-medium">{parsedData.length}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Campos mapeados:</span>
                    <span className="ml-2 font-medium">{getMappedFieldsCount()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Dados adicionais:</span>
                    <span className="ml-2 font-medium">{getAdditionalFieldsCount()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Funil:</span>
                    <span className="ml-2 font-medium">
                      {funnels.find((f) => f.id === selectedFunnel)?.name || "-"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Results */}
          {step === 4 && (
            <div className="p-6 space-y-6">
              {importing ? (
                <div className="space-y-4 text-center">
                  <div className="animate-pulse">
                    <FileSpreadsheet className="h-16 w-16 mx-auto text-primary" />
                  </div>
                  <p className="text-lg font-medium">Importando leads...</p>
                  <Progress value={importProgress} className="w-full max-w-md mx-auto" />
                  <p className="text-sm text-muted-foreground">{importProgress}% concluído</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-center gap-8">
                    <div className="text-center">
                      <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-2">
                        <Check className="h-8 w-8 text-green-600" />
                      </div>
                      <p className="text-2xl font-bold text-green-600">{importResults.success}</p>
                      <p className="text-sm text-muted-foreground">Importados</p>
                    </div>
                    
                    {importResults.errors > 0 && (
                      <div className="text-center">
                        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-2">
                          <AlertCircle className="h-8 w-8 text-red-600" />
                        </div>
                        <p className="text-2xl font-bold text-red-600">{importResults.errors}</p>
                        <p className="text-sm text-muted-foreground">Erros</p>
                      </div>
                    )}
                  </div>

                  {importResults.errorDetails.length > 0 && (
                    <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                      <p className="font-medium text-red-800 dark:text-red-200 mb-2">Detalhes dos erros:</p>
                      <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                        {importResults.errorDetails.map((error, i) => (
                          <li key={i}>• {error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => {
              if (step === 1) {
                handleClose();
              } else if (step === 4 && !importing) {
                handleClose();
              } else {
                setStep(step - 1);
              }
            }}
            disabled={importing}
          >
            {step === 1 || (step === 4 && !importing) ? (
              <>
                <X className="h-4 w-4 mr-2" />
                Fechar
              </>
            ) : (
              <>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar
              </>
            )}
          </Button>

          {step < 4 && (
            <Button
              onClick={() => {
                if (step === 2) {
                  if (validateMappings()) {
                    setStep(3);
                  }
                } else if (step === 3) {
                  handleImport();
                }
              }}
              disabled={step === 1 || importing}
            >
              {step === 3 ? (
                <>
                  Importar {parsedData.length} leads
                  <Check className="h-4 w-4 ml-2" />
                </>
              ) : (
                <>
                  Próximo
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
