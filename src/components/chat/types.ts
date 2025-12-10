import { Lead, Message, MessageReaction } from "@/types/chat";

export interface PresenceInfo {
  isOnline: boolean;
  lastSeen?: string;
  status?: string;
  rateLimited?: boolean;
}

export interface LeadTagInfo {
  id: string;
  name: string;
  color: string;
}

export interface ChatContextType {
  selectedLead: Lead | null;
  setSelectedLead: (lead: Lead | null) => void;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  sending: boolean;
  setSending: (sending: boolean) => void;
  pinnedMessages: Set<string>;
  setPinnedMessages: React.Dispatch<React.SetStateAction<Set<string>>>;
  messageReactions: Map<string, MessageReaction[]>;
  setMessageReactions: React.Dispatch<React.SetStateAction<Map<string, MessageReaction[]>>>;
  presenceStatus: Map<string, PresenceInfo>;
  setPresenceStatus: React.Dispatch<React.SetStateAction<Map<string, PresenceInfo>>>;
  currentUserName: string;
}
