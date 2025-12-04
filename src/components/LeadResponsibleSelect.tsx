import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserCircle } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

interface Colaborador {
  user_id: string | null;
  email: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
}

interface LeadResponsibleSelectProps {
  leadId: string;
  currentResponsibleUserId?: string | null;
  currentResponsible?: string | null; // Mantido para compatibilidade
  onUpdate?: () => void;
}

export function LeadResponsibleSelect({ 
  leadId, 
  currentResponsibleUserId,
  currentResponsible, 
  onUpdate 
}: LeadResponsibleSelectProps) {
  const permissions = usePermissions();
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

      // Buscar profiles para pegar os nomes completos e avatares
      const userIds = members?.filter(m => m.user_id).map(m => m.user_id) || [];
      
      let profilesMap: { [key: string]: { full_name: string | null; avatar_url: string | null } } = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, avatar_url')
          .in('user_id', userIds);
        
        if (profiles) {
          profilesMap = profiles.reduce((acc, profile) => {
            if (profile.user_id) {
              acc[profile.user_id] = {
                full_name: profile.full_name,
                avatar_url: profile.avatar_url
              };
            }
            return acc;
          }, {} as { [key: string]: { full_name: string | null; avatar_url: string | null } });
        }
      }

      // Combinar dados
      const colaboradoresWithNames = members?.map(m => ({
        user_id: m.user_id,
        email: m.email,
        full_name: m.user_id && profilesMap[m.user_id] ? profilesMap[m.user_id].full_name : null,
        avatar_url: m.user_id && profilesMap[m.user_id] ? profilesMap[m.user_id].avatar_url : null
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
      
      // Buscar o colaborador selecionado
      const colaborador = colaboradores.find(c => c.user_id === userId);
      const responsibleName = colaborador?.full_name || colaborador?.email || '';

      // Atualizar com UUID e TEXT para compatibilidade
      const { error } = await supabase
        .from('leads')
        .update({ 
          responsavel_user_id: userId === 'none' ? null : userId,
          responsavel: userId === 'none' ? null : responsibleName // Mantém TEXT para compatibilidade
        })
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

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Buscar colaborador por UUID (prioridade) ou por nome (fallback)
  const currentColaborador = colaboradores.find(c => 
    (currentResponsibleUserId && c.user_id === currentResponsibleUserId) ||
    (!currentResponsibleUserId && (c.full_name === currentResponsible || c.email === currentResponsible))
  );

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
      value={currentColaborador?.user_id || "none"}
      onValueChange={handleResponsibleChange}
      disabled={updating || !permissions.canAssignLeads}
    >
      <SelectTrigger className="h-8 w-full max-w-[200px] border-none bg-transparent hover:bg-muted/50 text-xs focus:ring-1 focus:ring-primary/20">
        {currentColaborador ? (
          <div className="flex items-center gap-2">
            <Avatar className="h-5 w-5">
              {currentColaborador.avatar_url && (
                <AvatarImage 
                  src={currentColaborador.avatar_url} 
                  alt={currentColaborador.full_name || currentColaborador.email || ''} 
                />
              )}
              <AvatarFallback className="text-[10px] bg-muted">
                {getInitials(currentColaborador.full_name || currentColaborador.email || 'NC')}
              </AvatarFallback>
            </Avatar>
            <span className="truncate">
              {currentColaborador.full_name || currentColaborador.email}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <UserCircle className="h-4 w-4 text-muted-foreground" />
            <span>Sem responsável</span>
          </div>
        )}
      </SelectTrigger>
      <SelectContent className="bg-background z-50">
        <SelectItem value="none" className="text-xs">
          <div className="flex items-center gap-2">
            <UserCircle className="h-4 w-4 text-muted-foreground" />
            <span>Sem responsável</span>
          </div>
        </SelectItem>
        {colaboradores.map((colaborador) => (
          <SelectItem 
            key={colaborador.user_id || colaborador.email} 
            value={colaborador.user_id || "none"}
            className="text-xs"
          >
            <div className="flex items-center gap-2">
              <Avatar className="h-5 w-5">
                {colaborador.avatar_url && (
                  <AvatarImage 
                    src={colaborador.avatar_url} 
                    alt={colaborador.full_name || colaborador.email || ''} 
                  />
                )}
                <AvatarFallback className="text-[10px] bg-muted">
                  {getInitials(colaborador.full_name || colaborador.email || 'NC')}
                </AvatarFallback>
              </Avatar>
              <span>{colaborador.full_name || colaborador.email || "Sem nome"}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
