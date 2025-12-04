import { memo, useRef, useEffect } from "react";
import { Lead } from "@/types/chat";
import { PresenceInfo } from "./types";
import { ChatLeadItem } from "./ChatLeadItem";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Pin, PinOff, Tag } from "lucide-react";

interface VirtualizedLeadListProps {
  leads: Lead[];
  selectedLeadId: string | null;
  pinnedLeads: string[];
  presenceStatus: Map<string, PresenceInfo>;
  leadTagsMap: Map<string, string[]>;
  isPinnedList?: boolean;
  onSelectLead: (lead: Lead) => void;
  onTogglePin: (leadId: string) => void;
  onAddTags: (lead: Lead) => void;
  onRemoveTags: (leadId: string) => void;
  onAvatarClick: (url: string, name: string) => void;
}

const ITEM_HEIGHT = 72;
const VISIBLE_ITEMS = 10;

const LeadRow = memo(function LeadRow({
  lead,
  selectedLeadId,
  pinnedLeads,
  presenceStatus,
  leadTagsMap,
  onSelectLead,
  onTogglePin,
  onAddTags,
  onRemoveTags,
  onAvatarClick,
}: {
  lead: Lead;
  selectedLeadId: string | null;
  pinnedLeads: string[];
  presenceStatus: Map<string, PresenceInfo>;
  leadTagsMap: Map<string, string[]>;
  onSelectLead: (lead: Lead) => void;
  onTogglePin: (leadId: string) => void;
  onAddTags: (lead: Lead) => void;
  onRemoveTags: (leadId: string) => void;
  onAvatarClick: (url: string, name: string) => void;
}) {
  const isPinned = pinnedLeads.includes(lead.id);
  const hasTag = (leadTagsMap.get(lead.id)?.length || 0) > 0;

  return (
    <div className="px-2">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div>
            <ChatLeadItem
              lead={lead}
              isSelected={selectedLeadId === lead.id}
              isPinned={isPinned}
              presenceStatus={presenceStatus.get(lead.id)}
              tagVersion={(leadTagsMap.get(lead.id) || []).join(",")}
              onClick={() => onSelectLead(lead)}
              onAvatarClick={onAvatarClick}
            />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem onClick={() => onTogglePin(lead.id)}>
            {isPinned ? (
              <>
                <PinOff className="mr-2 h-4 w-4" />
                Desafixar conversa
              </>
            ) : (
              <>
                <Pin className="mr-2 h-4 w-4" />
                Fixar conversa
              </>
            )}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => onAddTags(lead)}>
            <Tag className="mr-2 h-4 w-4" />
            Adicionar etiquetas
          </ContextMenuItem>
          {hasTag && (
            <ContextMenuItem onClick={() => onRemoveTags(lead.id)}>
              <Tag className="mr-2 h-4 w-4" />
              Remover etiquetas
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
});

export const VirtualizedLeadList = memo(function VirtualizedLeadList({
  leads,
  selectedLeadId,
  pinnedLeads,
  presenceStatus,
  leadTagsMap,
  isPinnedList = false,
  onSelectLead,
  onTogglePin,
  onAddTags,
  onRemoveTags,
  onAvatarClick,
}: VirtualizedLeadListProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (leads.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        {isPinnedList ? "Nenhum contato fixado" : "Nenhum contato encontrado"}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-1 p-2">
      {leads.map((lead) => (
        <LeadRow
          key={lead.id}
          lead={lead}
          selectedLeadId={selectedLeadId}
          pinnedLeads={pinnedLeads}
          presenceStatus={presenceStatus}
          leadTagsMap={leadTagsMap}
          onSelectLead={onSelectLead}
          onTogglePin={onTogglePin}
          onAddTags={onAddTags}
          onRemoveTags={onRemoveTags}
          onAvatarClick={onAvatarClick}
        />
      ))}
    </div>
  );
});
