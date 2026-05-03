import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, Loader2, AlertCircle, ArrowLeft, Plus, RefreshCw, Trash2, Link as LinkIcon, Copy, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/contexts/OrganizationContext";
import { ConnectGoogleSheetDialog } from "./ConnectGoogleSheetDialog";
import { SyncLogViewer } from "./SyncLogViewer";

interface SyncConfig {
  id: string;
  spreadsheet_name: string | null;
  spreadsheet_url: string | null;
  sheet_name: string;
  sync_interval_minutes: number;
  last_synced_at: string | null;
  last_error: string | null;
  error_count: number;
  is_active: boolean;
  created_at: string;
}

interface GoogleSheetsConnectionProps {
  onClose: () => void;
}

const formatRelative = (iso: string | null): string => {
  if (!iso) return "Nunca";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 60_000) return "agora";
  const min = Math.floor(diffMs / 60_000);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return new Date(iso).toLocaleString("pt-BR");
};

const SA_EMAIL = import.meta.env.VITE_GOOGLE_SA_EMAIL ?? '';

export const GoogleSheetsConnection = ({ onClose }: GoogleSheetsConnectionProps) => {
  const { toast } = useToast();
  const { organizationId } = useOrganization();
  const [loading, setLoading] = useState(true);
  const [configs, setConfigs] = useState<SyncConfig[]>([]);
  const [showConnect, setShowConnect] = useState(false);
  const [logViewerConfigId, setLogViewerConfigId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadAll = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("sheet_sync_configs")
        .select("id, spreadsheet_name, spreadsheet_url, sheet_name, sync_interval_minutes, last_synced_at, last_error, error_count, is_active, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setConfigs((data || []) as SyncConfig[]);
    } catch (err: any) {
      console.error("Erro ao carregar configs:", err);
      toast({ title: "Erro", description: "Não foi possível carregar as planilhas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [organizationId, toast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const copyEmail = async () => {
    if (!SA_EMAIL) {
      toast({ title: "Email não configurado", description: "Variável VITE_GOOGLE_SA_EMAIL ausente — avise o administrador.", variant: "destructive" });
      return;
    }
    try {
      await navigator.clipboard.writeText(SA_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Email copiado!" });
    } catch {
      toast({ title: "Não consegui copiar", description: "Selecione e copie o email manualmente.", variant: "destructive" });
    }
  };

  const handleDeleteConfig = async (configId: string) => {
    if (!confirm("Remover esta sincronização? Os leads já criados não serão afetados.")) return;
    try {
      const { error } = await supabase.from("sheet_sync_configs").delete().eq("id", configId);
      if (error) throw error;
      toast({ title: "Sincronização removida" });
      loadAll();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleSyncNow = async (configId: string) => {
    setSyncingId(configId);
    try {
      const { error } = await supabase.functions.invoke("sync-google-sheets", {
        body: { config_id: configId },
      });
      if (error) throw error;
      toast({ title: "Sincronização disparada", description: "Aguarde alguns segundos e atualize." });
      setTimeout(loadAll, 2000);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Button variant="ghostIcon" size="icon" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileSpreadsheet className="h-5 w-5 text-[#0F9D58]" />
              Google Sheets — Importação automática
            </CardTitle>
            <CardDescription>
              Compartilhe a planilha com o email do CRM e novos leads aparecem automaticamente no funil (a cada 2 minutos)
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Card do email da SA — sempre visível */}
        <Card className="border-[#0F9D58]/20 bg-[#0F9D58]/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="h-5 w-5 text-[#0F9D58] mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm mb-1">Como conectar uma planilha</h3>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>No Google Sheets, abra a planilha e clique em <strong>Compartilhar</strong></li>
                  <li>Cole o email abaixo, escolha <strong>Visualizador</strong> e envie</li>
                  <li>Volte aqui e clique em <strong>Conectar planilha</strong></li>
                </ol>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-background border border-[#0F9D58]/30 rounded p-2">
              <code className="flex-1 text-xs font-mono truncate select-all">
                {SA_EMAIL || '(VITE_GOOGLE_SA_EMAIL não configurada)'}
              </code>
              <Button
                size="sm" variant="outline"
                onClick={copyEmail}
                className="flex-shrink-0 h-7"
                disabled={!SA_EMAIL}
              >
                {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">
                Planilhas sincronizando ({configs.filter(c => c.is_active).length})
              </h4>
              <Button size="sm" onClick={() => setShowConnect(true)}>
                <Plus className="h-4 w-4 mr-1" /> Conectar planilha
              </Button>
            </div>

            {configs.length === 0 ? (
              <Card className="border-dashed border-2">
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma planilha conectada. Compartilhe com o email acima e clique em <strong>Conectar planilha</strong>.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {configs.map((cfg) => (
                  <Card key={cfg.id} className={cfg.is_active ? "" : "opacity-60"}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-sm truncate">
                              {cfg.spreadsheet_name || cfg.sheet_name}
                            </p>
                            {cfg.is_active ? (
                              cfg.error_count > 0 ? (
                                <Badge variant="destructive" className="text-[10px] py-0 h-5">
                                  {cfg.error_count} erro(s)
                                </Badge>
                              ) : (
                                <Badge className="bg-[#66ee78] text-[10px] py-0 h-5">Sincronizando</Badge>
                              )
                            ) : (
                              <Badge variant="secondary" className="text-[10px] py-0 h-5">Pausada</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            Aba: <span className="font-mono">{cfg.sheet_name}</span> · A cada {cfg.sync_interval_minutes} min · Última verificação: {formatRelative(cfg.last_synced_at)}
                          </p>
                          {cfg.last_error && (
                            <p className="text-xs text-destructive mt-1 truncate">⚠ {cfg.last_error}</p>
                          )}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          {cfg.spreadsheet_url && (
                            <Button variant="ghostIcon" size="icon" asChild title="Abrir planilha">
                              <a href={cfg.spreadsheet_url} target="_blank" rel="noopener">
                                <LinkIcon className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          <Button
                            variant="ghostIcon" size="icon"
                            disabled={!cfg.is_active || syncingId === cfg.id}
                            onClick={() => handleSyncNow(cfg.id)}
                            title="Sincronizar agora"
                          >
                            {syncingId === cfg.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghostIcon" size="icon"
                            onClick={() => setLogViewerConfigId(cfg.id)}
                            title="Ver logs"
                          >
                            <AlertCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghostIcon" size="icon"
                            onClick={() => handleDeleteConfig(cfg.id)}
                            title="Remover"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {showConnect && organizationId && (
          <ConnectGoogleSheetDialog
            saEmail={SA_EMAIL}
            onClose={() => setShowConnect(false)}
            onCreated={() => { setShowConnect(false); loadAll(); }}
          />
        )}
        {logViewerConfigId && (
          <SyncLogViewer
            configId={logViewerConfigId}
            onClose={() => setLogViewerConfigId(null)}
          />
        )}
      </CardContent>
    </Card>
  );
};
