import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Camera, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface Member {
  user_id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
}

interface CreateTeamModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export function CreateTeamModal({ open, onOpenChange, organizationId, members }: CreateTeamModalProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    color: "#3B82F6",
    leader_id: "",
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setFormData({ name: "", description: "", color: "#3B82F6", leader_id: "" });
      setAvatarFile(null);
      setAvatarPreview(null);
    }
  }, [open]);

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
    if (!formData.name.trim()) {
      toast.error("Nome da equipe é obrigatório");
      return;
    }

    setLoading(true);
    try {
      let avatarUrl = null;

      // Upload avatar if selected
      if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop();
        const fileName = `${crypto.randomUUID()}.${fileExt}`;
        const filePath = `${organizationId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('team-avatars')
          .upload(filePath, avatarFile);

        if (uploadError) {
          console.error('Upload error:', uploadError);
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from('team-avatars')
            .getPublicUrl(filePath);
          avatarUrl = publicUrl;
        }
      }

      // Create team
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .insert({
          organization_id: organizationId,
          name: formData.name,
          description: formData.description || null,
          color: formData.color,
          leader_id: formData.leader_id && formData.leader_id !== "none" ? formData.leader_id : null,
          avatar_url: avatarUrl,
        })
        .select()
        .single();

      if (teamError) throw teamError;

      // If leader selected, add as team member with 'leader' role
      if (formData.leader_id && formData.leader_id !== "none" && team) {
        await supabase
          .from('team_members')
          .insert({
            team_id: team.id,
            user_id: formData.leader_id,
            role: 'leader',
          });
      }

      toast.success("Equipe criada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error creating team:', error);
      toast.error("Erro ao criar equipe: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Equipe</DialogTitle>
          <DialogDescription>
            Crie uma nova equipe e defina seu líder
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
                htmlFor="avatar-upload"
                className="absolute bottom-0 right-0 p-2 bg-primary text-primary-foreground rounded-full cursor-pointer hover:bg-primary/90 transition-colors"
              >
                <Camera className="h-4 w-4" />
                <input
                  id="avatar-upload"
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
            <Label htmlFor="name">Nome da Equipe *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Vendas Premium"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
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

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Criando..." : "Criar Equipe"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
