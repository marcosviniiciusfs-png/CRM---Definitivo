import { memo } from "react";
import { Message, MessageReaction, Lead } from "@/types/chat";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AudioPlayer } from "@/components/AudioPlayer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, CheckCheck, Clock, ChevronDown, Pin, Copy, Star, Trash2, Smile, AlertCircle, RotateCcw, Download, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MessageBubbleProps {
  message: Message;
  lead: Lead;
  isPinned: boolean;
  reactions: MessageReaction[];
  currentUserId: string | undefined;
  isSearchMatch: boolean;
  isCurrentSearchResult: boolean;
  dropdownOpen: boolean;
  reactionPopoverOpen: boolean;
  onToggleDropdown: (open: boolean) => void;
  onToggleReactionPopover: () => void;
  onToggleReaction: (emoji: string) => void;
  onTogglePin: () => void;
  onRetry?: () => void;
  onAvatarClick: (url: string, name: string) => void;
  messageRef?: (el: HTMLDivElement | null) => void;
}

const WHATSAPP_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export const MessageBubble = memo(function MessageBubble({
  message,
  lead,
  isPinned,
  reactions,
  currentUserId,
  isSearchMatch,
  isCurrentSearchResult,
  dropdownOpen,
  reactionPopoverOpen,
  onToggleDropdown,
  onToggleReactionPopover,
  onToggleReaction,
  onTogglePin,
  onRetry,
  onAvatarClick,
  messageRef,
}: MessageBubbleProps) {
  const { toast } = useToast();

  const getInitials = (name: string) => {
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const getAvatarUrl = () => {
    if (lead.avatar_url) return lead.avatar_url;
    const initials = getInitials(lead.nome_lead) || "NN";
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=random&color=fff&size=128`;
  };

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case "SENT":
        return <Check className="h-3 w-3" />;
      case "DELIVERED":
        return <CheckCheck className="h-3 w-3" />;
      case "READ":
        return <CheckCheck className="h-3 w-3 text-primary" />;
      default:
        return <Clock className="h-3 w-3" />;
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const formatMessageBody = (body: string) => {
    return body.replace(/\*([^*]+)\*/g, "<strong>$1</strong>");
  };

  const groupedReactions = reactions.reduce((acc, reaction) => {
    if (!acc[reaction.emoji]) {
      acc[reaction.emoji] = [];
    }
    acc[reaction.emoji].push(reaction);
    return acc;
  }, {} as Record<string, MessageReaction[]>);

  return (
    <div
      id={`message-${message.id}`}
      ref={messageRef}
      className={`flex gap-2 ${message.direcao === "SAIDA" ? "justify-end" : "justify-start"} ${
        isPinned ? "relative" : ""
      }`}
    >
      {isPinned && (
        <div className="absolute -left-2 top-0 bottom-0 flex items-center">
          <div className="w-1 h-full bg-primary rounded-full"></div>
        </div>
      )}

      {message.direcao === "ENTRADA" && (
        <Avatar
          className="h-8 w-8 flex-shrink-0 mt-1 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => {
            if (lead.avatar_url) {
              onAvatarClick(lead.avatar_url, lead.nome_lead);
            }
          }}
        >
          <AvatarImage src={getAvatarUrl()} alt={lead.nome_lead} />
          <AvatarFallback className="bg-primary/10 text-primary text-xs">
            {getInitials(lead.nome_lead)}
          </AvatarFallback>
        </Avatar>
      )}

      <div
        className={`max-w-[70%] rounded-lg p-3 relative group ${
          message.direcao === "SAIDA" ? "bg-chat-bubble text-chat-bubble-foreground" : "bg-muted"
        } ${isSearchMatch ? (isCurrentSearchResult ? "ring-2 ring-primary" : "ring-2 ring-yellow-400") : ""}`}
      >
        {/* Dropdown menu */}
        <DropdownMenu open={dropdownOpen} onOpenChange={onToggleDropdown}>
          <DropdownMenuTrigger asChild>
            <button className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm p-1.5 rounded-full hover:bg-background transition-colors opacity-0 group-hover:opacity-100">
              <ChevronDown className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-background border z-[100]">
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                onToggleReactionPopover();
              }}
            >
              <Smile className="h-4 w-4 mr-2" />
              Reagir
            </DropdownMenuItem>

            {reactionPopoverOpen && (
              <div className="px-2 pb-2 pt-1 border-t flex gap-1 flex-wrap">
                {WHATSAPP_REACTION_EMOJIS.map((emoji) => {
                  const userReacted = reactions.some((r) => r.user_id === currentUserId && r.emoji === emoji);
                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => onToggleReaction(emoji)}
                      className={`text-2xl p-1.5 rounded-lg transition-colors hover:bg-accent/60 ${
                        userReacted ? "bg-accent" : ""
                      }`}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            )}

            <DropdownMenuItem
              onClick={() => {
                navigator.clipboard.writeText(message.corpo_mensagem || message.media_url || "");
                toast({ title: "Copiado!" });
              }}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copiar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onTogglePin}>
              <Pin className="h-4 w-4 mr-2" />
              {isPinned ? "Desfixar" : "Fixar"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => toast({ title: "Em breve", description: "Funcionalidade em desenvolvimento" })}>
              <Star className="h-4 w-4 mr-2" />
              Favoritar
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => toast({ title: "Em breve", description: "Funcionalidade em desenvolvimento" })}>
              <Trash2 className="h-4 w-4 mr-2" />
              Apagar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Message content */}
        {message.media_type === "audio" ? (
          message.media_url ? (
            <AudioPlayer
              audioUrl={message.media_url}
              mimetype={message.media_metadata?.mimetype}
              duration={message.media_metadata?.seconds}
            />
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <span className="opacity-70">🎵 Áudio</span>
              <span className="text-xs opacity-50 italic">- Mídia indisponível</span>
            </div>
          )
        ) : message.media_type === "image" ? (
          message.media_url ? (
            <div className="space-y-2">
              <img
                src={message.media_url}
                alt="Imagem enviada"
                className="rounded-lg max-w-full max-h-96 object-contain"
                loading="lazy"
              />
              {message.corpo_mensagem && !message.corpo_mensagem.includes("[Imagem]") && message.corpo_mensagem !== "Imagem" && (
                <p className="text-sm whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: formatMessageBody(message.corpo_mensagem) }} />
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm opacity-70">🖼️ Imagem indisponível</div>
          )
        ) : message.media_type === "document" ? (
          <div className="flex items-center gap-3 p-2 bg-background/50 rounded-lg">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{message.media_metadata?.fileName || "Documento"}</p>
              {message.media_metadata?.fileSize && (
                <p className="text-xs text-muted-foreground">{(message.media_metadata.fileSize / 1024).toFixed(1)} KB</p>
              )}
            </div>
            {message.media_url && (
              <a href={message.media_url} target="_blank" rel="noopener noreferrer" className="p-2 hover:bg-muted rounded-lg transition-colors">
                <Download className="h-4 w-4" />
              </a>
            )}
          </div>
        ) : (
          <p className="text-sm whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: formatMessageBody(message.corpo_mensagem) }} />
        )}

        {/* Timestamp and status */}
        <div className={`flex items-center gap-1 mt-1 ${message.direcao === "SAIDA" ? "justify-end" : "justify-start"}`}>
          <span className="text-xs opacity-70">{formatTime(message.data_hora)}</span>
          {message.direcao === "SAIDA" && (
            message.sendError ? (
              <div className="flex items-center gap-1">
                <AlertCircle className="h-3 w-3 text-destructive" />
                {onRetry && (
                  <button onClick={onRetry} className="text-xs text-primary hover:underline flex items-center gap-0.5">
                    <RotateCcw className="h-3 w-3" />
                  </button>
                )}
              </div>
            ) : message.isOptimistic ? (
              <Clock className="h-3 w-3 animate-pulse" />
            ) : (
              getStatusIcon(message.status_entrega)
            )
          )}
        </div>

        {/* Reactions */}
        {Object.keys(groupedReactions).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2 -mb-1">
            {Object.entries(groupedReactions).map(([emoji, reactionList]) => (
              <button
                key={emoji}
                onClick={() => onToggleReaction(emoji)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors ${
                  reactionList.some((r) => r.user_id === currentUserId) ? "bg-primary/20" : "bg-muted hover:bg-muted/80"
                }`}
              >
                <span>{emoji}</span>
                <span>{reactionList.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
