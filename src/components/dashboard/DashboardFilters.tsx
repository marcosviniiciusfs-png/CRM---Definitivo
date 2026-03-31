import { Button } from '@/components/ui/button';

type PeriodType = 'today' | 'month' | 'quarter' | 'year';

interface DashboardFiltersProps {
  period: PeriodType;
  onPeriodChange: (period: PeriodType) => void;
}

const periodLabels = {
  today: 'Hoje',
  month: 'Este Mês',
  quarter: 'Trimestre',
  year: 'Ano',
};

export function DashboardFilters({ period, onPeriodChange }: DashboardFiltersProps) {
  const handleButtonClick = (selectedPeriod: PeriodType) => {
    onPeriodChange(selectedPeriod);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(periodLabels).map(([key, label]) => (
        <Button
          key={key}
          size="sm"
          variant={period === key ? 'default' : 'outline'}
          onClick={() => handleButtonClick(key as PeriodType)}
          className="text-foreground bg-background"
        >
          {label}
        </Button>
      ))}
    </div>
  );
}

export function getPeriodDateRange(period: PeriodType): { startDate: Date; endDate: Date } {
  const now = new Date();
  switch (period) {
    case 'today': {
      // Hoje: 00:00 até 23:59:59
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      return { startDate: todayStart, endDate: todayEnd };
    }
    case 'month': {
      // Este mês: 1º até último dia
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      return { startDate: monthStart, endDate: monthEnd };
    }
    case 'quarter': {
      // Trimestre atual
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      const quarterStart = new Date(now.getFullYear(), quarterMonth, 1);
      const quarterEnd = new Date(now.getFullYear(), quarterMonth + 3, 0, 23, 59, 59);
      return { startDate: quarterStart, endDate: quarterEnd };
    }
    case 'year': {
      // Ano atual: Jan 1 até Dec 31
      const yearStart = new Date(now.getFullYear(), 0, 1);
      const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
      return { startDate: yearStart, endDate: yearEnd };
    }
  }
}