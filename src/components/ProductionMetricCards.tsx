import { ShoppingBag, DollarSign, TrendingUp, Receipt, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

interface MetricCard {
  label: string;
  value: string;
  change: number | null;
}

interface ProductionMetricCardsProps {
  sales: MetricCard;
  revenue: MetricCard;
  profit: MetricCard;
  ticket: MetricCard;
}

const CARD_STYLES = [
  { bg: "bg-[#6c5ce7]", border: "border-[#6c5ce7]", icon: ShoppingBag },
  { bg: "bg-[#00b894]", border: "border-[#00b894]", icon: DollarSign },
  { bg: "bg-[#0984e3]", border: "border-[#0984e3]", icon: TrendingUp },
  { bg: "bg-[#e17055]", border: "border-[#e17055]", icon: Receipt },
];

function ChangeIndicator({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[11px] text-muted-foreground">—</span>;
  const isPositive = value > 0;
  const isNeutral = value === 0;
  const colorClass = isNeutral ? "text-muted-foreground" : isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400";
  return (
    <div className={`flex items-center gap-0.5 text-[11px] ${colorClass}`}>
      {isNeutral ? (
        <Minus className="h-3 w-3" />
      ) : isPositive ? (
        <ArrowUpRight className="h-3 w-3" />
      ) : (
        <ArrowDownRight className="h-3 w-3" />
      )}
      <span>{isPositive ? "+" : ""}{value.toFixed(1)}%</span>
    </div>
  );
}

export function ProductionMetricCards({ sales, revenue, profit, ticket }: ProductionMetricCardsProps) {
  const cards = [sales, revenue, profit, ticket];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map((card, i) => {
        const style = CARD_STYLES[i];
        const Icon = style.icon;
        return (
          <div
            key={card.label}
            className={`overflow-hidden rounded-xl border ${style.border} bg-card transition-all hover:shadow-md`}
          >
            {/* Header colorido */}
            <div className={`${style.bg} text-white px-4 py-2.5 flex items-center gap-2`}>
              <Icon className="h-4 w-4 opacity-90" />
              <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wide">
                {card.label}
              </span>
            </div>
            {/* Corpo branco */}
            <div className="px-4 py-3 sm:py-4">
              <p className="text-xl sm:text-2xl font-bold text-foreground">{card.value}</p>
              <div className="mt-1">
                <ChangeIndicator value={card.change} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
