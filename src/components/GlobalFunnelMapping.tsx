import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Facebook, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface Funnel {
  id: string;
  name: string;
  is_active: boolean;
}

interface SourceMapping {
  id: string;
  source_type: string;
  source_identifier: string | null;
  target_stage_id: string;
  funnel_id: string;
}

export const GlobalFunnelMapping = () => {
  const { user } = useAuth();
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [mappings, setMappings] = useState<SourceMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [selectedWhatsAppFunnel, setSelectedWhatsAppFunnel] = useState<string>("");
  const [selectedFacebookFunnel, setSelectedFacebookFunnel] = useState<string>("");
  const [selectedWebhookFunnel, setSelectedWebhookFunnel] = useState<string>("");

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async (isUpdate = false) => {
    if (!user) return;

    try {
      if (!isUpdate) {
        setLoading(true);
      }

      // Get organization
      const { data: orgData } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .single();

      if (!orgData) return;

      // Load funnels
      const { data: funnelsData } = await supabase
        .from("sales_funnels")
        .select("id, name, is_active")
        .eq("organization_id", orgData.organization_id)
        .eq("is_active", true)
        .order("name");

      if (funnelsData) {
        setFunnels(funnelsData);
      }

      // Load existing mappings
      const { data: mappingsData } = await supabase
        .from("funnel_source_mappings")
        .select("*")
        .in("funnel_id", funnelsData?.map(f => f.id) || []);

      if (mappingsData) {
        setMappings(mappingsData);
        
        // Set current selections
        const whatsappMapping = mappingsData.find(m => m.source_type === "whatsapp");
        const facebookMapping = mappingsData.find(m => m.source_type === "facebook");
        const webhookMapping = mappingsData.find(m => m.source_type === "webhook");

        if (whatsappMapping) setSelectedWhatsAppFunnel(whatsappMapping.funnel_id);
        if (facebookMapping) setSelectedFacebookFunnel(facebookMapping.funnel_id);
        if (webhookMapping) setSelectedWebhookFunnel(webhookMapping.funnel_id);
      }
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Erro ao carregar funis");
    } finally {
      if (!isUpdate) {
        setLoading(false);
      }
    }
  };

  const handleSourceMappingChange = async (sourceType: string, funnelId: string) => {
    if (!user) return;

    try {
      setUpdating(true);
      // Get organization
      const { data: orgData } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .single();

      if (!orgData) return;

      // Get first stage of selected funnel
      const { data: stageData } = await supabase
        .from("funnel_stages")
        .select("id")
        .eq("funnel_id", funnelId)
        .order("position")
        .limit(1)
        .single();

      if (!stageData) {
        toast.error("Funil sem etapas configuradas");
        return;
      }

      // Check if mapping already exists
      const existingMapping = mappings.find(m => m.source_type === sourceType);

      if (existingMapping) {
        // Update existing mapping
        const { error } = await supabase
          .from("funnel_source_mappings")
          .update({
            funnel_id: funnelId,
            target_stage_id: stageData.id,
          })
          .eq("id", existingMapping.id);

        if (error) throw error;
      } else {
        // Create new mapping
        const { error } = await supabase
          .from("funnel_source_mappings")
          .insert({
            funnel_id: funnelId,
            source_type: sourceType,
            target_stage_id: stageData.id,
          });

        if (error) throw error;
      }

      toast.success("Mapeamento atualizado com sucesso");
      await loadData(true); // Pass true to indicate it's an update
    } catch (error) {
      console.error("Error updating mapping:", error);
      toast.error("Erro ao atualizar mapeamento");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">Carregando...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Direcionamento de Leads</CardTitle>
        <CardDescription>
          Configure para qual funil os leads de cada fonte devem ser direcionados automaticamente
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6" style={{ opacity: updating ? 0.6 : 1, transition: 'opacity 0.2s' }}>
        {/* WhatsApp */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Badge variant="outline" className="bg-green-50 dark:bg-green-950/20 text-green-600 border-green-200">
              <MessageSquare className="w-3 h-3 mr-1" />
              WhatsApp
            </Badge>
          </Label>
          <Select
            value={selectedWhatsAppFunnel}
            onValueChange={(value) => {
              setSelectedWhatsAppFunnel(value);
              handleSourceMappingChange("whatsapp", value);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione um funil" />
            </SelectTrigger>
            <SelectContent>
              {funnels.map((funnel) => (
                <SelectItem key={funnel.id} value={funnel.id}>
                  {funnel.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Facebook */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Badge variant="outline" className="bg-blue-50 dark:bg-blue-950/20 text-blue-600 border-blue-200">
              <Facebook className="w-3 h-3 mr-1" />
              Facebook Lead Ads
            </Badge>
          </Label>
          <Select
            value={selectedFacebookFunnel}
            onValueChange={(value) => {
              setSelectedFacebookFunnel(value);
              handleSourceMappingChange("facebook", value);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione um funil" />
            </SelectTrigger>
            <SelectContent>
              {funnels.map((funnel) => (
                <SelectItem key={funnel.id} value={funnel.id}>
                  {funnel.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Webhook */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Badge variant="outline" className="bg-purple-50 dark:bg-purple-950/20 text-purple-600 border-purple-200">
              <Globe className="w-3 h-3 mr-1" />
              URL Webhook
            </Badge>
          </Label>
          <Select
            value={selectedWebhookFunnel}
            onValueChange={(value) => {
              setSelectedWebhookFunnel(value);
              handleSourceMappingChange("webhook", value);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione um funil" />
            </SelectTrigger>
            <SelectContent>
              {funnels.map((funnel) => (
                <SelectItem key={funnel.id} value={funnel.id}>
                  {funnel.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          Os leads de cada fonte serão automaticamente adicionados à primeira etapa do funil selecionado
        </p>
      </CardContent>
    </Card>
  );
};
