import { useEffect, useState } from "react";
import { BarChart3, UserX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  instanceId: string;
  /** Lista atual de keywords cadastradas (para mostrar mesmo as com 0 matches) */
  keywords: string[];
}

type WindowKey = '7d' | '30d' | '90d' | '365d' | 'all';

const WINDOW_LABELS: Record<WindowKey, string> = {
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
  '365d': 'Último ano',
  'all': 'Total acumulado',
};

function getCutoff(win: WindowKey): string | null {
  if (win === 'all') return null;
  const days = parseInt(win, 10);
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export function TrackingChannelStats({ instanceId, keywords }: Props) {
  const [window, setWindow] = useState<WindowKey>('30d');
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const cutoff = getCutoff(window);
    // @ts-expect-error: tracking_match_log nao gerado nos types ainda
    let query = supabase
      .from('tracking_match_log')
      .select('matched_keyword')
      .eq('whatsapp_instance_id', instanceId)
      .limit(10000);

    if (cutoff) query = query.gte('matched_at', cutoff);

    query.then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error('[stats] error:', error);
        setCounts({});
      } else {
        // Agrega case-insensitive: leads tagueados em momentos diferentes
        // que bateram na mesma keyword (mesmo escrita em casing diferente)
        // contam juntos.
        const map: Record<string, number> = {};
        (data || []).forEach((r: any) => {
          const k = (r.matched_keyword || '').toLowerCase();
          map[k] = (map[k] || 0) + 1;
        });
        setCounts(map);
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [instanceId, window]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="mt-3 pt-3 border-t border-border space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <BarChart3 className="h-3.5 w-3.5" />
          <span className="font-medium">Estatísticas</span>
          {!loading && <span className="text-[11px]">({total} {total === 1 ? 'lead' : 'leads'})</span>}
        </div>
        <Select value={window} onValueChange={(v) => setWindow(v as WindowKey)}>
          <SelectTrigger className="h-7 text-[11px] w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(WINDOW_LABELS) as WindowKey[]).map(k => (
              <SelectItem key={k} value={k} className="text-xs">
                {WINDOW_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {keywords.length === 0 ? (
        counts['__unknown_contact__'] > 0 ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2 px-2 py-1 rounded text-[11px] bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 border border-blue-200/50 dark:border-blue-800/50">
              <span className="flex-1 flex items-center gap-1 truncate">
                <UserX className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">Número desconhecido (não está na agenda)</span>
              </span>
              <span className="font-mono tabular-nums font-medium flex-shrink-0">
                {counts['__unknown_contact__']}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-muted-foreground italic">
            Cadastre keywords acima para ver estatísticas.
          </div>
        )
      ) : (
        <div className="space-y-1">
          {counts['__unknown_contact__'] > 0 && (
            <div className="flex items-center justify-between gap-2 px-2 py-1 rounded text-[11px] bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100 border border-blue-200/50 dark:border-blue-800/50">
              <span className="flex-1 flex items-center gap-1 truncate">
                <UserX className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">Número desconhecido (não está na agenda)</span>
              </span>
              <span className="font-mono tabular-nums font-medium flex-shrink-0">
                {counts['__unknown_contact__']}
              </span>
            </div>
          )}
          {keywords.map(kw => {
            const c = counts[kw.toLowerCase()] || 0;
            return (
              <div
                key={kw}
                className="flex items-center justify-between gap-2 px-2 py-1 rounded text-[11px] bg-muted/40"
              >
                <span className="flex-1 truncate" title={kw}>{kw}</span>
                <span className={`font-mono tabular-nums ${c > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                  {c}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
