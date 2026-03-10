import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { fetchOrganizationMembersSafe } from "@/hooks/useOrganizationMembers";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { LoadingAnimation } from "./LoadingAnimation";
import { toast } from "sonner";
import { Users, Lock, Globe } from "lucide-react";

interface Member {
  id: string;
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
}

interface FunnelPermissionsModalProps {
  funnel: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FunnelPermissionsModal({ funnel, open, onOpenChange }: FunnelPermissionsModalProps) {
  const { organizationId } = useOrganization();
  const [members, setMembers] = useState<Member[]>([]);
  const [allowedUserIds, setAllowedUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (open && funnel) {
      loadData();
    }
  }, [open, funnel]);

  const loadData = async () => {
    if (!funnel || !organizationId) return;
    setLoading(true);
    try {
      // Buscar membros da organização (excluindo owners/admins — eles sempre têm acesso)
      const allMembers = await fetchOrganizationMembersSafe();
      const nonAdminMembers = (allMembers || []).filter(
        (m: any) => m.role === 'member' && m.user_id
      ) as Member[];
      setMembers(nonAdminMembers);

      // Buscar permissões existentes para este funil
      const { data: perms } = await supabase
        .from("funnel_permissions")
        .select("user_id")
        .eq("funnel_id", funnel.id);

      setAllowedUserIds(new Set((perms || []).map((p) => p.user_id)));
    } catch (error) {
      console.error("Erro ao carregar permissões do funil:", error);
      toast.error("Erro ao carregar permissões");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (userId: string, currentlyAllowed: boolean) => {
    if (!funnel || !organizationId) return;
    setSaving(userId);
    try {
      if (currentlyAllowed) {
        // Remover permissão
        const { error } = await supabase
          .from("funnel_permissions")
          .delete()
          .eq("funnel_id", funnel.id)
          .eq("user_id", userId);
        if (error) throw error;
        setAllowedUserIds((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
        toast.success("Acesso removido");
      } else {
        // Adicionar permissão
        const { error } = await supabase
          .from("funnel_permissions")
          .insert({ funnel_id: funnel.id, user_id: userId, organization_id: organizationId });
        if (error) throw error;
        setAllowedUserIds((prev) => new Set([...prev, userId]));
        toast.success("Acesso concedido");
      }
    } catch (error: any) {
      console.error("Erro ao atualizar permissão:", error);
      toast.error("Erro ao atualizar permissão");
    } finally {
      setSaving(null);
    }
  };

  const isRestricted = allowedUserIds.size > 0;
  const getInitials = (name: string | null) =>
    (name || "?")
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Permissões do Funil
          </DialogTitle>
          <DialogDescription>
            Funil: <strong>{funnel?.name}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="mb-4">
          <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-md ${isRestricted ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300' : 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300'}`}>
            {isRestricted ? (
              <><Lock className="h-4 w-4 shrink-0" /> Restrito — apenas colaboradores selecionados</>
            ) : (
              <><Globe className="h-4 w-4 shrink-0" /> Aberto — todos os colaboradores podem ver</>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-6"><LoadingAnimation /></div>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhum colaborador (membro) encontrado na organização.
            <br />
            Owners e Admins sempre têm acesso a todos os funis.
          </p>
        ) : (
          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            <p className="text-xs text-muted-foreground mb-3">
              Owners e Admins sempre têm acesso. Ative abaixo para liberar acesso a colaboradores específicos.
            </p>
            {members.map((member) => {
              const allowed = member.user_id ? allowedUserIds.has(member.user_id) : false;
              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      {member.avatar_url && (
                        <AvatarImage src={member.avatar_url} alt={member.full_name || ''} />
                      )}
                      <AvatarFallback className="text-xs bg-muted">
                        {getInitials(member.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{member.full_name || "Sem nome"}</p>
                      <Badge variant="outline" className="text-xs">Colaborador</Badge>
                    </div>
                  </div>
                  <Switch
                    checked={allowed}
                    disabled={saving === member.user_id}
                    onCheckedChange={() => member.user_id && handleToggle(member.user_id, allowed)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
