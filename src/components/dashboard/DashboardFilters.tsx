import { Button } from '@/components/ui/button';

type PeriodType = 'today' | 'month' | 'quarter' | 'year';

interface DashboardFiltersProps {
  period: PeriodType;
  onPeriodChange: (period: PeriodType) => void;
}

const periodLabels: Record<PeriodType, string> = {
  today: 'Hoje',
  month: 'Este Mês',
  quarter: 'Trimestre',
  year: 'Ano',
};

export function DashboardFilters({ period, onPeriodChange }: DashboardFiltersProps) {
  return (
    <div className="inline-flex items-center rounded-lg border border-border/50 bg-muted/30 p-0.5">
      {(Object.entries(periodLabels) as [PeriodType, string][]).map(([key, label]) => (
        <button
          key={key}
          onClick={() => onPeriodChange(key)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
            period === key
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function getPeriodDateRange(period: PeriodType): { startDate: Date; endDate: Date } {
  const now = new Date();
  switch (period) {
    case 'today': {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      return { startDate: todayStart, endDate: todayEnd };
    }
    case 'month': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      return { startDate: monthStart, endDate: monthEnd };
    }
    case 'quarter': {
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      const quarterStart = new Date(now.getFullYear(), quarterMonth, 1);
      const quarterEnd = new Date(now.getFullYear(), quarterMonth + 3, 0, 23, 59, 59);
      return { startDate: quarterStart, endDate: quarterEnd };
    }
    case 'year': {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
      return { startDate: yearStart, endDate: yearEnd };
    }
  }
}
