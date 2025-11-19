import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

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
        .limit(3); // Mostrar no máximo 3 tags na lista

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
    <div className="flex gap-1 flex-wrap mt-1">
      {tags.map((tag) => (
        <Badge
          key={tag.id}
          style={{
            backgroundColor: tag.color,
            color: "white",
          }}
          className="text-[10px] px-1.5 py-0 h-4"
        >
          {tag.name}
        </Badge>
      ))}
    </div>
  );
}
