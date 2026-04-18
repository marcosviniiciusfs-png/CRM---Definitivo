import { getScoreBg } from '@/lib/leadScoring';

interface LeadScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md';
}

export function LeadScoreBadge({ score, size = 'sm' }: LeadScoreBadgeProps) {
  const sizeClasses = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5';
  const bgClass = getScoreBg(score);

  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${bgClass} ${sizeClasses}`}>
      {score}
    </span>
  );
}
