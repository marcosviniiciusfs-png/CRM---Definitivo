import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tag } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface LeadTag {
  id: string;
  name: string;
  color: string;
}

interface LeadTagsBadgeProps {
  leadId: string;
}

export function LeadTagsBadge({ leadId }: LeadTagsBadgeProps) {
  const [tags, setTags] = useState<LeadTag[]>([]);

  useEffect(() => {
    loadTags();
    
    // Configurar realtime para atualizar quando as tags mudarem
    const channel = supabase
      .channel(`lead-tags-${leadId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lead_tag_assignments',
          filter: `lead_id=eq.${leadId}`
        },
        () => {
          loadTags();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId]);

  const loadTags = async () => {
    try {
      const { data, error } = await supabase
        .from("lead_tag_assignments")
        .select(`
          tag_id,
          lead_tags (
            id,
            name,
            color
          )
        `)
        .eq("lead_id", leadId)
        .limit(5); // Mostrar no máximo 5 tags na lista

      if (error) throw error;

      const loadedTags = data
        .map((item: any) => item.lead_tags)
        .filter(Boolean) as LeadTag[];
      
      setTags(loadedTags);
    } catch (error: any) {
      console.error("Erro ao carregar etiquetas do lead:", error);
    }
  };

  if (tags.length === 0) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex gap-1 items-center">
        {tags.map((tag) => (
          <Tooltip key={tag.id}>
            <TooltipTrigger asChild>
              <div className="cursor-help transition-transform hover:scale-110">
                <Tag
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ 
                    color: tag.color,
                    fill: tag.color,
                  }}
                  strokeWidth={2}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="animate-in fade-in-0 zoom-in-95"
              style={{
                backgroundColor: tag.color,
                color: "white",
                borderColor: tag.color,
              }}
            >
              <p className="font-medium text-xs">{tag.name}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
