import { memo, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, Mic, Paperclip, Square, Loader2 } from "lucide-react";
import { Message } from "@/types/chat";
import { ReplyPreview } from "./ReplyPreview";

interface ChatInputProps {
  newMessage: string;
  setNewMessage: (message: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  sending: boolean;
  sendingFile: boolean;
  sendingAudio: boolean;
  isRecording: boolean;
  recordingTime: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  disabled?: boolean;
  replyingTo?: Message | null;
  onCancelReply?: () => void;
  leadName?: string;
}

export const ChatInput = memo(function ChatInput({
  newMessage,
  setNewMessage,
  onSendMessage,
  sending,
  sendingFile,
  sendingAudio,
  isRecording,
  recordingTime,
  onStartRecording,
  onStopRecording,
  onFileSelect,
  inputRef,
  disabled = false,
  replyingTo,
  onCancelReply,
  leadName = "",
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatRecordingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSendMessage(e as unknown as React.FormEvent);
    }
  };

  return (
    <form onSubmit={onSendMessage} className="border-t">
      {/* Reply preview */}
      {replyingTo && onCancelReply && (
        <ReplyPreview
          message={replyingTo}
          leadName={leadName}
          onCancel={onCancelReply}
        />
      )}
      <div className="p-4 flex gap-2 items-end">
        {/* File attachment button */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={(e) => {
            onFileSelect(e);
            // Reset input to allow selecting the same file again
            if (fileInputRef.current) {
              fileInputRef.current.value = "";
            }
          }}
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
          className="hidden"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || sendingFile || isRecording}
          className="flex-shrink-0"
        >
          {sendingFile ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Paperclip className="h-5 w-5" />
          )}
        </Button>

        {/* Message input */}
        <div className="flex-1 relative min-w-0 overflow-hidden">
          {isRecording ? (
            <div className="flex items-center justify-between bg-destructive/10 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-destructive rounded-full animate-pulse" />
                <span className="text-sm font-medium">Gravando...</span>
                <span className="text-sm text-muted-foreground">
                  {formatRecordingTime(recordingTime)}
                </span>
              </div>
            </div>
          ) : (
            <Textarea
              ref={inputRef}
              placeholder="Digite sua mensagem..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              className="min-h-[44px] max-h-32 resize-none pr-12 w-full"
              rows={1}
            />
          )}
        </div>

        {/* Audio recording button */}
        {!newMessage.trim() && !isRecording && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onStartRecording}
            disabled={disabled || sendingAudio}
            className="flex-shrink-0"
          >
            {sendingAudio ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </Button>
        )}

        {/* Stop recording button */}
        {isRecording && (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={onStopRecording}
            className="flex-shrink-0"
          >
            <Square className="h-5 w-5" />
          </Button>
        )}

        {/* Send button */}
        {(newMessage.trim() || (!isRecording && !sendingAudio)) && !isRecording && (
          <Button
            type="submit"
            disabled={disabled || sending || !newMessage.trim()}
            className="flex-shrink-0"
          >
            {sending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </Button>
        )}
      </div>
    </form>
  );
});
