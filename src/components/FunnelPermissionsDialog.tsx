import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Users, Lock, Unlock } from "lucide-react";
import { LazyAvatar } from "@/components/ui/lazy-avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface FunnelPermissionsDialogProps {
  funnel: { id: string; name: string; is_restricted?: boolean };
  organizationId: string;
  onClose: () => void;
  onPermissionsChange?: () => void;
}

interface Collaborator {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
  hasAccess: boolean;
}

export function FunnelPermissionsDialog({
  funnel,
  organizationId,
  onClose,
  onPermissionsChange,
}: FunnelPermissionsDialogProps) {
  const [isRestricted, setIsRestricted] = useState(funnel.is_restricted === true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);

  // Carregar estado atual e colaboradores
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Buscar estado do funil
        const { data: funnelData, error: funnelError } = await supabase
          .from("sales_funnels")
          .select("is_restricted")
          .eq("id", funnel.id)
          .single();

        if (funnelError) throw funnelError;
        if (funnelData) {
          setIsRestricted(funnelData.is_restricted ?? false);
        }

        // Buscar membros da organização (apenas members, admins/owners sempre têm acesso)
        const { data: members, error: membersError } = await supabase
          .from("organization_members")
          .select("user_id, role, email, display_name")
          .eq("organization_id", organizationId)
          .eq("role", "member")
          .eq("is_active", true);

        if (membersError) throw membersError;

        // Buscar quem tem acesso ao funil
        const { data: accessList, error: accessError } = await supabase
          .from("funnel_collaborators")
          .select("user_id")
          .eq("funnel_id", funnel.id)
          .eq("organization_id", organizationId);

        if (accessError) throw accessError;

        const accessSet = new Set((accessList || []).map((a) => a.user_id));

        // Buscar profiles dos membros
        const userIds = (members || []).map((m: any) => m.user_id).filter(Boolean);
        let profilesMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {};
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, full_name, avatar_url")
            .in("user_id", userIds);
          if (profiles) {
            profilesMap = profiles.reduce((acc, p) => {
              acc[p.user_id] = { full_name: p.full_name, avatar_url: p.avatar_url };
              return acc;
            }, {} as Record<string, { full_name: string | null; avatar_url: string | null }>);
          }
        }

        const list: Collaborator[] = (members || []).map((m: any) => ({
          user_id: m.user_id,
          full_name:
            profilesMap[m.user_id]?.full_name ||
            m.display_name ||
            m.email ||
            "Sem nome",
          avatar_url: profilesMap[m.user_id]?.avatar_url || null,
          role: m.role,
          hasAccess: accessSet.has(m.user_id),
        }));

        setCollaborators(list);
      } catch (err) {
        console.error("Erro ao carregar dados:", err);
        toast.error("Erro ao carregar permissões");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [funnel.id, organizationId]);

  const toggleRestricted = async (newValue: boolean) => {
    setSaving("funnel");
    try {
      const { data, error } = await supabase
        .from("sales_funnels")
        .update({ is_restricted: newValue })
        .eq("id", funnel.id)
        .eq("organization_id", organizationId)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("O funil não foi alterado. Verifique sua permissão de administrador.");

      setIsRestricted(newValue);
      onPermissionsChange?.();
      toast.success(newValue ? "Funil bloqueado — escolha quem pode ver" : "Funil desbloqueado para todos");
    } catch (err) {
      console.error("Erro ao alterar visibilidade:", err);
      toast.error(err instanceof Error ? err.message : "Não foi possível alterar o acesso ao funil");
    } finally {
      setSaving(null);
    }
  };

  const toggleCollaboratorAccess = async (userId: string, currentAccess: boolean) => {
    setSaving(userId);
    try {
      if (currentAccess) {
        // Remover acesso
        const { data, error } = await supabase
          .from("funnel_collaborators")
          .delete()
          .eq("funnel_id", funnel.id)
          .eq("user_id", userId)
          .eq("organization_id", organizationId)
          .select("id")
          .maybeSingle();

        if (error) throw error;
        if (!data) throw new Error("O acesso não foi removido. Verifique sua permissão de administrador.");
      } else {
        // Conceder acesso
        const { error } = await supabase
          .from("funnel_collaborators")
          .upsert(
            { funnel_id: funnel.id, user_id: userId, organization_id: organizationId },
            { onConflict: "funnel_id,user_id" },
          );

        if (error) throw error;
      }

      setCollaborators((prev) =>
        prev.map((c) => (c.user_id === userId ? { ...c, hasAccess: !currentAccess } : c))
      );
      onPermissionsChange?.();

      toast.success(currentAccess ? "Acesso removido" : "Acesso liberado");
    } catch (err) {
      console.error("Erro ao alterar acesso:", err);
      toast.error(err instanceof Error ? err.message : "Não foi possível alterar o colaborador");
    } finally {
      setSaving(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm gap-0 overflow-hidden p-0" hideCloseButton={false}>
        {/* Header */}
        <DialogHeader className="border-b border-border px-4 py-3 pr-12 text-left">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <DialogTitle className="text-sm">Controle de acesso</DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            Defina quem pode visualizar o funil {funnel.name}.
          </DialogDescription>
        </DialogHeader>

        {/* Funil name */}
        <div className="px-4 py-2 border-b border-border bg-muted/30">
          <p className="text-xs text-muted-foreground">Funil:</p>
          <p className="font-medium text-sm">{funnel.name}</p>
        </div>

        {/* Toggle principal: Bloqueado/Desbloqueado */}
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isRestricted ? (
                <Lock className="h-5 w-5 text-amber-500" />
              ) : (
                <Unlock className="h-5 w-5 text-emerald-500" />
              )}
              <div>
                <Label htmlFor="restrict-funnel" className="font-medium text-sm">
                  {isRestricted ? "Bloqueado" : "Desbloqueado"}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {isRestricted
                    ? "Apenas os selecionados podem ver"
                    : "Todos os colaboradores podem ver"}
                </p>
              </div>
            </div>
            <Switch
              id="restrict-funnel"
              checked={isRestricted}
              onCheckedChange={toggleRestricted}
              disabled={saving === "funnel"}
              aria-label={isRestricted ? "Desbloquear funil" : "Bloquear funil"}
              aria-busy={saving === "funnel"}
            />
          </div>
        </div>

        {/* Lista de colaboradores (só mostra quando bloqueado) */}
        {isRestricted && (
          <div className="overflow-y-auto max-h-[300px]">
            <div className="px-4 py-2 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-xs font-medium text-muted-foreground">
                  Colaboradores com acesso
                </p>
              </div>
            </div>

            {loading ? (
              <div className="px-4 py-4 space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : collaborators.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <Users className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">
                  Nenhum colaborador na organização
                </p>
              </div>
            ) : (
              <div className="px-4 py-2 space-y-1">
                {collaborators.map((collab) => (
                  <div
                    key={collab.user_id}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <LazyAvatar
                        src={collab.avatar_url || undefined}
                        name={collab.full_name}
                        size="sm"
                        className="h-8 w-8"
                      />
                      <div>
                        <p className="text-sm font-medium leading-tight">
                          {collab.full_name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {collab.hasAccess ? (
                            <span className="text-green-500">● Pode ver</span>
                          ) : (
                            <span className="text-red-400">● Não pode ver</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <Switch
                      id={`funnel-access-${collab.user_id}`}
                      checked={collab.hasAccess}
                      onCheckedChange={() =>
                        toggleCollaboratorAccess(collab.user_id, collab.hasAccess)
                      }
                      disabled={saving === collab.user_id}
                      aria-label={`${collab.hasAccess ? "Remover" : "Liberar"} acesso de ${collab.full_name}`}
                      aria-busy={saving === collab.user_id}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Info */}
        <div className="px-4 py-3 border-t border-border bg-muted/20">
          <p className="text-xs text-muted-foreground">
            <strong>Owners e Admins</strong> sempre têm acesso a todos os funis.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
