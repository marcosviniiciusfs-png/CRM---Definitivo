import { memo } from "react";
import { Message } from "@/types/chat";
import { X, Image, Mic, File } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReplyPreviewProps {
  message: Message;
  leadName: string;
  onCancel: () => void;
}

export const ReplyPreview = memo(function ReplyPreview({
  message,
  leadName,
  onCancel,
}: ReplyPreviewProps) {
  const senderName = message.direcao === "ENTRADA" ? leadName : "Você";
  
  const getMessagePreview = () => {
    if (message.media_type === "audio") {
      return (
        <span className="flex items-center gap-1">
          <Mic className="h-3 w-3" />
          Mensagem de áudio
        </span>
      );
    }
    if (message.media_type === "image") {
      return (
        <span className="flex items-center gap-1">
          <Image className="h-3 w-3" />
          Foto
        </span>
      );
    }
    if (message.media_type === "document") {
      return (
        <span className="flex items-center gap-1">
          <File className="h-3 w-3" />
          Documento
        </span>
      );
    }
    return message.corpo_mensagem || "[Mídia]";
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-l-2 border-primary">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-primary">
          Respondendo a {senderName}
        </p>
        <p className="text-sm truncate text-muted-foreground">
          {getMessagePreview()}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 flex-shrink-0"
        onClick={onCancel}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
});