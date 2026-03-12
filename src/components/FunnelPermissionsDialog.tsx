import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Lock, X, Users } from "lucide-react";
import { LazyAvatar } from "@/components/ui/lazy-avatar";

interface FunnelPermissionsDialogProps {
  funnel: { id: string; name: string; is_restricted?: boolean };
  organizationId: string;
  onClose: () => void;
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
}: FunnelPermissionsDialogProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isRestricted, setIsRestricted] = useState(funnel.is_restricted ?? false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Buscar membros da organização (excluindo owners/admins da lista, pois sempre têm acesso)
      // NOTA: organization_members NÃO tem FK para profiles — usar duas queries separadas
      const { data: members, error: membersError } = await supabase
        .from("organization_members")
        .select("user_id, role, email, display_name")
        .eq("organization_id", organizationId)
        .eq("role", "member");

      if (membersError) throw membersError;

      // Buscar colaboradores com acesso ao funil
      const { data: accessList, error: accessError } = await supabase
        .from("funnel_collaborators")
        .select("user_id")
        .eq("funnel_id", funnel.id)
        .eq("organization_id", organizationId);

      if (accessError) throw accessError;

      const accessSet = new Set((accessList || []).map((a) => a.user_id));

      // Buscar profiles separadamente (sem FK direta)
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
      console.error("Erro ao carregar permissões:", err);
      toast.error("Erro ao carregar permissões do funil");
    } finally {
      setLoading(false);
    }
  }, [funnel.id, organizationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleRestriction = async (newValue: boolean) => {
    try {
      const { error } = await supabase
        .from("sales_funnels")
        .update({ is_restricted: newValue })
        .eq("id", funnel.id);

      if (error) throw error;

      setIsRestricted(newValue);
      toast.success(newValue ? "Funil restrito ativado" : "Funil aberto para todos");
    } catch (err) {
      console.error("Erro ao alterar restrição:", err);
      toast.error("Erro ao salvar configuração");
    }
  };

  const toggleCollaboratorAccess = async (userId: string, currentAccess: boolean) => {
    setSaving(userId);
    try {
      if (currentAccess) {
        // Remover acesso
        const { error } = await supabase
          .from("funnel_collaborators")
          .delete()
          .eq("funnel_id", funnel.id)
          .eq("user_id", userId);

        if (error) throw error;
      } else {
        // Conceder acesso
        const { error } = await supabase
          .from("funnel_collaborators")
          .insert({ funnel_id: funnel.id, user_id: userId, organization_id: organizationId });

        if (error) throw error;
      }

      setCollaborators((prev) =>
        prev.map((c) => (c.user_id === userId ? { ...c, hasAccess: !currentAccess } : c))
      );
    } catch (err) {
      console.error("Erro ao alterar acesso:", err);
      toast.error("Erro ao salvar permissão");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="mt-16 mr-4 w-[340px] rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Permissões do Funil</span>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Funil name */}
        <div className="px-4 py-2 border-b border-border">
          <p className="text-xs text-muted-foreground">Funil:</p>
          <p className="font-medium text-sm">{funnel.name}</p>
        </div>

        {/* Restriction toggle */}
        <div className="px-4 py-3 border-b border-border">
          <button
            onClick={() => toggleRestriction(!isRestricted)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isRestricted
                ? "bg-amber-500/10 text-amber-500 border border-amber-500/30"
                : "bg-muted text-muted-foreground border border-transparent hover:bg-muted/80"
            }`}
          >
            <Lock className="h-3.5 w-3.5" />
            {isRestricted
              ? "Restrito — apenas colaboradores selecionados"
              : "Aberto — todos os colaboradores"}
          </button>
        </div>

        {/* Collaborators list */}
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground mb-3">
            {isRestricted
              ? "Owners e Admins sempre têm acesso. Toggle ligado (🟢) = colaborador pode ver este funil."
              : "Funil aberto — todos os colaboradores podem ver. Para restringir, clique no botão acima."}
          </p>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : collaborators.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhum colaborador encontrado
            </p>
          ) : (
            <div className="space-y-2">
              {collaborators.map((collab) => {
                // Quando funil está ABERTO: todos têm acesso → toggle visualmente ON
                // Quando funil está RESTRITO: toggle reflete o acesso real do colaborador
                const visuallyChecked = !isRestricted ? true : collab.hasAccess;

                return (
                  <div
                    key={collab.user_id}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-2.5">
                      <LazyAvatar
                        src={collab.avatar_url || undefined}
                        name={collab.full_name}
                        size="sm"
                        className="h-8 w-8"
                      />
                      <div>
                        <p className="text-sm font-medium leading-tight">{collab.full_name}</p>
                        <p className="text-[11px] text-muted-foreground capitalize">
                          {collab.role === "member" ? "Colaborador" : collab.role}
                          {!isRestricted && (
                            <span className="ml-1 text-green-500">· acesso liberado</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={visuallyChecked}
                      onCheckedChange={() =>
                        isRestricted && toggleCollaboratorAccess(collab.user_id, collab.hasAccess)
                      }
                      disabled={saving === collab.user_id || !isRestricted}
                      className={!isRestricted ? "opacity-60 cursor-not-allowed" : ""}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
