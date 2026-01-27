import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link2, Eye, Settings, Trash2, Activity, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface WebhookStats {
  total: number;
  won: number;
  lost: number;
}

interface WebhookCardProps {
  webhook: {
    id: string;
    webhook_token: string;
    is_active: boolean;
    name: string | null;
    tag_id: string | null;
    default_responsible_user_id: string | null;
  };
  tagName: string;
  stageName?: string;
  responsibleName?: string;
  stats: WebhookStats;
  onEdit: () => void;
  onDelete: () => void;
}

export const WebhookCard = ({
  webhook,
  tagName,
  stageName,
  responsibleName,
  stats,
  onEdit,
  onDelete,
}: WebhookCardProps) => {
  const [copied, setCopied] = useState(false);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/form-webhook/${webhook.webhook_token}`;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success("URL copiada para a área de transferência!");
    setTimeout(() => setCopied(false), 2000);
  };

  const displayName = webhook.name || tagName || "Webhook";

  return (
    <Card className="border hover:shadow-md transition-shadow">
      {/* Header com nome e status */}
      <div className="flex items-start justify-between p-4 pb-2">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Link2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg uppercase">{displayName}</h3>
            <Badge variant="outline" className="text-xs mt-1">
              <Link2 className="h-3 w-3 mr-1" />
              Receber Webhook
            </Badge>
          </div>
        </div>
        <Badge 
          variant={webhook.is_active ? "default" : "secondary"}
          className={webhook.is_active 
            ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400 border-green-200 dark:border-green-800" 
            : ""
          }
        >
          {webhook.is_active ? "Ativa" : "Inativa"}
        </Badge>
      </div>

      {/* Informações */}
      <CardContent className="pt-3 space-y-2 text-sm">
        <div>
          <span className="text-muted-foreground">Etapa Padrão:</span>{" "}
          <span className="font-medium">{stageName || "NOVO LEAD"}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Responsável:</span>{" "}
          <span className="font-medium">{responsibleName || "Distribuição Automática"}</span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-muted-foreground">Tags:</span>
          {tagName ? (
            <Badge 
              variant="secondary" 
              className="text-xs bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400"
            >
              {tagName}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground italic">Nenhuma</span>
          )}
        </div>

        {/* Estatísticas */}
        <div className="flex items-center gap-3 pt-2 flex-wrap">
          <span className="text-muted-foreground text-xs flex items-center gap-1">
            <Activity className="h-3 w-3" />
            Total: {stats.total}
          </span>
          <Badge 
            variant="outline" 
            className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800"
          >
            ✓ {stats.won}
          </Badge>
          <Badge 
            variant="outline" 
            className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800"
          >
            ✕ {stats.lost}
          </Badge>
        </div>
      </CardContent>

      {/* Footer com ações */}
      <div className="flex items-center justify-between px-4 py-3 border-t">
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleCopyUrl}
            title="Copiar URL do Webhook"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onEdit}
            title="Configurar Webhook"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-destructive hover:text-destructive" 
          onClick={onDelete}
          title="Excluir Webhook"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
};
