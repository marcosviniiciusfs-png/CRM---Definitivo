import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link2, Plus, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { WebhookCard } from "./WebhookCard";
import { CreateWebhookModal } from "./CreateWebhookModal";
import { WebhookConfigModal } from "./WebhookConfigModal";
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

interface WebhookConfig {
  id: string;
  webhook_token: string;
  is_active: boolean;
  name: string | null;
  tag_id: string | null;
  default_responsible_user_id: string | null;
}

interface WebhookWithMeta extends WebhookConfig {
  tagName: string;
  stats: { total: number; won: number; lost: number };
}

interface WebhookIntegrationsTabProps {
  organizationId: string;
}

export const WebhookIntegrationsTab = ({ organizationId }: WebhookIntegrationsTabProps) => {
  const [webhooks, setWebhooks] = useState<WebhookWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookWithMeta | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadWebhooks = useCallback(async () => {
    try {
      setLoading(true);

      // Buscar webhooks da organização
      const { data: webhooksData, error: webhooksError } = await supabase
        .from("webhook_configs")
        .select("id, webhook_token, is_active, name, tag_id, default_responsible_user_id")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (webhooksError) throw webhooksError;

      if (!webhooksData || webhooksData.length === 0) {
        setWebhooks([]);
        return;
      }

      // Buscar tags associadas
      const tagIds = webhooksData.filter((w) => w.tag_id).map((w) => w.tag_id);
      let tagsMap: Record<string, string> = {};

      if (tagIds.length > 0) {
        const { data: tagsData } = await supabase
          .from("lead_tags")
          .select("id, name")
          .in("id", tagIds);

        if (tagsData) {
          tagsMap = tagsData.reduce((acc, tag) => {
            acc[tag.id] = tag.name;
            return acc;
          }, {} as Record<string, string>);
        }
      }

      // Carregar estatísticas para cada webhook
      const webhooksWithMeta: WebhookWithMeta[] = await Promise.all(
        webhooksData.map(async (webhook) => {
          const tagName = webhook.tag_id ? tagsMap[webhook.tag_id] || "" : "";
          let stats = { total: 0, won: 0, lost: 0 };

          if (webhook.tag_id) {
            // Total de leads com a tag
            const { count: total } = await supabase
              .from("lead_tag_assignments")
              .select("*", { count: "exact", head: true })
              .eq("tag_id", webhook.tag_id);

            stats.total = total || 0;

            // Para won/lost, precisamos fazer join com leads e funnel_stages
            const { data: leadsWithTag } = await supabase
              .from("lead_tag_assignments")
              .select("lead_id")
              .eq("tag_id", webhook.tag_id);

            if (leadsWithTag && leadsWithTag.length > 0) {
              const leadIds = leadsWithTag.map((l) => l.lead_id);

              // Buscar leads com seus stages
              const { data: leadsData } = await supabase
                .from("leads")
                .select("id, funnel_stage_id")
                .in("id", leadIds);

              if (leadsData) {
                const stageIds = leadsData
                  .filter((l) => l.funnel_stage_id)
                  .map((l) => l.funnel_stage_id);

                if (stageIds.length > 0) {
                  const { data: stagesData } = await supabase
                    .from("funnel_stages")
                    .select("id, stage_type")
                    .in("id", stageIds);

                  if (stagesData) {
                    const stageTypeMap = stagesData.reduce((acc, s) => {
                      acc[s.id] = s.stage_type;
                      return acc;
                    }, {} as Record<string, string>);

                    leadsData.forEach((lead) => {
                      if (lead.funnel_stage_id) {
                        const stageType = stageTypeMap[lead.funnel_stage_id];
                        if (stageType === "won") stats.won++;
                        else if (stageType === "lost") stats.lost++;
                      }
                    });
                  }
                }
              }
            }
          }

          return {
            ...webhook,
            tagName,
            stats,
          };
        })
      );

      setWebhooks(webhooksWithMeta);
    } catch (error) {
      console.error("Erro ao carregar webhooks:", error);
      toast.error("Erro ao carregar webhooks");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadWebhooks();
  }, [loadWebhooks]);

  const handleEdit = (webhook: WebhookWithMeta) => {
    setSelectedWebhook(webhook);
    setConfigModalOpen(true);
  };

  const handleDeleteClick = (webhook: WebhookWithMeta) => {
    setSelectedWebhook(webhook);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedWebhook) return;

    setDeleting(true);
    try {
      // Deletar o webhook
      const { error } = await supabase
        .from("webhook_configs")
        .delete()
        .eq("id", selectedWebhook.id);

      if (error) throw error;

      // Opcionalmente deletar a tag também
      if (selectedWebhook.tag_id) {
        await supabase.from("lead_tags").delete().eq("id", selectedWebhook.tag_id);
      }

      toast.success("Webhook excluído com sucesso!");
      setDeleteDialogOpen(false);
      loadWebhooks();
    } catch (error) {
      console.error("Erro ao excluir webhook:", error);
      toast.error("Erro ao excluir webhook");
    } finally {
      setDeleting(false);
    }
  };

  const activeCount = webhooks.filter((w) => w.is_active).length;

  return (
    <div className="space-y-6">
      {/* Header com contadores */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Link2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  Integrações
                  <Badge variant="secondary">{webhooks.length}</Badge>
                </CardTitle>
                <CardDescription>
                  Webhooks para receber leads de formulários externos
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="flex items-center gap-1">
                <Zap className="h-3 w-3 text-green-500" />
                Ativas ({activeCount})
              </Badge>
              <Button onClick={() => setCreateModalOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Webhook
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Lista de webhooks */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-6 w-32 mb-3" />
              <Skeleton className="h-4 w-24 mb-4" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-3/4" />
            </Card>
          ))}
        </div>
      ) : webhooks.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="p-3 bg-muted rounded-full">
              <Link2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-medium">Nenhum webhook configurado</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Crie um webhook para receber leads de formulários externos automaticamente
              </p>
            </div>
            <Button onClick={() => setCreateModalOpen(true)} className="mt-2">
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeiro Webhook
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {webhooks.map((webhook) => (
            <WebhookCard
              key={webhook.id}
              webhook={webhook}
              tagName={webhook.tagName}
              stats={webhook.stats}
              onEdit={() => handleEdit(webhook)}
              onDelete={() => handleDeleteClick(webhook)}
            />
          ))}
        </div>
      )}

      {/* Modais */}
      <CreateWebhookModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        organizationId={organizationId}
        onCreated={loadWebhooks}
      />

      <WebhookConfigModal
        open={configModalOpen}
        onOpenChange={setConfigModalOpen}
        webhook={selectedWebhook}
        tagName={selectedWebhook?.tagName || ""}
        organizationId={organizationId}
        onUpdated={loadWebhooks}
      />

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Webhook?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O webhook "{selectedWebhook?.name || selectedWebhook?.tagName}" 
              será excluído permanentemente e não receberá mais leads.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
