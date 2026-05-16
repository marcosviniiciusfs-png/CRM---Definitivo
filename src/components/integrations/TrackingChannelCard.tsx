import { Switch } from "@/components/ui/switch";
import { ChevronRight } from "lucide-react";
import { ChannelWithRule } from "@/hooks/useTrackingRules";
import { cn } from "@/lib/utils";

interface Props {
  channel: ChannelWithRule;
  canEdit: boolean;
  onCardClick: () => void;
  onToggle: (enabled: boolean) => void;
}

/**
 * Card compacto por canal. Click no body abre o dialog completo.
 * Switch fica no canto direito e nao propaga click (stopPropagation).
 */
export function TrackingChannelCard({ channel, canEdit, onCardClick, onToggle }: Props) {
  const enabled = channel.rule?.enabled ?? false;
  const keywordCount = channel.rule?.keywords?.length ?? 0;
  const channelLabel = channel.channel_name || channel.instance_name;
  const phoneLabel = channel.phone_number || '';

  return (
    <button
      type="button"
      className={cn(
        "w-full text-left border border-border rounded-md p-3 bg-card transition-colors",
        canEdit && "hover:bg-muted/40 cursor-pointer",
        !canEdit && "cursor-default"
      )}
      onClick={() => canEdit && onCardClick()}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div
            className="w-1 h-7 rounded-sm flex-shrink-0"
            style={{ backgroundColor: channel.channel_color || '#888' }}
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{channelLabel}</div>
            {phoneLabel && (
              <div className="text-[11px] text-muted-foreground truncate">{phoneLabel}</div>
            )}
          </div>
        </div>
        <div
          className="flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <Switch
            checked={enabled}
            disabled={!canEdit}
            onCheckedChange={onToggle}
            aria-label="Trackear este canal"
          />
        </div>
      </div>

      {enabled && (
        <div className="mt-2.5 pt-2.5 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            <strong className="text-foreground font-medium">{keywordCount}</strong>{" "}
            {keywordCount === 1 ? 'palavra cadastrada' : 'palavras cadastradas'}
          </span>
          {canEdit && (
            <span className="flex items-center gap-0.5 text-primary">
              Configurar
              <ChevronRight className="h-3 w-3" />
            </span>
          )}
        </div>
      )}
    </button>
  );
}
