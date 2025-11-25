import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { ArrowUpIcon, ArrowDownIcon } from "lucide-react";

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
}

export function MetricCard({ title, value, subtitle, icon: Icon, iconColor, trend }: MetricCardProps) {
  return (
    <Card className="transition-all duration-300 hover:shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${iconColor || "text-muted-foreground"}`} />
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <div className="text-2xl font-bold">
            <AnimatedNumber value={value} />
          </div>
          {trend && (
            <div className={`flex items-center gap-1 text-xs ${trend.positive ? "text-green-600" : "text-red-600"}`}>
              {trend.positive ? (
                <ArrowUpIcon className="h-3 w-3" />
              ) : (
                <ArrowDownIcon className="h-3 w-3" />
              )}
              <span className="font-medium">{trend.value}</span>
            </div>
          )}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
