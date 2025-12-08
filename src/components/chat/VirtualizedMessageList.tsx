import { memo, useRef, useEffect } from "react";
import { Message, MessageReaction, Lead } from "@/types/chat";
import { MessageBubble } from "./MessageBubble";

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
}: VirtualizedMessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages.length]);

  return (
    <div ref={containerRef} className="space-y-1 px-2 overflow-auto h-full">
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
        />
      ))}
    </div>
  );
});
