import { memo } from "react";
import { Lead } from "@/types/chat";
import { PresenceInfo } from "./types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Phone, Pin } from "lucide-react";
import { formatPhoneNumber } from "@/lib/utils";
import { LeadTagsBadge } from "@/components/LeadTagsBadge";

interface ChatLeadItemProps {
  lead: Lead;
  isSelected: boolean;
  isPinned: boolean;
  presenceStatus: PresenceInfo | undefined;
  tagVersion: string;
  onClick: () => void;
  onAvatarClick: (url: string, name: string) => void;
}

export const ChatLeadItem = memo(function ChatLeadItem({
  lead,
  isSelected,
  isPinned,
  presenceStatus,
  tagVersion,
  onClick,
  onAvatarClick,
}: ChatLeadItemProps) {
  const getInitials = (name: string) => {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const getAvatarUrl = () => {
    if (lead.avatar_url) return lead.avatar_url;
    const initials = getInitials(lead.nome_lead) || "NN";
    try {
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=random&color=fff&size=128`;
    } catch {
      return `https://ui-avatars.com/api/?name=NN&background=random&color=fff&size=128`;
    }
  };

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors ${
        isSelected ? "bg-muted" : ""
      }`}
    >
      <div className="relative">
        <Avatar
          className="cursor-pointer hover:opacity-80 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            if (lead.avatar_url) {
              onAvatarClick(lead.avatar_url, lead.nome_lead);
            }
          }}
        >
          <AvatarImage src={getAvatarUrl()} alt={lead.nome_lead} />
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
