import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Copy, RefreshCw, Check, UserCircle, ArrowRight, Tag } from "lucide-react";

interface WebhookConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webhook: {
    id: string;
    webhook_token: string;
    is_active: boolean;
    name: string | null;
    tag_id: string | null;
    default_responsible_user_id: string | null;
  } | null;
  tagName: string;
  organizationId: string;
  onUpdated: () => void;
}

interface Funnel {
  id: string;
  name: string;
}

interface FunnelStage {
  id: string;
  name: string;
  position: number;
}

interface Colaborador {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export const WebhookConfigModal = ({
  open,
  onOpenChange,
  webhook,
  tagName,
  organizationId,
  onUpdated,
}: WebhookConfigModalProps) => {
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Funnel selection
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [selectedFunnelId, setSelectedFunnelId] = useState<string>("");
  const [stages, setStages] = useState<FunnelStage[]>([]);
  const [selectedStageId, setSelectedStageId] = useState<string>("");
  const [loadingFunnels, setLoadingFunnels] = useState(false);
  
  // Responsible selection
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [selectedResponsibleId, setSelectedResponsibleId] = useState<string>("");
  const [loadingColaboradores, setLoadingColaboradores] = useState(false);
  
  // Tag name editing
  const [editedTagName, setEditedTagName] = useState("");

  useEffect(() => {
    if (webhook && open) {
      setName(webhook.name || tagName || "");
      setIsActive(webhook.is_active);
      setEditedTagName(tagName || "");
      setSelectedResponsibleId(webhook.default_responsible_user_id || "");
      
      loadFunnelsAndMapping();
      loadColaboradores();
    }
  }, [webhook, tagName, open]);

  const loadFunnelsAndMapping = async () => {
    if (!webhook) return;
    
    try {
      setLoadingFunnels(true);
      
      // Load funnels
      const { data: funnelsData } = await supabase
        .from("sales_funnels")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name");
      
      if (funnelsData) {
        setFunnels(funnelsData);
      }
      
      // Check if there's a mapping for this specific webhook
      // We use source_identifier to match webhook-specific mappings
      const { data: mappingData } = await supabase
        .from("funnel_source_mappings")
        .select("funnel_id, target_stage_id")
        .eq("source_type", "webhook")
        .eq("source_identifier", webhook.id)
        .maybeSingle();
      
      if (mappingData) {
        setSelectedFunnelId(mappingData.funnel_id);
        setSelectedStageId(mappingData.target_stage_id);
        
        // Load stages for the selected funnel
        const { data: stagesData } = await supabase
          .from("funnel_stages")
          .select("id, name, position")
          .eq("funnel_id", mappingData.funnel_id)
          .order("position");
        
        if (stagesData) {
          setStages(stagesData);
        }
      } else {
        // Check for generic webhook mapping
        const { data: genericMapping } = await supabase
          .from("funnel_source_mappings")
          .select("funnel_id, target_stage_id")
          .eq("source_type", "webhook")
          .is("source_identifier", null)
          .maybeSingle();
        
        if (genericMapping) {
          setSelectedFunnelId(genericMapping.funnel_id);
          setSelectedStageId(genericMapping.target_stage_id);
          
          const { data: stagesData } = await supabase
            .from("funnel_stages")
            .select("id, name, position")
            .eq("funnel_id", genericMapping.funnel_id)
            .order("position");
          
          if (stagesData) {
            setStages(stagesData);
          }
        }
      }
    } catch (error) {
      console.error("Erro ao carregar funis:", error);
    } finally {
      setLoadingFunnels(false);
    }
  };
  
  const loadColaboradores = async () => {
    try {
      setLoadingColaboradores(true);
      
      const { data: members } = await supabase.rpc('get_organization_members_masked');
      
      if (!members) return;
      
      const userIds = members.filter((m: any) => m.user_id).map((m: any) => m.user_id);
      
      if (userIds.length === 0) return;
      
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url')
        .in('user_id', userIds);
      
      if (profiles) {
        setColaboradores(profiles.map(p => ({
          user_id: p.user_id,
          full_name: p.full_name,
          avatar_url: p.avatar_url
        })));
      }
    } catch (error) {
      console.error("Erro ao carregar colaboradores:", error);
    } finally {
      setLoadingColaboradores(false);
    }
  };
  
  const handleFunnelChange = async (funnelId: string) => {
    setSelectedFunnelId(funnelId);
    setSelectedStageId("");
    
    // Load stages for selected funnel
    const { data: stagesData } = await supabase
      .from("funnel_stages")
      .select("id, name, position")
      .eq("funnel_id", funnelId)
      .order("position");
    
    if (stagesData) {
      setStages(stagesData);
      // Auto-select first stage
      if (stagesData.length > 0) {
        setSelectedStageId(stagesData[0].id);
      }
    }
  };

  if (!webhook) return null;

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/form-webhook/${webhook.webhook_token}`;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success("URL copiada!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerateToken = async () => {
    setRegenerating(true);
    try {
      const newToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const { error } = await supabase
        .from("webhook_configs")
        .update({ webhook_token: newToken })
        .eq("id", webhook.id);

      if (error) throw error;

      toast.success("Token regenerado! A URL anterior não funcionará mais.");
      onUpdated();
    } catch (error) {
      console.error("Erro ao regenerar token:", error);
      toast.error("Erro ao regenerar token");
    } finally {
      setRegenerating(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // Update webhook config
      const { error: webhookError } = await supabase
        .from("webhook_configs")
        .update({
          name: name.trim() || null,
          is_active: isActive,
          default_responsible_user_id: selectedResponsibleId || null,
        })
        .eq("id", webhook.id);

      if (webhookError) throw webhookError;

      // Update tag name if changed
      if (webhook.tag_id && editedTagName.trim() && editedTagName !== tagName) {
        await supabase
          .from("lead_tags")
          .update({ name: editedTagName.trim() })
          .eq("id", webhook.tag_id);
      }
      
      // Update or create funnel mapping for this specific webhook
      if (selectedFunnelId && selectedStageId) {
        // Check if mapping exists for this webhook
        const { data: existingMapping } = await supabase
          .from("funnel_source_mappings")
          .select("id")
          .eq("source_type", "webhook")
          .eq("source_identifier", webhook.id)
          .maybeSingle();
        
        if (existingMapping) {
          await supabase
            .from("funnel_source_mappings")
            .update({
              funnel_id: selectedFunnelId,
              target_stage_id: selectedStageId,
            })
            .eq("id", existingMapping.id);
        } else {
          await supabase
            .from("funnel_source_mappings")
            .insert({
              funnel_id: selectedFunnelId,
              source_type: "webhook",
              source_identifier: webhook.id,
              target_stage_id: selectedStageId,
            });
        }
      }

      toast.success("Webhook atualizado!");
      onOpenChange(false);
      onUpdated();
    } catch (error) {
      console.error("Erro ao salvar webhook:", error);
      toast.error("Erro ao salvar webhook");
    } finally {
      setLoading(false);
    }
  };
  
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar Webhook</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Nome do Webhook */}
          <div className="space-y-2">
            <Label htmlFor="config-name">Nome do Webhook</Label>
            <Input
              id="config-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do webhook"
            />
          </div>

          {/* Status */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Status</Label>
              <p className="text-xs text-muted-foreground">
                Webhooks inativos não criarão leads
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {/* URL do Webhook */}
          <div className="space-y-2">
            <Label>URL do Webhook</Label>
            <div className="flex gap-2">
              <Input value={webhookUrl} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={handleCopyUrl}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Use esta URL como destino do seu formulário. Envie dados via POST com os campos:{" "}
              <code className="px-1 py-0.5 bg-muted rounded">nome</code> e{" "}
              <code className="px-1 py-0.5 bg-muted rounded">telefone</code> (obrigatórios).
            </p>
          </div>

          <Button
            variant="outline"
            onClick={handleRegenerateToken}
            disabled={regenerating}
            className="w-full"
          >
            {regenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Regenerar Token
          </Button>

          {/* Seletor de Funil */}
          <div className="space-y-2 pt-2 border-t">
            <Label className="flex items-center gap-1.5">
              <ArrowRight className="h-3.5 w-3.5" />
              Direcionar leads para:
            </Label>
            {loadingFunnels ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando funis...
              </div>
            ) : (
              <div className="space-y-2">
                <Select value={selectedFunnelId} onValueChange={handleFunnelChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o funil de destino" />
                  </SelectTrigger>
                  <SelectContent>
                    {funnels.map((funnel) => (
                      <SelectItem key={funnel.id} value={funnel.id}>
                        {funnel.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {selectedFunnelId && stages.length > 0 && (
                  <Select value={selectedStageId} onValueChange={setSelectedStageId}>
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
                )}
              </div>
            )}
          </div>

          {/* Seletor de Responsável */}
          <div className="space-y-2 pt-2 border-t">
            <Label className="flex items-center gap-1.5">
              <UserCircle className="h-3.5 w-3.5" />
              Responsável Padrão
            </Label>
            <p className="text-xs text-muted-foreground mb-2">
              Leads criados por este webhook serão atribuídos a este responsável
            </p>
            {loadingColaboradores ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando colaboradores...
              </div>
            ) : (
              <Select value={selectedResponsibleId} onValueChange={setSelectedResponsibleId}>
                <SelectTrigger>
                  {selectedResponsibleId ? (
                    <div className="flex items-center gap-2">
                      {(() => {
                        const colab = colaboradores.find(c => c.user_id === selectedResponsibleId);
                        if (!colab) return <SelectValue placeholder="Distribuição Automática" />;
                        return (
                          <>
                            <Avatar className="h-5 w-5">
                              {colab.avatar_url && <AvatarImage src={colab.avatar_url} />}
                              <AvatarFallback className="text-[10px]">
                                {getInitials(colab.full_name || "NC")}
                              </AvatarFallback>
                            </Avatar>
                            <span>{colab.full_name || "Sem nome"}</span>
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <SelectValue placeholder="Distribuição Automática" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    <div className="flex items-center gap-2">
                      <UserCircle className="h-4 w-4 text-muted-foreground" />
                      <span>Distribuição Automática</span>
                    </div>
                  </SelectItem>
                  {colaboradores.map((colab) => (
                    <SelectItem key={colab.user_id} value={colab.user_id}>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          {colab.avatar_url && <AvatarImage src={colab.avatar_url} />}
                          <AvatarFallback className="text-[10px]">
                            {getInitials(colab.full_name || "NC")}
                          </AvatarFallback>
                        </Avatar>
                        <span>{colab.full_name || "Sem nome"}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Tag associada */}
          {webhook.tag_id && (
            <div className="space-y-2 pt-2 border-t">
              <Label className="flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" />
                Tag Associada
              </Label>
              <Input
                value={editedTagName}
                onChange={(e) => setEditedTagName(e.target.value)}
                placeholder="Nome da tag"
              />
              <p className="text-xs text-muted-foreground">
                Esta tag será automaticamente aplicada aos leads recebidos por este webhook
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
