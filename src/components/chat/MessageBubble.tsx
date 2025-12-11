import { memo, useState } from "react";
import { Message, MessageReaction, Lead } from "@/types/chat";
import { LazyAvatar } from "@/components/ui/lazy-avatar";
import { SecureImage, SecureAudio, SecureDocument, SecureVideo } from "./SecureMediaDisplay";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, CheckCheck, Clock, ChevronDown, Pin, Copy, Star, Trash2, Smile, AlertCircle, RotateCcw, Reply, Mic, Image, File } from "lucide-react";
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
  onReply: (message: Message) => void;
  onScrollToMessage?: (messageId: string) => void;
  onDelete: () => void;
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
  onReply,
  onScrollToMessage,
  onDelete,
  messageRef,
}: MessageBubbleProps) {
  const { toast } = useToast();
  const [emojiPopoverOpen, setEmojiPopoverOpen] = useState(false);

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

  // Safe formatting using React JSX instead of dangerouslySetInnerHTML to prevent XSS
  const formatMessageBody = (body: string) => {
    const parts = body.split(/(\*[^*]+\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return <strong key={index}>{part.slice(1, -1)}</strong>;
      }
      return part;
    });
  };

  const groupedReactions = reactions.reduce((acc, reaction) => {
    if (!acc[reaction.emoji]) {
      acc[reaction.emoji] = [];
    }
    acc[reaction.emoji].push(reaction);
    return acc;
  }, {} as Record<string, MessageReaction[]>);

  // Emoji button component for reuse
  const EmojiButton = () => (
    <Popover open={emojiPopoverOpen} onOpenChange={setEmojiPopoverOpen}>
      <PopoverTrigger asChild>
        <button className="p-1 rounded-full hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground">
          <Smile className="h-5 w-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2 bg-background border z-[100]" side="top" align="center">
        <div className="flex gap-1">
          {WHATSAPP_REACTION_EMOJIS.map((emoji) => {
            const userReacted = reactions.some((r) => r.user_id === currentUserId && r.emoji === emoji);
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onToggleReaction(emoji);
                  setEmojiPopoverOpen(false);
                }}
                className={`text-2xl p-1.5 rounded-lg transition-colors hover:bg-accent/60 ${
                  userReacted ? "bg-accent" : ""
                }`}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );

  return (
    <div
      id={`message-${message.id}`}
      ref={messageRef}
      onDoubleClick={() => onReply(message)}
      className={`flex items-center gap-1 cursor-pointer select-none group ${message.direcao === "SAIDA" ? "justify-end" : "justify-start"} ${
        isPinned ? "relative" : ""
      }`}
    >
      {isPinned && (
        <div className="absolute -left-2 top-0 bottom-0 flex items-center">
          <div className="w-1 h-full bg-primary rounded-full"></div>
        </div>
      )}

      {message.direcao === "ENTRADA" && (
        <LazyAvatar
          src={lead.avatar_url}
          name={lead.nome_lead}
          size="sm"
          className="h-8 w-8 flex-shrink-0 self-start mt-1"
          onClick={() => {
            if (lead.avatar_url) {
              onAvatarClick(lead.avatar_url, lead.nome_lead);
            }
          }}
        />
      )}

      {/* Emoji button outside bubble - for outgoing messages (left side) */}
      {message.direcao === "SAIDA" && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity self-center">
          <EmojiButton />
        </div>
      )}

      <div
        className={`max-w-[70%] rounded-lg p-3 relative overflow-hidden break-words ${
          message.direcao === "SAIDA" ? "bg-chat-bubble text-chat-bubble-foreground" : "bg-muted"
        } ${isSearchMatch ? (isCurrentSearchResult ? "ring-2 ring-primary" : "ring-2 ring-yellow-400") : ""}`}
        style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}
      >
        {/* Dropdown menu inside bubble - z-10 para ficar acima das imagens */}
        <DropdownMenu open={dropdownOpen} onOpenChange={onToggleDropdown}>
          <DropdownMenuTrigger asChild>
            <button className="absolute top-2 right-2 z-10 bg-background/90 backdrop-blur-sm p-1.5 rounded-full hover:bg-background transition-colors opacity-0 group-hover:opacity-100 shadow-sm">
              <ChevronDown className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-background border z-[100]">
            <DropdownMenuItem
              onClick={() => {
                onReply(message);
                onToggleDropdown(false);
              }}
            >
              <Reply className="h-4 w-4 mr-2" />
              Responder
            </DropdownMenuItem>
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
            <DropdownMenuItem className="text-destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Apagar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Quoted message preview */}
        {message.quoted_message && (
          <div
            className="mb-2 p-2 rounded bg-background/50 border-l-2 border-primary/50 cursor-pointer hover:bg-background/70 transition-colors"
            onClick={() => onScrollToMessage?.(message.quoted_message_id || "")}
          >
            <p className="text-xs font-medium text-primary/70">
              {message.quoted_message.direcao === "ENTRADA" ? lead.nome_lead : "Você"}
            </p>
            <p className="text-xs truncate text-muted-foreground">
              {message.quoted_message.media_type === "audio" ? (
                <span className="flex items-center gap-1">
                  <Mic className="h-3 w-3" />
                  Mensagem de áudio
                </span>
              ) : message.quoted_message.media_type === "image" ? (
                <span className="flex items-center gap-1">
                  <Image className="h-3 w-3" />
                  Foto
                </span>
              ) : message.quoted_message.media_type === "document" ? (
                <span className="flex items-center gap-1">
                  <File className="h-3 w-3" />
                  Documento
                </span>
              ) : (
                message.quoted_message.corpo_mensagem || "[Mídia]"
              )}
            </p>
          </div>
        )}

        {/* Message content */}
        {message.media_type === "audio" ? (
          <SecureAudio
            mediaUrl={message.media_url}
            mimetype={message.media_metadata?.mimetype}
            duration={message.media_metadata?.seconds}
          />
        ) : message.media_type === "image" ? (
          <div className="space-y-2">
            <SecureImage mediaUrl={message.media_url} alt="Imagem enviada" />
            {message.corpo_mensagem && !message.corpo_mensagem.includes("[Imagem]") && message.corpo_mensagem !== "Imagem" && (
              <p className="text-sm whitespace-pre-wrap">{formatMessageBody(message.corpo_mensagem)}</p>
            )}
          </div>
        ) : message.media_type === "sticker" ? (
          <div className="w-32 h-32">
            <SecureImage 
              mediaUrl={message.media_url} 
              alt="Figurinha" 
              className="w-full h-full object-contain" 
            />
          </div>
        ) : message.media_type === "gif" ? (
          <SecureVideo 
            mediaUrl={message.media_url} 
            autoPlay 
            loop 
            muted 
            className="max-w-[280px]"
          />
        ) : message.media_type === "video" ? (
          <SecureVideo 
            mediaUrl={message.media_url} 
            className="max-w-[320px]"
          />
        ) : message.media_type === "document" ? (
          <SecureDocument
            mediaUrl={message.media_url}
            fileName={message.media_metadata?.fileName}
            fileSize={message.media_metadata?.fileSize}
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap break-words" style={{ overflowWrap: 'break-word' }}>{formatMessageBody(message.corpo_mensagem)}</p>
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

      {/* Emoji button outside bubble - for incoming messages (right side) */}
      {message.direcao === "ENTRADA" && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity self-center">
          <EmojiButton />
        </div>
      )}
    </div>
  );
});
