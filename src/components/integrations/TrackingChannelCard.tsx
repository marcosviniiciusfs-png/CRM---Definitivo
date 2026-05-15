import { useState, useEffect, useRef } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Info } from "lucide-react";
import { ChannelWithRule } from "@/hooks/useTrackingRules";
import { KeywordsInput } from "./KeywordsInput";
import { TrackingChannelStats } from "./TrackingChannelStats";
import { cn } from "@/lib/utils";

interface Props {
  channel: ChannelWithRule;
  canEdit: boolean;
  onSave: (
    instanceId: string,
    patch: { enabled?: boolean; keywords?: string[] }
  ) => Promise<void>;
}

const DEBOUNCE_MS = 800;

/**
 * Card por canal: toggle 'Trackear' + KeywordsInput + auto-save debounced.
 *
 * Estado local mirror do estado vindo da rule, com debounce de 800ms para
 * batchear writes. Indicador "salvando..." inline. Toggle off mantém keywords
 * salvas (pra reativar depois sem reconfigurar).
 */
export function TrackingChannelCard({ channel, canEdit, onSave }: Props) {
  const initialEnabled = channel.rule?.enabled ?? false;
  const initialKeywords = channel.rule?.keywords ?? [];

  const [enabled, setEnabled] = useState(initialEnabled);
  const [keywords, setKeywords] = useState<string[]>(initialKeywords);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  const mountedRef = useRef(true);

  // Sync quando o canal vem de fora (reload externo)
  useEffect(() => {
    if (!isDirtyRef.current) {
      setEnabled(channel.rule?.enabled ?? false);
      setKeywords(channel.rule?.keywords ?? []);
    }
  }, [channel.rule?.enabled, channel.rule?.keywords]);

  useEffect(() => () => {
    mountedRef.current = false;
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const scheduleSave = (patch: { enabled?: boolean; keywords?: string[] }) => {
    if (!canEdit) return;
    isDirtyRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await onSave(channel.instance_id, patch);
      } finally {
        if (mountedRef.current) {
          setSaving(false);
          isDirtyRef.current = false;
        }
      }
    }, DEBOUNCE_MS);
  };

  const handleToggle = (next: boolean) => {
    setEnabled(next);
    scheduleSave({ enabled: next, keywords });
  };

  const handleKeywordsChange = (next: string[]) => {
    setKeywords(next);
    scheduleSave({ enabled, keywords: next });
  };

  const channelLabel = channel.channel_name || channel.instance_name;
  const phoneLabel = channel.phone_number ? ` (${channel.phone_number})` : '';

  return (
    <div className="border border-border rounded-md p-4 bg-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className="w-1 h-5 rounded-sm flex-shrink-0"
            style={{ backgroundColor: channel.channel_color || '#888' }}
          />
          <Label className="text-sm font-medium truncate">
            {channelLabel}
            <span className="text-muted-foreground font-normal">{phoneLabel}</span>
          </Label>
        </div>
        <div className="flex items-center gap-2">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <Switch
            checked={enabled}
            disabled={!canEdit}
            onCheckedChange={handleToggle}
            aria-label="Trackear este canal"
          />
        </div>
      </div>

      <div className={cn(!enabled && "opacity-50 pointer-events-none")}>
        <Label className="text-xs text-muted-foreground mb-1.5 block">
          Palavras-chave (qualquer match)
        </Label>
        <KeywordsInput
          value={keywords}
          onChange={handleKeywordsChange}
          disabled={!canEdit || !enabled}
          placeholder={enabled ? "Digite uma palavra e pressione Enter" : "Ative o trackeamento primeiro"}
        />

        <div className="flex items-start gap-1.5 mt-2 text-[11px] text-muted-foreground">
          <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <span>
            Compara sem distinguir maiúsculas/acentos. Mensagens de leads novos que contiverem
            qualquer uma dessas palavras receberão a tag <strong>Lead de anúncio</strong>.
          </span>
        </div>

        {enabled && keywords.length === 0 && (
          <div className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
            ⚠ Nenhuma palavra cadastrada — nenhum lead será tagueado.
          </div>
        )}
      </div>

      {channel.rule?.enabled && (
        <TrackingChannelStats
          instanceId={channel.instance_id}
          keywords={keywords}
        />
      )}
    </div>
  );
}
