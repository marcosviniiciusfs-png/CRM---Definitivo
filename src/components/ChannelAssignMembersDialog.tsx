import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";

interface OrgMember {
  user_id: string;
  email: string;
  role: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId: string;
  channelName: string;
  organizationId: string;
}

/**
 * Dialog para o owner/admin atribuir colaboradores a um canal WhatsApp.
 * - Lista apenas members ativos da organizacao (owner/admin sao excluidos da
 *   selecao porque automaticamente veem todos os canais).
 * - Salva via UPSERT/DELETE em whatsapp_channel_members.
 */
export function ChannelAssignMembersDialog({
  open,
  onOpenChange,
  channelId,
  channelName,
  organizationId,
}: Props) {
  const { toast } = useToast();
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initialSelected, setInitialSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);

      // 1) Buscar todos os members ativos da org (qualquer role).
      // Nota: a query do RLS pode bloquear ler organization_members de outros
      // users — entao usamos a RPC mascarada ja existente que retorna nome
      // mascarado para members + email + role basico.
      const { data: orgMembersData } = await supabase
        .from("organization_members")
        .select("user_id, email, role, is_active")
        .eq("organization_id", organizationId)
        .eq("is_active", true);

      if (cancelled) return;

      const filteredMembers = (orgMembersData || []).filter(
        (m: any) => m.user_id && m.role !== "owner" && m.role !== "admin"
      );

      // 2) Buscar profiles para nomes e avatares.
      const userIds = filteredMembers.map((m: any) => m.user_id);
      let profilesMap = new Map<string, { full_name: string | null; avatar_url: string | null }>();

      if (userIds.length > 0) {
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("user_id, full_name, avatar_url")
          .in("user_id", userIds);

        (profilesData || []).forEach((p: any) => {
          if (p.user_id) {
            profilesMap.set(p.user_id, {
              full_name: p.full_name,
              avatar_url: p.avatar_url,
            });
          }
        });
      }

      const enriched: OrgMember[] = filteredMembers.map((m: any) => ({
        user_id: m.user_id,
        email: m.email || "",
        role: m.role || "member",
        full_name: profilesMap.get(m.user_id)?.full_name ?? null,
        avatar_url: profilesMap.get(m.user_id)?.avatar_url ?? null,
      }));

      setMembers(enriched);

      // 3) Buscar atribuicoes atuais do canal.
      const { data: assignedData } = await supabase
        .from("whatsapp_channel_members")
        .select("user_id")
        .eq("whatsapp_instance_id", channelId);

      if (cancelled) return;

      const assignedIds = new Set<string>((assignedData || []).map((a: any) => a.user_id));
      setSelected(assignedIds);
      setInitialSelected(assignedIds);
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [open, channelId, organizationId]);

  const toggle = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const toAdd: string[] = [];
      const toRemove: string[] = [];

      selected.forEach((id) => {
        if (!initialSelected.has(id)) toAdd.push(id);
      });
      initialSelected.forEach((id) => {
        if (!selected.has(id)) toRemove.push(id);
      });

      // Insercoes (upsert para idempotencia).
      if (toAdd.length > 0) {
        const rows = toAdd.map((user_id) => ({
          whatsapp_instance_id: channelId,
          user_id,
          organization_id: organizationId,
        }));
        const { error } = await supabase
          .from("whatsapp_channel_members")
          .upsert(rows, { onConflict: "whatsapp_instance_id,user_id" });
        if (error) throw error;
      }

      // Remocoes.
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("whatsapp_channel_members")
          .delete()
          .eq("whatsapp_instance_id", channelId)
          .in("user_id", toRemove);
        if (error) throw error;
      }

      toast({
        title: "Atribuições salvas",
        description: `${selected.size} colaborador(es) atribuído(s) ao canal "${channelName}".`,
      });
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Erro ao salvar atribuições",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const dirty =
    selected.size !== initialSelected.size ||
    [...selected].some((id) => !initialSelected.has(id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">
          Atribuir colaboradores ao canal {channelName}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Selecione os colaboradores que devem ter acesso a este canal.
        </DialogDescription>

        <div className="px-5 py-4 border-b">
          <h3 className="font-semibold text-[15px]">Atribuir colaboradores</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Canal: <span className="font-medium">{channelName}</span>
          </p>
        </div>

        <div className="px-2 py-2 border-b bg-muted/40">
          <p className="text-[11px] text-muted-foreground px-3 py-1.5">
            ℹ️ Owner e admins veem todos os canais automaticamente — não aparecem aqui.
          </p>
        </div>

        <div className="px-2 py-2 max-h-[340px] overflow-y-auto">
          {loading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : members.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nenhum colaborador na organização.
            </div>
          ) : (
            members.map((m) => {
              const checked = selected.has(m.user_id);
              const displayName = m.full_name || m.email || "Sem nome";
              return (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => toggle(m.user_id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-accent transition-colors ${
                    checked ? "bg-primary/5" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    readOnly
                    className="h-4 w-4 rounded border-input text-primary focus:ring-0"
                  />
                  <Avatar className="h-7 w-7">
                    {m.avatar_url ? <AvatarImage src={m.avatar_url} /> : null}
                    <AvatarFallback className="text-[10px]">
                      {displayName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-[13px] font-medium truncate">{displayName}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{m.email}</div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-3 border-t flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!dirty || saving}
          >
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
