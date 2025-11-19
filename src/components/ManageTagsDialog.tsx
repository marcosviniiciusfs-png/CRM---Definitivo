import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit2, X } from "lucide-react";

interface Tag {
  id: string;
  name: string;
  color: string;
  organization_id: string;
}

interface ManageTagsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTagsChanged?: () => void;
}

const DEFAULT_COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#10B981", "#14B8A6",
  "#06B6D4", "#3B82F6", "#6366F1", "#8B5CF6", "#EC4899",
];

export function ManageTagsDialog({ open, onOpenChange, onTagsChanged }: ManageTagsDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [selectedColor, setSelectedColor] = useState(DEFAULT_COLORS[0]);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);

  useEffect(() => {
    if (open) {
      loadTags();
    }
  }, [open]);

  const loadTags = async () => {
    setLoading(true);
    try {
      const { data: orgData } = await supabase.rpc("get_user_organization_id", {
        _user_id: user?.id,
      });

      if (!orgData) {
        throw new Error("Organização não encontrada");
      }

      const { data, error } = await supabase
        .from("lead_tags")
        .select("*")
        .eq("organization_id", orgData)
        .order("name");

      if (error) throw error;
      setTags(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar etiquetas:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as etiquetas",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      toast({
        title: "Nome obrigatório",
        description: "Digite um nome para a etiqueta",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: orgData } = await supabase.rpc("get_user_organization_id", {
        _user_id: user?.id,
      });

      if (!orgData) throw new Error("Organização não encontrada");

      const { error } = await supabase.from("lead_tags").insert({
        name: newTagName.trim(),
        color: selectedColor,
        organization_id: orgData,
      });

      if (error) {
        if (error.code === "23505") {
          toast({
            title: "Etiqueta já existe",
            description: "Já existe uma etiqueta com esse nome",
            variant: "destructive",
          });
          return;
        }
        throw error;
      }

      toast({
        title: "Sucesso",
        description: "Etiqueta criada com sucesso",
      });

      setNewTagName("");
      setSelectedColor(DEFAULT_COLORS[0]);
      loadTags();
      onTagsChanged?.();
    } catch (error: any) {
      console.error("Erro ao criar etiqueta:", error);
      toast({
        title: "Erro",
        description: "Não foi possível criar a etiqueta",
        variant: "destructive",
      });
    }
  };

  const handleUpdateTag = async (tagId: string, updates: Partial<Tag>) => {
    try {
      const { error } = await supabase
        .from("lead_tags")
        .update(updates)
        .eq("id", tagId);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Etiqueta atualizada com sucesso",
      });

      setEditingTag(null);
      loadTags();
      onTagsChanged?.();
    } catch (error: any) {
      console.error("Erro ao atualizar etiqueta:", error);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar a etiqueta",
        variant: "destructive",
      });
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    if (!confirm("Deseja realmente excluir esta etiqueta? Ela será removida de todos os leads.")) {
      return;
    }

    try {
      const { error } = await supabase.from("lead_tags").delete().eq("id", tagId);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Etiqueta excluída com sucesso",
      });

      loadTags();
      onTagsChanged?.();
    } catch (error: any) {
      console.error("Erro ao excluir etiqueta:", error);
      toast({
        title: "Erro",
        description: "Não foi possível excluir a etiqueta",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar Etiquetas</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Criar nova etiqueta */}
          <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
            <h3 className="font-semibold">Nova Etiqueta</h3>
            <div className="space-y-2">
              <Label htmlFor="tag-name">Nome</Label>
              <Input
                id="tag-name"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Ex: Cliente VIP, Urgente..."
                maxLength={50}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setSelectedColor(color)}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      selectedColor === color ? "border-foreground scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>

            <Button onClick={handleCreateTag} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Criar Etiqueta
            </Button>
          </div>

          {/* Lista de etiquetas */}
          <div className="space-y-2">
            <h3 className="font-semibold">Etiquetas Existentes ({tags.length})</h3>
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : tags.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma etiqueta criada ainda</p>
            ) : (
              <div className="space-y-2">
                {tags.map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-center gap-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    {editingTag?.id === tag.id ? (
                      <>
                        <Input
                          value={editingTag.name}
                          onChange={(e) =>
                            setEditingTag({ ...editingTag, name: e.target.value })
                          }
                          className="flex-1"
                        />
                        <div className="flex gap-1">
                          {DEFAULT_COLORS.map((color) => (
                            <button
                              key={color}
                              onClick={() =>
                                setEditingTag({ ...editingTag, color })
                              }
                              className={`w-6 h-6 rounded-full border ${
                                editingTag.color === color ? "border-foreground" : "border-transparent"
                              }`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                        <Button
                          size="sm"
                          onClick={() =>
                            handleUpdateTag(tag.id, {
                              name: editingTag.name,
                              color: editingTag.color,
                            })
                          }
                        >
                          Salvar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingTag(null)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Badge
                          style={{
                            backgroundColor: tag.color,
                            color: "white",
                          }}
                          className="flex-1"
                        >
                          {tag.name}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingTag(tag)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteTag(tag.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
