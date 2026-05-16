import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Info } from "lucide-react";
import { ChannelWithRule } from "@/hooks/useTrackingRules";
import { KeywordsInput } from "./KeywordsInput";
import { TrackingChannelStats } from "./TrackingChannelStats";
import { cn } from "@/lib/utils";

interface Props {
  channel: ChannelWithRule | null;
  canEdit: boolean;
  onClose: () => void;
  onSave: (
    instanceId: string,
    patch: { enabled?: boolean; keywords?: string[] }
  ) => Promise<void>;
}

const DEBOUNCE_MS = 800;

/**
 * Modal de configuracao completa de tracking de um canal.
 * Mostra: toggle, editor de keywords, e stats (quando enabled).
 * Auto-save com debounce 800ms. Mirror local de estado.
 */
export function TrackingChannelDialog({ channel, canEdit, onClose, onSave }: Props) {
  const open = channel !== null;

  const [enabled, setEnabled] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  const mountedRef = useRef(true);

  // Reset state when channel changes (different dialog open)
  useEffect(() => {
    if (channel) {
      setEnabled(channel.rule?.enabled ?? false);
      setKeywords(channel.rule?.keywords ?? []);
      isDirtyRef.current = false;
    }
  }, [channel?.instance_id]);

  // Sync de mudancas externas (reload do hook) quando dialog aberto e sem dirty
  useEffect(() => {
    if (channel && !isDirtyRef.current) {
      setEnabled(channel.rule?.enabled ?? false);
      setKeywords(channel.rule?.keywords ?? []);
    }
  }, [channel?.rule?.enabled, channel?.rule?.keywords]);

  useEffect(() => () => {
    mountedRef.current = false;
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const scheduleSave = (patch: { enabled?: boolean; keywords?: string[] }) => {
    if (!canEdit || !channel) return;
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

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      // Flush any pending save before closing
      if (debounceRef.current && channel) {
        clearTimeout(debounceRef.current);
        setSaving(true);
        onSave(channel.instance_id, { enabled, keywords }).finally(() => {
          if (mountedRef.current) setSaving(false);
        });
      }
      onClose();
    }
  };

  if (!channel) return null;

  const channelLabel = channel.channel_name || channel.instance_name;
  const phoneLabel = channel.phone_number ? `(${channel.phone_number})` : '';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div
              className="w-1 h-5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: channel.channel_color || '#888' }}
            />
            <span>{channelLabel}</span>
            <span className="text-sm text-muted-foreground font-normal">{phoneLabel}</span>
          </DialogTitle>
          <DialogDescription>
            Configure palavras-chave para identificar leads que vêm de anúncios e veja as estatísticas de trackeamento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Toggle */}
          <div className="flex items-center justify-between p-3 border border-border rounded-md bg-muted/30">
            <div>
              <Label className="text-sm font-medium">Trackear este canal</Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Quando ativo, leads cuja primeira mensagem bate em alguma keyword recebem a tag "Lead de anúncio".
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              <Switch
                checked={enabled}
                disabled={!canEdit}
                onCheckedChange={handleToggle}
                aria-label="Trackear este canal"
                className="data-[state=checked]:bg-green-500"
              />
            </div>
          </div>

          {/* Keywords editor */}
          <div className={cn(!enabled && "opacity-50 pointer-events-none")}>
            <Label className="text-sm font-medium block mb-1.5">
              Palavras-chave (qualquer match)
            </Label>
            <KeywordsInput
              value={keywords}
              onChange={handleKeywordsChange}
              disabled={!canEdit || !enabled}
              placeholder={enabled ? "Digite uma frase ou palavra-chave" : "Ative o trackeamento primeiro"}
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

          {/* Stats */}
          {enabled && (
            <TrackingChannelStats
              instanceId={channel.instance_id}
              keywords={keywords}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
