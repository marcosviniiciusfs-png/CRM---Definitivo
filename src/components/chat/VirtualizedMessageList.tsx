import { memo, useRef, useEffect } from "react";
import { Message, MessageReaction, Lead } from "@/types/chat";
import { MessageBubble } from "./MessageBubble";
import { TransferDivider } from "./TransferDivider";

interface VirtualizedMessageListProps {
  messages: Message[];
  selectedLead: Lead;
  pinnedMessages: Set<string>;
  messageReactions: Map<string, MessageReaction[]>;
  currentUserId: string | undefined;
  searchQuery: string;
  searchResults: Message[];
  currentSearchResultIndex: number;
  dropdownOpenStates: Map<string, boolean>;
  reactionPopoverOpen: string | null;
  onTogglePin: (messageId: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  setDropdownOpenStates: React.Dispatch<React.SetStateAction<Map<string, boolean>>>;
  setReactionPopoverOpen: React.Dispatch<React.SetStateAction<string | null>>;
  searchResultRefs: React.MutableRefObject<Map<number, HTMLDivElement | null>>;
  onAvatarClick: (url: string, name: string) => void;
  onReply: (message: Message) => void;
  onScrollToMessage?: (messageId: string) => void;
  onDelete: (message: Message) => void;
  // Read-only prefix: mensagens historicas do canal de origem quando a
  // membership atual eh 'transferred'. Renderizadas nao-interativamente
  // antes do divider. Bounded por limit(200) no caller.
  preTransferMessages?: Message[];
  transferDivider?: {
    transferred_at: string;
    transferred_by_name: string | null;
    from_channel_name: string;
  } | null;
}

const MemoizedMessage = memo(function MemoizedMessage({
  message,
  selectedLead,
  pinnedMessages,
  messageReactions,
  currentUserId,
  searchResults,
  currentSearchResultIndex,
  dropdownOpenStates,
  reactionPopoverOpen,
  onTogglePin,
  onToggleReaction,
  setDropdownOpenStates,
  setReactionPopoverOpen,
  searchResultRefs,
  onAvatarClick,
  onReply,
  onScrollToMessage,
  onDelete,
}: {
  message: Message;
  selectedLead: Lead;
  pinnedMessages: Set<string>;
  messageReactions: Map<string, MessageReaction[]>;
  currentUserId: string | undefined;
  searchResults: Message[];
  currentSearchResultIndex: number;
  dropdownOpenStates: Map<string, boolean>;
  reactionPopoverOpen: string | null;
  onTogglePin: (messageId: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  setDropdownOpenStates: React.Dispatch<React.SetStateAction<Map<string, boolean>>>;
  setReactionPopoverOpen: React.Dispatch<React.SetStateAction<string | null>>;
  searchResultRefs: React.MutableRefObject<Map<number, HTMLDivElement | null>>;
  onAvatarClick: (url: string, name: string) => void;
  onReply: (message: Message) => void;
  onScrollToMessage?: (messageId: string) => void;
  onDelete: (message: Message) => void;
}) {
  const searchResultIndex = searchResults.findIndex((r) => r.id === message.id);
  const isSearchMatch = searchResultIndex !== -1;
  const isCurrentSearchResult = isSearchMatch && searchResultIndex === currentSearchResultIndex;

  return (
    <div id={`message-${message.id}`}>
      <MessageBubble
        message={message}
        lead={selectedLead}
        isPinned={pinnedMessages.has(message.id)}
        reactions={messageReactions.get(message.id) || []}
        currentUserId={currentUserId}
        isSearchMatch={isSearchMatch}
        isCurrentSearchResult={isCurrentSearchResult}
        dropdownOpen={dropdownOpenStates.get(message.id) || false}
        reactionPopoverOpen={reactionPopoverOpen === message.id}
        onToggleDropdown={(open) =>
          setDropdownOpenStates((prev) => new Map(prev).set(message.id, open))
        }
        onToggleReactionPopover={() =>
          setReactionPopoverOpen(reactionPopoverOpen === message.id ? null : message.id)
        }
        onToggleReaction={(emoji) => onToggleReaction(message.id, emoji)}
        onTogglePin={() => onTogglePin(message.id)}
        onAvatarClick={onAvatarClick}
        onReply={onReply}
        onScrollToMessage={onScrollToMessage}
        onDelete={() => onDelete(message)}
        messageRef={
          searchResultIndex !== -1
            ? (el) => searchResultRefs.current.set(searchResultIndex, el)
            : undefined
        }
      />
    </div>
  );
});

export const VirtualizedMessageList = memo(function VirtualizedMessageList({
  messages,
  selectedLead,
  pinnedMessages,
  messageReactions,
  currentUserId,
  searchQuery,
  searchResults,
  currentSearchResultIndex,
  dropdownOpenStates,
  reactionPopoverOpen,
  onTogglePin,
  onToggleReaction,
  setDropdownOpenStates,
  setReactionPopoverOpen,
  searchResultRefs,
  onAvatarClick,
  onReply,
  onScrollToMessage,
  onDelete,
  preTransferMessages,
  transferDivider,
}: VirtualizedMessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages.length, preTransferMessages?.length]);

  const hasReadOnlyPrefix = !!preTransferMessages && preTransferMessages.length > 0;

  return (
    <div ref={containerRef} className="space-y-1 px-2 overflow-y-auto h-full scroll-smooth">
      {hasReadOnlyPrefix && (
        <div className="bg-muted/30 -mx-2 px-2 py-2 mb-2 rounded">
          <div className="px-2 py-1 text-xs text-muted-foreground italic">
            📋 Histórico do canal anterior (somente leitura)
          </div>
          {preTransferMessages!.map((m) => (
            <div key={`pre-${m.id}`} className="opacity-70 pointer-events-none select-none">
              <MessageBubble
                message={m}
                lead={selectedLead}
                isPinned={false}
                reactions={[]}
                currentUserId={currentUserId}
                isSearchMatch={false}
                isCurrentSearchResult={false}
                dropdownOpen={false}
                reactionPopoverOpen={false}
                onToggleDropdown={() => {}}
                onToggleReactionPopover={() => {}}
                onToggleReaction={() => {}}
                onTogglePin={() => {}}
                onAvatarClick={onAvatarClick}
                onReply={() => {}}
                onScrollToMessage={onScrollToMessage}
                onDelete={() => {}}
              />
            </div>
          ))}
        </div>
      )}

      {transferDivider && (
        <TransferDivider
          transferredAt={transferDivider.transferred_at}
          transferredByName={transferDivider.transferred_by_name}
          fromChannelName={transferDivider.from_channel_name}
        />
      )}

      {messages.map((message) => (
        <MemoizedMessage
          key={message.id}
          message={message}
          selectedLead={selectedLead}
          pinnedMessages={pinnedMessages}
          messageReactions={messageReactions}
          currentUserId={currentUserId}
          searchResults={searchResults}
          currentSearchResultIndex={currentSearchResultIndex}
          dropdownOpenStates={dropdownOpenStates}
          reactionPopoverOpen={reactionPopoverOpen}
          onTogglePin={onTogglePin}
          onToggleReaction={onToggleReaction}
          setDropdownOpenStates={setDropdownOpenStates}
          setReactionPopoverOpen={setReactionPopoverOpen}
          searchResultRefs={searchResultRefs}
          onAvatarClick={onAvatarClick}
          onReply={onReply}
          onScrollToMessage={onScrollToMessage}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
});
