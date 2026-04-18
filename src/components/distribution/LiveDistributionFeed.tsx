import { useDistributionFeed, DistributionFeedItem } from '@/hooks/useDistributionFeed';
import { LeadScoreBadge } from './LeadScoreBadge';

interface LiveDistributionFeedProps {
  organizationId: string | undefined;
}

function getSourceBadge(source: string) {
  const map: Record<string, { label: string; class: string }> = {
    facebook: { label: 'FB', class: 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400' },
    formulario: { label: 'Form', class: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
    site: { label: 'Site', class: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' },
    manual: { label: 'Manual', class: 'bg-secondary text-secondary-foreground' },
  };
  const info = map[source] || { label: source?.slice(0, 3) || '?', class: 'bg-secondary text-secondary-foreground' };
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${info.class}`}>
      {info.label}
    </span>
  );
}

function getRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'agora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function FeedItem({ item }: { item: DistributionFeedItem }) {
  return (
    <div className="animate-fade-in-down flex items-start gap-2 py-2.5 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium truncate">{item.leadName}</span>
          {item.noAgent && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-orange-500 shrink-0">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[10px] text-muted-foreground">
            {item.noAgent ? 'Sem agente' : `\u2192 ${item.agentName}`}
          </span>
          {getSourceBadge(item.source)}
          <LeadScoreBadge score={item.leadScore} size="sm" />
        </div>
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
        {getRelativeTime(item.assignedAt)}
      </span>
    </div>
  );
}

export function LiveDistributionFeed({ organizationId }: LiveDistributionFeedProps) {
  const { items } = useDistributionFeed(organizationId);

  return (
    <div className="rounded-xl border bg-card shadow-sm p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Feed ao Vivo
        </h3>
      </div>
      <div className="max-h-[300px] overflow-y-auto scrollbar-subtle">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Nenhuma distribuicao recente
          </p>
        ) : (
          items.map(item => <FeedItem key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}
