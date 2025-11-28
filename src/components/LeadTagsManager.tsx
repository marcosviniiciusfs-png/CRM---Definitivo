import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tag, Plus, Check } from "lucide-react";
import { ManageTagsDialog } from "./ManageTagsDialog";

interface LeadTag {
  id: string;
  name: string;
  color: string;
}

interface LeadTagsManagerProps {
  leadId: string;
  onTagsChanged?: () => void;
}

export function LeadTagsManager({ leadId, onTagsChanged }: LeadTagsManagerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [leadTags, setLeadTags] = useState<LeadTag[]>([]);
  const [availableTags, setAvailableTags] = useState<LeadTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  useEffect(() => {
    loadLeadTags();
    loadAvailableTags();

    // Configurar realtime para mudanças nas etiquetas deste lead
    const channel = supabase
      .channel(`lead-tags-${leadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'lead_tag_assignments',
          filter: `lead_id=eq.${leadId}`
        },
        (payload) => {
          console.log('➕ Etiqueta adicionada ao lead:', payload);
          loadLeadTags();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'lead_tag_assignments',
          filter: `lead_id=eq.${leadId}`
        },
        (payload) => {
          console.log('🗑️ Etiqueta removida do lead:', payload);
          loadLeadTags();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId]);

  const loadLeadTags = async () => {
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
        .eq("lead_id", leadId);

      if (error) throw error;

      const tags = data
        .map((item: any) => item.lead_tags)
        .filter(Boolean) as LeadTag[];
      
      setLeadTags(tags);
    } catch (error: any) {
      console.error("Erro ao carregar etiquetas do lead:", error);
    }
  };

  const loadAvailableTags = async () => {
    setLoading(true);
    try {
      const { data: orgData } = await supabase.rpc("get_user_organization_id", {
        _user_id: user?.id,
      });

      if (!orgData) return;

      const { data, error } = await supabase
        .from("lead_tags")
        .select("*")
        .eq("organization_id", orgData)
        .order("name");

      if (error) throw error;
      setAvailableTags(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar etiquetas disponíveis:", error);
    } finally {
      setLoading(false);
    }
  };

  const hasTag = (tagId: string) => {
    return leadTags.some((tag) => tag.id === tagId);
  };

  const handleToggleTag = async (tagId: string) => {
    try {
      if (hasTag(tagId)) {
        // Remover tag
        const { error } = await supabase
          .from("lead_tag_assignments")
          .delete()
          .eq("lead_id", leadId)
          .eq("tag_id", tagId);

        if (error) throw error;

        toast({
          title: "Etiqueta removida",
          description: "A etiqueta foi removida do lead",
        });
      } else {
        // Adicionar tag
        const { error } = await supabase
          .from("lead_tag_assignments")
          .insert({
            lead_id: leadId,
            tag_id: tagId,
          });

        if (error) throw error;

        toast({
          title: "Etiqueta adicionada",
          description: "A etiqueta foi adicionada ao lead",
        });
      }

      loadLeadTags();
      onTagsChanged?.();
    } catch (error: any) {
      console.error("Erro ao alternar etiqueta:", error);
      toast({
        title: "Erro",
        description: "Não foi possível alterar a etiqueta",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {leadTags.map((tag) => (
          <Badge
            key={tag.id}
            style={{
              backgroundColor: tag.color,
              color: "white",
            }}
            className="text-xs"
          >
            {tag.name}
          </Badge>
        ))}

        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 px-2">
              <Tag className="w-3 h-3 mr-1" />
              Etiquetas
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 z-[100]" align="start">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm">Etiquetas</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setManageDialogOpen(true);
                    setPopoverOpen(false);
                  }}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Gerenciar
                </Button>
              </div>

              {loading ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : availableTags.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  <p>Nenhuma etiqueta criada</p>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => {
                      setManageDialogOpen(true);
                      setPopoverOpen(false);
                    }}
                  >
                    Criar primeira etiqueta
                  </Button>
                </div>
              ) : (
                <div className="space-y-1">
                  {availableTags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => handleToggleTag(tag.id)}
                      className="w-full flex items-center gap-2 p-2 rounded hover:bg-muted transition-colors"
                    >
                      <div
                        className={`w-5 h-5 rounded border flex items-center justify-center ${
                          hasTag(tag.id) ? "bg-primary border-primary" : "border-input"
                        }`}
                      >
                        {hasTag(tag.id) && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <Badge
                        style={{
                          backgroundColor: tag.color,
                          color: "white",
                        }}
                        className="flex-1 justify-start"
                      >
                        {tag.name}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <ManageTagsDialog
        open={manageDialogOpen}
        onOpenChange={setManageDialogOpen}
        onTagsChanged={() => {
          loadAvailableTags();
          loadLeadTags();
          onTagsChanged?.();
        }}
      />
    </>
  );
}
