import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Camera, Users, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface Member {
  user_id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
}

interface Team {
  id: string;
  name: string;
  description?: string;
  color: string;
  leader_id?: string;
  avatar_url?: string;
}

interface EditTeamModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: Team | null;
  organizationId: string;
  members: Member[];
}

const TEAM_COLORS = [
  { name: "Azul", value: "#3B82F6" },
  { name: "Verde", value: "#10B981" },
  { name: "Roxo", value: "#8B5CF6" },
  { name: "Rosa", value: "#EC4899" },
  { name: "Laranja", value: "#F97316" },
  { name: "Vermelho", value: "#EF4444" },
  { name: "Amarelo", value: "#EAB308" },
  { name: "Ciano", value: "#06B6D4" },
];

export function EditTeamModal({ open, onOpenChange, team, organizationId, members }: EditTeamModalProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    color: "#3B82F6",
    leader_id: "",
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  useEffect(() => {
    if (team && open) {
      setFormData({
        name: team.name,
        description: team.description || "",
        color: team.color,
        leader_id: team.leader_id || "",
      });
      setAvatarPreview(team.avatar_url || null);
      setAvatarFile(null);
    }
  }, [team, open]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!team) return;
    if (!formData.name.trim()) {
      toast.error("Nome da equipe é obrigatório");
      return;
    }

    setLoading(true);
    try {
      let avatarUrl = team.avatar_url;

      // Upload new avatar if selected
      if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const filePath = `${organizationId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('team-avatars')
          .upload(filePath, avatarFile);

        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from('team-avatars')
            .getPublicUrl(filePath);
          avatarUrl = publicUrl;
        }
      }

      // Update team
      const { error: teamError } = await supabase
        .from('teams')
        .update({
          name: formData.name,
          description: formData.description || null,
          color: formData.color,
          leader_id: formData.leader_id && formData.leader_id !== "none" ? formData.leader_id : null,
          avatar_url: avatarUrl,
        })
        .eq('id', team.id);

      if (teamError) throw teamError;

      // Update leader in team_members if changed
      const oldLeaderId = team.leader_id;
      const newLeaderId = formData.leader_id && formData.leader_id !== "none" ? formData.leader_id : null;
      
      if (newLeaderId !== oldLeaderId) {
        // Remove old leader role
        if (oldLeaderId) {
          await supabase
            .from('team_members')
            .update({ role: 'member' })
            .eq('team_id', team.id)
            .eq('user_id', oldLeaderId);
        }

        // Set new leader
        if (newLeaderId) {
          // Check if already a member
          const { data: existingMember } = await supabase
            .from('team_members')
            .select('id')
            .eq('team_id', team.id)
            .eq('user_id', newLeaderId)
            .maybeSingle();

          if (existingMember) {
            await supabase
              .from('team_members')
              .update({ role: 'leader' })
              .eq('id', existingMember.id);
          } else {
            await supabase
              .from('team_members')
              .insert({
                team_id: team.id,
                user_id: newLeaderId,
                role: 'leader',
              });
          }
        }
      }

      toast.success("Equipe atualizada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error updating team:', error);
      toast.error("Erro ao atualizar equipe: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!team) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from('teams')
        .delete()
        .eq('id', team.id);

      if (error) throw error;

      toast.success("Equipe excluída com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error deleting team:', error);
      toast.error("Erro ao excluir equipe: " + error.message);
    } finally {
      setDeleting(false);
    }
  };

  if (!team) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Equipe</DialogTitle>
          <DialogDescription>
            Atualize as informações da equipe
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Avatar Upload */}
          <div className="flex justify-center">
            <div className="relative">
              <Avatar className="h-24 w-24">
                <AvatarImage src={avatarPreview || undefined} />
                <AvatarFallback 
                  className="text-white text-2xl"
                  style={{ backgroundColor: formData.color }}
                >
                  <Users className="h-10 w-10" />
                </AvatarFallback>
              </Avatar>
              <label
                htmlFor="avatar-edit-upload"
                className="absolute bottom-0 right-0 p-2 bg-primary text-primary-foreground rounded-full cursor-pointer hover:bg-primary/90 transition-colors"
              >
                <Camera className="h-4 w-4" />
                <input
                  id="avatar-edit-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </label>
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="edit-name">Nome da Equipe *</Label>
            <Input
              id="edit-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Vendas Premium"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="edit-description">Descrição</Label>
            <Textarea
              id="edit-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descrição da equipe (opcional)"
              rows={2}
            />
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label>Cor da Equipe</Label>
            <div className="flex flex-wrap gap-2">
              {TEAM_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, color: color.value })}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    formData.color === color.value ? "border-foreground scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                />
              ))}
            </div>
          </div>

          {/* Leader */}
          <div className="space-y-2">
            <Label>Líder da Equipe</Label>
            <Select
              value={formData.leader_id}
              onValueChange={(value) => setFormData({ ...formData, leader_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o líder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {members.map((member) => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.full_name || member.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-between">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir Equipe</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja excluir a equipe "{team.name}"? 
                  Todos os membros serão removidos da equipe. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={deleting}>
                  {deleting ? "Excluindo..." : "Excluir"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
