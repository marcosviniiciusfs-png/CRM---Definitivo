import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
  TrendingUp, TrendingDown, Minus, DollarSign, ShoppingBag,
  Trash2, Pencil, CalendarDays, ArrowUpRight, ArrowDownRight,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getInitials } from "@/lib/image-utils";

interface ProductionBlock {
  id: string;
  month: number;
  year: number;
  total_sales: number;
  total_revenue: number;
  total_cost: number;
  total_profit: number;
  previous_month_profit: number | null;
  profit_change_value: number | null;
  profit_change_percentage: number | null;
  is_closed: boolean;
  start_date: string | null;
  end_date: string | null;
}

interface ResponsiblePerson {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  sales_count: number;
}

interface ProductionBlockCardProps {
  block: ProductionBlock;
  organizationId?: string;
  isCurrent?: boolean;
  onClick?: () => void;
  onDelete?: () => void;
}

export function ProductionBlockCard({ block, organizationId, isCurrent, onClick, onDelete }: ProductionBlockCardProps) {
  const [responsibles, setResponsibles] = useState<ResponsiblePerson[]>([]);

  const monthName = format(new Date(block.year, block.month - 1), "MMMM", { locale: ptBR });
  const yearLabel = String(block.year);
  const dateRange = (() => {
    if (block.start_date && block.end_date) {
      const s = format(new Date(block.start_date + 'T00:00:00'), "dd/MM");
      const e = format(new Date(block.end_date + 'T00:00:00'), "dd/MM");
      return `${s} — ${e}`;
    }
    return null;
  })();

  useEffect(() => {
    if (!organizationId) return;
    const fetchResponsibles = async () => {
      const startDate = block.start_date
        ? new Date(block.start_date + 'T00:00:00')
        : new Date(block.year, block.month - 1, 1);
      const endDate = block.end_date
        ? new Date(block.end_date + 'T23:59:59')
        : new Date(block.year, block.month, 0, 23, 59, 59);

      const { data: leads } = await supabase
        .from("leads")
        .select("responsavel_user_id, responsavel, funnel_stages(stage_type)")
        .eq("organization_id", organizationId)
        .gte("data_conclusao", startDate.toISOString())
        .lte("data_conclusao", endDate.toISOString());

      const wonLeads = leads?.filter(l => (l.funnel_stages as any)?.stage_type === 'won') || [];
      if (wonLeads.length === 0) { setResponsibles([]); return; }

      const countMap = new Map<string, { user_id: string | null; name: string; count: number }>();
      for (const lead of wonLeads) {
        const key = lead.responsavel_user_id || lead.responsavel || 'unknown';
        const existing = countMap.get(key);
        if (existing) { existing.count++; }
        else { countMap.set(key, { user_id: lead.responsavel_user_id, name: lead.responsavel || 'Sem nome', count: 1 }); }
      }

      const userIds = [...countMap.values()].filter(e => e.user_id).map(e => e.user_id!);
      let profilesMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, avatar_url")
          .in("user_id", userIds);
        profiles?.forEach(p => {
          profilesMap[p.user_id] = { full_name: p.full_name, avatar_url: p.avatar_url };
        });
      }

      const result: ResponsiblePerson[] = [];
      for (const [, entry] of countMap) {
        const profile = entry.user_id ? profilesMap[entry.user_id] : null;
        result.push({
          user_id: entry.user_id || '',
          full_name: profile?.full_name || entry.name,
          avatar_url: profile?.avatar_url || null,
          sales_count: entry.count,
        });
      }
      // Sort by sales count descending — top 3 only
      result.sort((a, b) => b.sales_count - a.sales_count);
      setResponsibles(result.slice(0, 3));
    };
    fetchResponsibles();
  }, [organizationId, block.id, block.month, block.year, block.start_date, block.end_date]);

  const profitChange = block.profit_change_percentage;

  // BRL formatting with proper punctuation (pt-BR: 1.234,56)
  const fmtBRL = (v: number) => {
    const abs = Math.abs(v);
    const formatted = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(abs);
    if (abs >= 1000000) return `${v < 0 ? '-' : ''}R$${(abs / 1000000).toFixed(1)}M`;
    if (abs >= 10000) return `${v < 0 ? '-' : ''}R$${formatted}`;
    return `${v < 0 ? '-' : ''}R$${formatted}`;
  };

  return (
    <Card
      className="group relative cursor-pointer transition-all duration-200 hover:shadow-md hover:shadow-primary/5 hover:border-primary/20"
      onClick={onClick}
    >
      <CardContent className="p-0">
        {/* Thin gradient accent bar - CRM brand color */}
        <div className="h-[3px] rounded-t-lg bg-gradient-to-r from-primary via-primary/60 to-primary/10" />

        <div className="px-3.5 pt-3 pb-3 space-y-2.5">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="text-sm font-bold capitalize leading-none text-foreground truncate">
                {monthName}
              </h3>
              <span className="text-[11px] text-muted-foreground/60 font-medium shrink-0">{yearLabel}</span>
              {dateRange && (
                <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground/50 shrink-0">
                  <CalendarDays className="h-2.5 w-2.5" />
                  <span>{dateRange}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              {isCurrent && (
                <Badge variant="default" className="text-[9px] px-1.5 py-0 h-4 font-semibold">
                  Atual
                </Badge>
              )}
              {onClick && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); onClick(); }}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>

          {/* Inline metrics — compact horizontal layout */}
          <div className="flex items-center gap-3 text-[11px]">
            <div className="flex items-center gap-1">
              <ShoppingBag className="h-3 w-3 text-blue-500" />
              <span className="font-semibold">{block.total_sales}</span>
              <span className="text-muted-foreground/50">vendas</span>
            </div>
            <div className="flex items-center gap-1">
              <DollarSign className="h-3 w-3 text-emerald-500" />
              <span className="font-semibold">{fmtBRL(block.total_revenue)}</span>
            </div>
            <div className="flex items-center gap-1">
              {block.total_profit > 0
                ? <TrendingUp className="h-3 w-3 text-emerald-500" />
                : block.total_profit < 0
                  ? <TrendingDown className="h-3 w-3 text-red-500" />
                  : <Minus className="h-3 w-3 text-muted-foreground/40" />
              }
              <span className={`font-semibold ${
                block.total_profit > 0 ? 'text-emerald-600 dark:text-emerald-400'
                  : block.total_profit < 0 ? 'text-red-600 dark:text-red-400'
                  : 'text-muted-foreground'
              }`}>
                {fmtBRL(block.total_profit)}
              </span>
            </div>
            {profitChange !== null && profitChange !== 0 && (
              <div className={`flex items-center gap-0.5 ml-auto ${
                profitChange > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
              }`}>
                {profitChange > 0 ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                <span className="font-medium text-[10px]">{profitChange > 0 ? '+' : ''}{profitChange.toFixed(1)}%</span>
              </div>
            )}
          </div>

          {/* Top 3 sellers — compact footer */}
          {responsibles.length > 0 && (
            <div className="flex items-center justify-between pt-2 border-t border-border/60">
              <div className="flex items-center gap-1">
                <Users className="h-2.5 w-2.5 text-muted-foreground/40" />
                <span className="text-[9px] text-muted-foreground/50 font-medium">Top 3</span>
              </div>
              <TooltipProvider delayDuration={200}>
                <div className="flex items-center -space-x-1">
                  {responsibles.map((person, i) => (
                    <Tooltip key={person.user_id || i}>
                      <TooltipTrigger asChild>
                        <div className="relative ring-[1.5px] ring-background rounded-full">
                          <Avatar className="h-5 w-5">
                            <AvatarImage src={person.avatar_url || undefined} alt={person.full_name || ''} />
                            <AvatarFallback className="text-[7px] bg-muted text-muted-foreground font-medium">
                              {getInitials(person.full_name)}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        <span className="font-medium">{person.full_name || 'Sem nome'}</span>
                        <span className="text-muted-foreground ml-1">({person.sales_count} vendas)</span>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </TooltipProvider>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
