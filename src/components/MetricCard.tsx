import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { ArrowUpIcon, ArrowDownIcon, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  trend?: {
    value: string;
    positive: boolean;
  };
  compact?: boolean;
  tooltip?: string;
}

export function MetricCard({ title, value, subtitle, icon: Icon, iconColor, trend, compact = false, tooltip }: MetricCardProps) {
  const TitleWithTooltip = () => (
    <span className="flex items-center gap-1">
      {title}
      {tooltip && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[250px] text-xs">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </span>
  );

  if (compact) {
    return (
      <Card className="transition-all duration-300 hover:shadow-md">
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${iconColor || "text-foreground"}`} />
            <span className="text-sm font-bold text-foreground"><TitleWithTooltip /></span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-extrabold text-foreground">
              <AnimatedNumber value={value} />
            </span>
            {subtitle && <span className="text-xs font-semibold text-foreground/70">{subtitle}</span>}
            {trend && (
              <span className={`flex items-center gap-0.5 text-sm font-bold ${trend.positive ? "text-green-600" : "text-red-600"}`}>
                {trend.positive ? <ArrowUpIcon className="h-3 w-3" /> : <ArrowDownIcon className="h-3 w-3" />}
                {trend.value}
              </span>
            )}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="transition-all duration-300 hover:shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold text-foreground"><TitleWithTooltip /></CardTitle>
        <Icon className={`h-5 w-5 ${iconColor || "text-foreground"}`} />
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-3">
          <div className="text-4xl font-extrabold text-foreground tracking-tight">
            <AnimatedNumber value={value} />
          </div>
          {subtitle && <span className="text-sm font-semibold text-foreground/70">{subtitle}</span>}
          {trend && (
            <div className={`flex items-center gap-1 text-sm font-bold ${trend.positive ? "text-green-600" : "text-red-600"}`}>
              {trend.positive ? (
                <ArrowUpIcon className="h-4 w-4" />
              ) : (
                <ArrowDownIcon className="h-4 w-4" />
              )}
              <span className="font-bold">{trend.value}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
