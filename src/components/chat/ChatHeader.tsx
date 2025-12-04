import { memo } from "react";
import { Lead } from "@/types/chat";
import { PresenceInfo } from "./types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Phone, Search, RefreshCw, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { formatPhoneNumber } from "@/lib/utils";

interface ChatHeaderProps {
  lead: Lead;
  presenceStatus: PresenceInfo | undefined;
  onRefreshPresence: () => void;
  isLoadingPresence: boolean;
  messageSearchQuery: string;
  setMessageSearchQuery: (query: string) => void;
  messageSearchExpanded: boolean;
  setMessageSearchExpanded: (expanded: boolean) => void;
  totalSearchResults: number;
  currentSearchResultIndex: number;
  onNextResult: () => void;
  onPreviousResult: () => void;
  onAvatarClick: (url: string, name: string) => void;
}

export const ChatHeader = memo(function ChatHeader({
  lead,
  presenceStatus,
  onRefreshPresence,
  isLoadingPresence,
  messageSearchQuery,
  setMessageSearchQuery,
  messageSearchExpanded,
  setMessageSearchExpanded,
  totalSearchResults,
  currentSearchResultIndex,
  onNextResult,
  onPreviousResult,
  onAvatarClick,
}: ChatHeaderProps) {
  const getInitials = (name: string) => {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const getAvatarUrl = (lead: Lead) => {
    if (lead.avatar_url) return lead.avatar_url;
    const initials = getInitials(lead.nome_lead) || "NN";
    try {
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=random&color=fff&size=128`;
    } catch {
      return `https://ui-avatars.com/api/?name=NN&background=random&color=fff&size=128`;
    }
  };

  return (
    <div className="p-4 border-b flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Avatar
            className="cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => {
              if (lead.avatar_url) {
                onAvatarClick(lead.avatar_url, lead.nome_lead);
              }
            }}
          >
            <AvatarImage src={getAvatarUrl(lead)} alt={lead.nome_lead} />
            <AvatarFallback className="bg-primary/10 text-primary">
              {getInitials(lead.nome_lead)}
            </AvatarFallback>
          </Avatar>
          <div
            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background ${
              presenceStatus?.isOnline
                ? "bg-green-500 animate-pulse shadow-lg shadow-green-500/50"
                : presenceStatus?.lastSeen
                ? "bg-orange-400"
                : presenceStatus
                ? "bg-gray-400"
                : "bg-gray-500 opacity-30"
            }`}
            title={
              presenceStatus?.isOnline
                ? "🟢 Online agora"
                : presenceStatus?.lastSeen
                ? `🟠 Visto: ${new Date(presenceStatus.lastSeen).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : presenceStatus
                ? "⚪ Offline"
                : "⚫ Status desconhecido"
            }
          />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{lead.nome_lead}</h3>
            {presenceStatus?.isOnline && (
              <span className="text-xs text-green-600 dark:text-green-400 font-medium bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                Online
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {formatPhoneNumber(lead.telefone_lead)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefreshPresence}
          disabled={isLoadingPresence}
          title="Atualizar status"
        >
          {isLoadingPresence ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMessageSearchExpanded(!messageSearchExpanded)}
          >
            <Search className="h-4 w-4" />
          </Button>
          {messageSearchExpanded && (
            <div className="flex items-center gap-1">
              <Input
                placeholder="Buscar na conversa..."
                value={messageSearchQuery}
                onChange={(e) => setMessageSearchQuery(e.target.value)}
                className="w-48 h-8"
              />
              {totalSearchResults > 0 && (
                <>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {currentSearchResultIndex + 1}/{totalSearchResults}
                  </span>
                  <Button variant="ghost" size="sm" onClick={onPreviousResult} disabled={currentSearchResultIndex === 0}>
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={onNextResult} disabled={currentSearchResultIndex >= totalSearchResults - 1}>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
