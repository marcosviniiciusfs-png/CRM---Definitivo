import { useRouletteConversion } from '@/hooks/useRouletteConversion';

interface ConversionSparklineProps {
  configId: string;
}

export function ConversionSparkline({ configId }: ConversionSparklineProps) {
  const { data: conversionData, isLoading } = useRouletteConversion(configId);

  if (isLoading || !conversionData) {
    return (
      <div className="flex items-end gap-[2px] h-5">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="w-[4px] rounded-sm bg-muted animate-pulse"
            style={{ height: '8px' }}
          />
        ))}
      </div>
    );
  }

  const maxVal = Math.max(...conversionData, 1);

  return (
    <div className="flex items-end gap-[2px] h-5">
      {conversionData.map((val, i) => {
        const height = Math.max(2, (val / maxVal) * 20);
        const isToday = i === conversionData.length - 1;
        return (
          <div
            key={i}
            className={`w-[4px] rounded-sm transition-all duration-300 ${
              val > 0
                ? isToday
                  ? 'bg-emerald-500'
                  : 'bg-emerald-300 dark:bg-emerald-500/40'
                : 'bg-muted'
            }`}
            style={{ height: `${height}px` }}
            title={`${val}% conversao`}
          />
        );
      })}
    </div>
  );
}
