import { memo } from "react";
import { Message, Lead } from "@/types/chat";
import { Pin, PinOff, ChevronDown } from "lucide-react";

interface PinnedMessagesBarProps {
  messages: Message[];
  pinnedMessageIds: Set<string>;
  selectedLead: Lead;
  showExpanded: boolean;
  onToggleExpanded: () => void;
  onUnpinMessage: (message: Message) => void;
  onScrollToMessage: (messageId: string) => void;
}

export const PinnedMessagesBar = memo(function PinnedMessagesBar({
  messages,
  pinnedMessageIds,
  selectedLead,
  showExpanded,
  onToggleExpanded,
  onUnpinMessage,
  onScrollToMessage,
}: PinnedMessagesBarProps) {
  const pinnedMessages = messages.filter((msg) => pinnedMessageIds.has(msg.id));

  if (pinnedMessages.length === 0) return null;

  const getMessagePreview = (message: Message) => {
    if (message.media_type === "image") return "🖼️ Imagem";
    if (message.media_type === "audio") return "🎵 Áudio";
    if (message.media_type === "document") return "📄 Documento";
    return message.corpo_mensagem;
  };

  return (
    <div className="sticky top-0 z-20 backdrop-blur-sm border-b border-border/50" style={{ backgroundColor: "#1f5f61" }}>
      {/* First pinned message (always visible) */}
      {pinnedMessages.slice(0, 1).map((message) => (
        <div
          key={message.id}
          className="flex items-center gap-2 px-4 py-2 cursor-pointer transition-colors group hover:bg-black/10"
          onClick={() => onScrollToMessage(message.id)}
        >
          <Pin className="h-3.5 w-3.5 text-white flex-shrink-0" />
          <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
            <span className="text-xs font-medium text-white/90 flex-shrink-0">
              {message.direcao === "ENTRADA" ? selectedLead.nome_lead : "Você"}:
            </span>
            <p className="text-xs text-white/70 truncate">{getMessagePreview(message)}</p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpanded();
            }}
            className="flex-shrink-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity text-white"
            title={showExpanded ? "Ocultar" : "Ver todas"}
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showExpanded ? "rotate-180" : ""}`} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUnpinMessage(message);
            }}
            className="flex-shrink-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10 rounded text-white"
            title="Desfixar"
          >
            <PinOff className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {/* Additional pinned messages (when expanded) */}
      {showExpanded && pinnedMessages.length > 1 && (
        <div className="border-t border-border/50" style={{ backgroundColor: "#1f5f61" }}>
          {pinnedMessages.slice(1, 3).map((message) => (
            <div
              key={message.id}
              className="flex items-center gap-2 px-4 py-1.5 cursor-pointer transition-colors group hover:bg-black/10"
              onClick={() => onScrollToMessage(message.id)}
            >
              <div className="w-3.5 flex-shrink-0" />
              <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
                <span className="text-xs font-medium text-white/80 flex-shrink-0">
                  {message.direcao === "ENTRADA" ? selectedLead.nome_lead : "Você"}:
                </span>
                <p className="text-xs text-white/60 truncate">{getMessagePreview(message)}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUnpinMessage(message);
                }}
                className="flex-shrink-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10 rounded text-white"
                title="Desfixar"
              >
                <PinOff className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
