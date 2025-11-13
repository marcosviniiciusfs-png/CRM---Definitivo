import { Badge } from "@/components/ui/badge";
import { LeadCard } from "./LeadCard";
import { cn } from "@/lib/utils";

interface Lead {
  id: string;
  name: string;
  phone: string;
  date: string;
}

interface PipelineColumnProps {
  title: string;
  count: number;
  color: string;
  leads: Lead[];
  isEmpty?: boolean;
}

export const PipelineColumn = ({ title, count, color, leads, isEmpty }: PipelineColumnProps) => {
  return (
    <div className="flex flex-col w-[280px] flex-shrink-0">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
        <Badge className={cn("rounded-full w-6 h-6 flex items-center justify-center p-0 text-xs", color)}>
          {count}
        </Badge>
      </div>
      
      <div className={cn("h-0.5 mb-3 rounded-full", color)} />
      
      <div className="space-y-2 flex-1 overflow-y-auto max-h-[calc(100vh-280px)]">
        {isEmpty ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Nenhum lead nesta etapa
          </p>
        ) : (
          leads.map((lead) => (
            <LeadCard
              key={lead.id}
              id={lead.id}
              name={lead.name}
              phone={lead.phone}
              date={lead.date}
            />
          ))
        )}
      </div>
    </div>
  );
};
