import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Users, RefreshCw, AlertCircle, MessageSquareOff } from "lucide-react";
import { useContactGroups, ContactGroup } from "@/hooks/useContactGroups";
import { cn } from "@/lib/utils";

// Formata "Hoje 14:32" / "Ontem" / "DD/MM" / "DD/MM/YYYY" (padrao WhatsApp Web list).
function formatLastMessageTime(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }
    if (diffDays < 2) return "Ontem";
    if (diffDays < 7) {
      return d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
    }
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  } catch {
    return "";
  }
}

interface Props {
  instanceName: string | null;
  selectedGroupId: string | null;
  onSelectGroup: (group: ContactGroup) => void;
}

function GroupListPanelImpl({ instanceName, selectedGroupId, onSelectGroup }: Props) {
  const { groups, isLoading, isError, error, refetch } = useContactGroups({
    instanceName,
    phoneNumber: null, // sem filtro = todos os grupos do canal
  });

  if (!instanceName) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground gap-3">
        <MessageSquareOff className="h-10 w-10 opacity-50" />
        <p className="text-sm max-w-xs">
          Nenhum canal WhatsApp conectado nesta organização. Conecte um canal em Integrações.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background">
        <p className="text-[11px] text-muted-foreground">
          {isLoading ? "Carregando..." : `${groups.length} grupo${groups.length === 1 ? "" : "s"}`}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={refetch}
          disabled={isLoading}
          className="h-7 gap-1.5 text-[11px]"
        >
          <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="p-2 space-y-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-2.5 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && isError && (
          <div className="m-3 p-3 rounded-md border border-destructive/30 bg-destructive/5 flex gap-2">
            <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-medium text-destructive">Erro ao carregar grupos</p>
              <p className="text-muted-foreground mt-1 break-words">
                {error?.message || "Tente novamente"}
              </p>
            </div>
          </div>
        )}

        {!isLoading && !isError && groups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-3 px-4">
            <Users className="h-10 w-10 opacity-40" />
            <p className="text-sm max-w-xs">
              Este canal não participa de nenhum grupo no WhatsApp.
            </p>
          </div>
        )}

        {!isLoading && !isError && groups.length > 0 && (
          <div className="space-y-0.5 p-1">
            {groups.map((g) => {
              const isSelected = selectedGroupId === g.id;
              const hasActivity = !!g.lastMessageAt;
              const previewSender = g.lastMessageDirection === "SAIDA"
                ? "Você"
                : g.lastMessageSender || null;
              const previewText = g.lastMessagePreview
                ? (previewSender ? `${previewSender}: ${g.lastMessagePreview}` : g.lastMessagePreview)
                : `${g.size} membro${g.size === 1 ? "" : "s"}`;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => onSelectGroup(g)}
                  className={cn(
                    "w-full flex items-center gap-3 p-2.5 rounded-md text-left transition-colors",
                    isSelected ? "bg-accent" : "hover:bg-accent/50"
                  )}
                >
                  <Avatar className="h-10 w-10 flex-shrink-0">
                    {g.pictureUrl ? <AvatarImage src={g.pictureUrl} alt={g.subject} /> : null}
                    <AvatarFallback className="bg-muted">
                      <Users className="h-5 w-5 text-muted-foreground" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium truncate">{g.subject}</span>
                        {g.isSuperAdmin ? (
                          <Badge variant="default" className="text-[9px] h-4 px-1 bg-amber-500 hover:bg-amber-500/90 flex-shrink-0">Criador</Badge>
                        ) : g.isAdmin ? (
                          <Badge variant="default" className="text-[9px] h-4 px-1 flex-shrink-0">Admin</Badge>
                        ) : null}
                      </div>
                      {hasActivity && (
                        <span className="text-[10px] text-muted-foreground flex-shrink-0 tabular-nums">
                          {formatLastMessageTime(g.lastMessageAt)}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {previewText}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export const GroupListPanel = memo(GroupListPanelImpl);
