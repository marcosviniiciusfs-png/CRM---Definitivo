import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserCircle } from "lucide-react";

interface Colaborador {
  user_id: string | null;
  email: string | null;
  full_name?: string | null;
}

interface LeadResponsibleSelectProps {
  leadId: string;
  currentResponsible: string | null;
  onUpdate?: () => void;
}

export function LeadResponsibleSelect({ 
  leadId, 
  currentResponsible, 
  onUpdate 
}: LeadResponsibleSelectProps) {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    loadColaboradores();
  }, []);

  const loadColaboradores = async () => {
    try {
      setLoading(true);
      
      // Buscar colaboradores da organização
      const { data: members, error } = await supabase
        .from('organization_members')
        .select('user_id, email')
        .order('email');

      if (error) throw error;

      // Buscar profiles para pegar os nomes completos
      const userIds = members?.filter(m => m.user_id).map(m => m.user_id) || [];
      
      let profilesMap: { [key: string]: string } = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', userIds);
        
        if (profiles) {
          profilesMap = profiles.reduce((acc, profile) => {
            if (profile.user_id && profile.full_name) {
              acc[profile.user_id] = profile.full_name;
            }
            return acc;
          }, {} as { [key: string]: string });
        }
      }

      // Combinar dados
      const colaboradoresWithNames = members?.map(m => ({
        user_id: m.user_id,
        email: m.email,
        full_name: m.user_id && profilesMap[m.user_id] ? profilesMap[m.user_id] : null
      })) || [];

      setColaboradores(colaboradoresWithNames);
    } catch (error) {
      console.error('Erro ao carregar colaboradores:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResponsibleChange = async (userId: string) => {
    try {
      setUpdating(true);
      
      // Buscar o email do colaborador selecionado
      const colaborador = colaboradores.find(c => c.user_id === userId);
      const responsibleName = colaborador?.full_name || colaborador?.email || userId;

      const { error } = await supabase
        .from('leads')
        .update({ responsavel: responsibleName })
        .eq('id', leadId);

      if (error) throw error;

      toast.success("Responsável atualizado com sucesso!");
      onUpdate?.();
    } catch (error) {
      console.error('Erro ao atualizar responsável:', error);
      toast.error("Erro ao atualizar responsável");
    } finally {
      setUpdating(false);
    }
  };

  const getCurrentValue = () => {
    const colaborador = colaboradores.find(
      c => c.full_name === currentResponsible || c.email === currentResponsible
    );
    return colaborador?.user_id || "none";
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <UserCircle className="h-3 w-3 animate-pulse" />
        <span>Carregando...</span>
      </div>
    );
  }

  return (
    <Select
      value={getCurrentValue()}
      onValueChange={handleResponsibleChange}
      disabled={updating}
    >
      <SelectTrigger className="h-8 w-full max-w-[180px] border-none bg-transparent hover:bg-muted/50 text-xs focus:ring-1 focus:ring-primary/20">
        <div className="flex items-center gap-2">
          <UserCircle className="h-3 w-3 text-muted-foreground" />
          <SelectValue placeholder="Sem responsável" />
        </div>
      </SelectTrigger>
      <SelectContent className="bg-background">
        <SelectItem value="none" className="text-xs">
          Sem responsável
        </SelectItem>
        {colaboradores.map((colaborador) => (
          <SelectItem 
            key={colaborador.user_id || colaborador.email} 
            value={colaborador.user_id || "none"}
            className="text-xs"
          >
            {colaborador.full_name || colaborador.email || "Sem nome"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
