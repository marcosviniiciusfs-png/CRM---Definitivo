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
    <div className="flex flex-col min-w-[280px] w-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-base text-foreground">{title}</h3>
        <Badge className={cn("rounded-full w-7 h-7 flex items-center justify-center p-0", color)}>
          {count}
        </Badge>
      </div>
      
      <div className={cn("h-1 mb-4 rounded-full", color)} />
      
      <div className="space-y-3 flex-1 overflow-y-auto max-h-[calc(100vh-280px)]">
        {isEmpty ? (
          <p className="text-sm text-muted-foreground text-center py-8">
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
