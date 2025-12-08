import { memo } from "react";
import { Lead } from "@/types/chat";
import { PresenceInfo } from "./types";
import { LazyAvatar } from "@/components/ui/lazy-avatar";
import { Phone, Pin } from "lucide-react";
import { formatPhoneNumber } from "@/lib/utils";
import { LeadTagsBadge } from "@/components/LeadTagsBadge";

interface ChatLeadItemProps {
  lead: Lead;
  isSelected: boolean;
  isPinned: boolean;
  isLocked?: boolean;
  presenceStatus: PresenceInfo | undefined;
  tagVersion: string;
  onClick: () => void;
  onAvatarClick: (url: string, name: string) => void;
}

export const ChatLeadItem = memo(function ChatLeadItem({
  lead,
  isSelected,
  isPinned,
  isLocked,
  presenceStatus,
  tagVersion,
  onClick,
  onAvatarClick,
}: ChatLeadItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors ${
        isSelected ? "bg-muted" : ""
      } ${isLocked ? "ring-1 ring-primary/30 ring-offset-1 ring-offset-background" : ""}`}
    >
      <div className="relative">
        <LazyAvatar
          src={lead.avatar_url}
          name={lead.nome_lead}
          size="md"
          className="h-10 w-10"
          onClick={(e) => {
            e.stopPropagation();
            if (lead.avatar_url) {
              onAvatarClick(lead.avatar_url, lead.nome_lead);
            }
          }}
        />
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
      <div className="flex-1 text-left overflow-hidden min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 w-full">
          {isPinned && <Pin className="h-3 w-3 text-primary fill-primary flex-shrink-0" />}
          <p className="font-medium truncate min-w-0 max-w-[45%]">{lead.nome_lead}</p>
          {presenceStatus?.isOnline && (
            <span className="text-xs text-green-600 dark:text-green-400 font-medium flex-shrink-0 whitespace-nowrap">
              Online
            </span>
          )}
          <div className="flex-shrink-0 flex gap-1">
            <LeadTagsBadge leadId={lead.id} version={tagVersion} />
          </div>
        </div>
        <p className="text-sm text-muted-foreground flex items-center gap-1 truncate">
          <Phone className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{formatPhoneNumber(lead.telefone_lead)}</span>
        </p>
      </div>
    </button>
  );
});
