import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Shield, Pencil, Trash2, Users, Loader2, Kanban, MessageCircle, LayoutGrid, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CustomRole {
  id: string;
  name: string;
  description: string | null;
  color: string;
  can_view_kanban: boolean;
  can_create_tasks: boolean;
  can_edit_own_tasks: boolean;
  can_edit_all_tasks: boolean;
  can_delete_tasks: boolean;
  can_view_all_leads: boolean;
  can_view_assigned_leads: boolean;
  can_create_leads: boolean;
  can_edit_leads: boolean;
  can_delete_leads: boolean;
  can_assign_leads: boolean;
  can_view_pipeline: boolean;
  can_move_leads_pipeline: boolean;
  can_view_chat: boolean;
  can_send_messages: boolean;
  can_view_all_conversations: boolean;
  can_manage_collaborators: boolean;
  can_manage_integrations: boolean;
  can_manage_tags: boolean;
  can_manage_automations: boolean;
  can_view_reports: boolean;
  created_at: string;
  member_count?: number;
}

interface RoleManagementTabProps {
  organizationId: string;
  userRole: string | null;
}

const defaultRoleData: Omit<CustomRole, 'id' | 'created_at' | 'member_count'> = {
  name: "",
  description: "",
  color: "#6B7280",
  can_view_kanban: true,
  can_create_tasks: false,
  can_edit_own_tasks: true,
  can_edit_all_tasks: false,
  can_delete_tasks: false,
  can_view_all_leads: false,
  can_view_assigned_leads: true,
  can_create_leads: false,
  can_edit_leads: false,
  can_delete_leads: false,
  can_assign_leads: false,
  can_view_pipeline: true,
  can_move_leads_pipeline: false,
  can_view_chat: true,
  can_send_messages: true,
  can_view_all_conversations: false,
  can_manage_collaborators: false,
  can_manage_integrations: false,
  can_manage_tags: false,
  can_manage_automations: false,
  can_view_reports: false,
};

const colorOptions = [
  "#6B7280", // Gray
  "#EF4444", // Red
  "#F97316", // Orange
  "#EAB308", // Yellow
  "#22C55E", // Green
  "#14B8A6", // Teal
  "#3B82F6", // Blue
  "#6366F1", // Indigo
  "#8B5CF6", // Violet
  "#EC4899", // Pink
];

export const RoleManagementTab = ({ organizationId, userRole }: RoleManagementTabProps) => {
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<CustomRole | null>(null);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  const [formData, setFormData] = useState(defaultRoleData);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const isOwner = userRole === 'owner';

  useEffect(() => {
    loadRoles();
  }, [organizationId]);

  const loadRoles = async () => {
    setIsLoading(true);
    try {
      // Fetch roles
      const { data: rolesData, error } = await supabase
        .from("organization_custom_roles")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Fetch member count for each role
      const { data: members } = await supabase
        .from("organization_members")
        .select("custom_role_id")
        .eq("organization_id", organizationId)
        .not("custom_role_id", "is", null);

      const memberCountMap = members?.reduce((acc, m) => {
        if (m.custom_role_id) {
          acc[m.custom_role_id] = (acc[m.custom_role_id] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>) || {};

      const rolesWithCount = (rolesData || []).map(role => ({
        ...role,
        member_count: memberCountMap[role.id] || 0,
      }));

      setRoles(rolesWithCount);
    } catch (error: any) {
      console.error("Error loading roles:", error);
      toast({
        title: "Erro ao carregar cargos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenCreateDialog = () => {
    setEditingRole(null);
    setFormData(defaultRoleData);
    setIsDialogOpen(true);
  };

  const handleOpenEditDialog = (role: CustomRole) => {
    setEditingRole(role);
    setFormData({
      name: role.name,
      description: role.description || "",
      color: role.color,
      can_view_kanban: role.can_view_kanban,
      can_create_tasks: role.can_create_tasks,
      can_edit_own_tasks: role.can_edit_own_tasks,
      can_edit_all_tasks: role.can_edit_all_tasks,
      can_delete_tasks: role.can_delete_tasks,
      can_view_all_leads: role.can_view_all_leads,
      can_view_assigned_leads: role.can_view_assigned_leads,
      can_create_leads: role.can_create_leads,
      can_edit_leads: role.can_edit_leads,
      can_delete_leads: role.can_delete_leads,
      can_assign_leads: role.can_assign_leads,
      can_view_pipeline: role.can_view_pipeline,
      can_move_leads_pipeline: role.can_move_leads_pipeline,
      can_view_chat: role.can_view_chat,
      can_send_messages: role.can_send_messages,
      can_view_all_conversations: role.can_view_all_conversations,
      can_manage_collaborators: role.can_manage_collaborators,
      can_manage_integrations: role.can_manage_integrations,
      can_manage_tags: role.can_manage_tags,
      can_manage_automations: role.can_manage_automations,
      can_view_reports: role.can_view_reports,
    });
    setIsDialogOpen(true);
  };

  const handleSaveRole = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Erro",
        description: "O nome do cargo é obrigatório",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      if (editingRole) {
        // Update existing role
        const { error } = await supabase
          .from("organization_custom_roles")
          .update({
            name: formData.name.trim(),
            description: formData.description || null,
            color: formData.color,
            can_view_kanban: formData.can_view_kanban,
            can_create_tasks: formData.can_create_tasks,
            can_edit_own_tasks: formData.can_edit_own_tasks,
            can_edit_all_tasks: formData.can_edit_all_tasks,
            can_delete_tasks: formData.can_delete_tasks,
            can_view_all_leads: formData.can_view_all_leads,
            can_view_assigned_leads: formData.can_view_assigned_leads,
            can_create_leads: formData.can_create_leads,
            can_edit_leads: formData.can_edit_leads,
            can_delete_leads: formData.can_delete_leads,
            can_assign_leads: formData.can_assign_leads,
            can_view_pipeline: formData.can_view_pipeline,
            can_move_leads_pipeline: formData.can_move_leads_pipeline,
            can_view_chat: formData.can_view_chat,
            can_send_messages: formData.can_send_messages,
            can_view_all_conversations: formData.can_view_all_conversations,
            can_manage_collaborators: formData.can_manage_collaborators,
            can_manage_integrations: formData.can_manage_integrations,
            can_manage_tags: formData.can_manage_tags,
            can_manage_automations: formData.can_manage_automations,
            can_view_reports: formData.can_view_reports,
          })
          .eq("id", editingRole.id);

        if (error) throw error;

        toast({
          title: "Cargo atualizado!",
          description: `O cargo "${formData.name}" foi atualizado com sucesso.`,
        });
      } else {
        // Create new role
        const { error } = await supabase
          .from("organization_custom_roles")
          .insert({
            organization_id: organizationId,
            name: formData.name.trim(),
            description: formData.description || null,
            color: formData.color,
            can_view_kanban: formData.can_view_kanban,
            can_create_tasks: formData.can_create_tasks,
            can_edit_own_tasks: formData.can_edit_own_tasks,
            can_edit_all_tasks: formData.can_edit_all_tasks,
            can_delete_tasks: formData.can_delete_tasks,
            can_view_all_leads: formData.can_view_all_leads,
            can_view_assigned_leads: formData.can_view_assigned_leads,
            can_create_leads: formData.can_create_leads,
            can_edit_leads: formData.can_edit_leads,
            can_delete_leads: formData.can_delete_leads,
            can_assign_leads: formData.can_assign_leads,
            can_view_pipeline: formData.can_view_pipeline,
            can_move_leads_pipeline: formData.can_move_leads_pipeline,
            can_view_chat: formData.can_view_chat,
            can_send_messages: formData.can_send_messages,
            can_view_all_conversations: formData.can_view_all_conversations,
            can_manage_collaborators: formData.can_manage_collaborators,
            can_manage_integrations: formData.can_manage_integrations,
            can_manage_tags: formData.can_manage_tags,
            can_manage_automations: formData.can_manage_automations,
            can_view_reports: formData.can_view_reports,
          });

        if (error) throw error;

        toast({
          title: "Cargo criado!",
          description: `O cargo "${formData.name}" foi criado com sucesso.`,
        });
      }

      setIsDialogOpen(false);
      await loadRoles();
    } catch (error: any) {
      console.error("Error saving role:", error);
      toast({
        title: "Erro ao salvar cargo",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!roleToDelete) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("organization_custom_roles")
        .delete()
        .eq("id", roleToDelete.id);

      if (error) throw error;

      toast({
        title: "Cargo excluído",
        description: `O cargo "${roleToDelete.name}" foi excluído.`,
      });

      setIsDeleteDialogOpen(false);
      setRoleToDelete(null);
      await loadRoles();
    } catch (error: any) {
      console.error("Error deleting role:", error);
      toast({
        title: "Erro ao excluir cargo",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const PermissionCheckbox = ({ 
    id, 
    label, 
    checked, 
    onChange 
  }: { 
    id: string; 
    label: string; 
    checked: boolean; 
    onChange: (checked: boolean) => void;
  }) => (
    <div className="flex items-center space-x-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={onChange}
      />
      <Label htmlFor={id} className="text-sm cursor-pointer">{label}</Label>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Cargos Personalizados</h3>
          <p className="text-sm text-muted-foreground">
            Crie cargos com permissões específicas para seus colaboradores
          </p>
        </div>
        {isOwner && (
          <Button onClick={handleOpenCreateDialog} className="gap-2">
            <Plus className="h-4 w-4" />
            Criar Cargo
          </Button>
        )}
      </div>

      {/* Roles Grid */}
      {roles.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Shield className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-center">
              Nenhum cargo personalizado criado ainda.
              <br />
              {isOwner ? "Clique em \"Criar Cargo\" para começar." : "Aguarde o proprietário criar cargos."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map((role) => (
            <Card key={role.id} className="relative overflow-hidden">
              <div 
                className="absolute top-0 left-0 right-0 h-1" 
                style={{ backgroundColor: role.color }}
              />
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: role.color }}
                    />
                    <CardTitle className="text-base">{role.name}</CardTitle>
                  </div>
                  {isOwner && (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleOpenEditDialog(role)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => {
                          setRoleToDelete(role);
                          setIsDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
                {role.description && (
                  <CardDescription className="text-xs mt-1">
                    {role.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>{role.member_count || 0} membro(s)</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-3">
                  {role.can_view_kanban && (
                    <Badge variant="outline" className="text-xs">Kanban</Badge>
                  )}
                  {role.can_view_chat && (
                    <Badge variant="outline" className="text-xs">Chat</Badge>
                  )}
                  {role.can_view_pipeline && (
                    <Badge variant="outline" className="text-xs">Pipeline</Badge>
                  )}
                  {role.can_view_all_leads && (
                    <Badge variant="outline" className="text-xs">Todos Leads</Badge>
                  )}
                  {role.can_view_reports && (
                    <Badge variant="outline" className="text-xs">Relatórios</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              {editingRole ? "Editar Cargo" : "Criar Novo Cargo"}
            </DialogTitle>
            <DialogDescription>
              Configure as permissões que os membros com este cargo terão.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 max-h-[calc(85vh-180px)] pr-4">
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Nome do Cargo *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Vendedor, Gerente, Atendente..."
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    value={formData.description || ""}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Descreva as responsabilidades deste cargo..."
                    className="mt-1"
                    rows={2}
                  />
                </div>
                <div>
                  <Label>Cor do Cargo</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {colorOptions.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 transition-all flex-shrink-0 ${
                          formData.color === color 
                            ? "border-foreground scale-110 ring-2 ring-offset-2 ring-foreground/30" 
                            : "border-transparent hover:scale-105"
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setFormData({ ...formData, color })}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Kanban Permissions */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Kanban className="h-4 w-4" />
                  Tarefas / Kanban
                </div>
                <div className="grid grid-cols-2 gap-3 pl-6">
                  <PermissionCheckbox
                    id="can_view_kanban"
                    label="Visualizar quadro Kanban"
                    checked={formData.can_view_kanban}
                    onChange={(v) => setFormData({ ...formData, can_view_kanban: v })}
                  />
                  <PermissionCheckbox
                    id="can_create_tasks"
                    label="Criar tarefas"
                    checked={formData.can_create_tasks}
                    onChange={(v) => setFormData({ ...formData, can_create_tasks: v })}
                  />
                  <PermissionCheckbox
                    id="can_edit_own_tasks"
                    label="Editar próprias tarefas"
                    checked={formData.can_edit_own_tasks}
                    onChange={(v) => setFormData({ ...formData, can_edit_own_tasks: v })}
                  />
                  <PermissionCheckbox
                    id="can_edit_all_tasks"
                    label="Editar todas as tarefas"
                    checked={formData.can_edit_all_tasks}
                    onChange={(v) => setFormData({ ...formData, can_edit_all_tasks: v })}
                  />
                  <PermissionCheckbox
                    id="can_delete_tasks"
                    label="Excluir tarefas"
                    checked={formData.can_delete_tasks}
                    onChange={(v) => setFormData({ ...formData, can_delete_tasks: v })}
                  />
                </div>
              </div>

              <Separator />

              {/* Leads Permissions */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4" />
                  Leads
                </div>
                <div className="grid grid-cols-2 gap-3 pl-6">
                  <PermissionCheckbox
                    id="can_view_assigned_leads"
                    label="Ver leads atribuídos"
                    checked={formData.can_view_assigned_leads}
                    onChange={(v) => setFormData({ ...formData, can_view_assigned_leads: v })}
                  />
                  <PermissionCheckbox
                    id="can_view_all_leads"
                    label="Ver TODOS os leads"
                    checked={formData.can_view_all_leads}
                    onChange={(v) => setFormData({ ...formData, can_view_all_leads: v })}
                  />
                  <PermissionCheckbox
                    id="can_create_leads"
                    label="Criar leads"
                    checked={formData.can_create_leads}
                    onChange={(v) => setFormData({ ...formData, can_create_leads: v })}
                  />
                  <PermissionCheckbox
                    id="can_edit_leads"
                    label="Editar leads"
                    checked={formData.can_edit_leads}
                    onChange={(v) => setFormData({ ...formData, can_edit_leads: v })}
                  />
                  <PermissionCheckbox
                    id="can_delete_leads"
                    label="Excluir leads"
                    checked={formData.can_delete_leads}
                    onChange={(v) => setFormData({ ...formData, can_delete_leads: v })}
                  />
                  <PermissionCheckbox
                    id="can_assign_leads"
                    label="Atribuir leads a outros"
                    checked={formData.can_assign_leads}
                    onChange={(v) => setFormData({ ...formData, can_assign_leads: v })}
                  />
                </div>
              </div>

              <Separator />

              {/* Pipeline Permissions */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <LayoutGrid className="h-4 w-4" />
                  Pipeline
                </div>
                <div className="grid grid-cols-2 gap-3 pl-6">
                  <PermissionCheckbox
                    id="can_view_pipeline"
                    label="Visualizar pipeline"
                    checked={formData.can_view_pipeline}
                    onChange={(v) => setFormData({ ...formData, can_view_pipeline: v })}
                  />
                  <PermissionCheckbox
                    id="can_move_leads_pipeline"
                    label="Mover leads no pipeline"
                    checked={formData.can_move_leads_pipeline}
                    onChange={(v) => setFormData({ ...formData, can_move_leads_pipeline: v })}
                  />
                </div>
              </div>

              <Separator />

              {/* Chat Permissions */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <MessageCircle className="h-4 w-4" />
                  Chat
                </div>
                <div className="grid grid-cols-2 gap-3 pl-6">
                  <PermissionCheckbox
                    id="can_view_chat"
                    label="Acessar chat"
                    checked={formData.can_view_chat}
                    onChange={(v) => setFormData({ ...formData, can_view_chat: v })}
                  />
                  <PermissionCheckbox
                    id="can_send_messages"
                    label="Enviar mensagens"
                    checked={formData.can_send_messages}
                    onChange={(v) => setFormData({ ...formData, can_send_messages: v })}
                  />
                  <PermissionCheckbox
                    id="can_view_all_conversations"
                    label="Ver TODAS as conversas"
                    checked={formData.can_view_all_conversations}
                    onChange={(v) => setFormData({ ...formData, can_view_all_conversations: v })}
                  />
                </div>
              </div>

              <Separator />

              {/* Admin Permissions */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Settings className="h-4 w-4" />
                  Administração
                </div>
                <div className="grid grid-cols-2 gap-3 pl-6">
                  <PermissionCheckbox
                    id="can_manage_collaborators"
                    label="Gerenciar colaboradores"
                    checked={formData.can_manage_collaborators}
                    onChange={(v) => setFormData({ ...formData, can_manage_collaborators: v })}
                  />
                  <PermissionCheckbox
                    id="can_manage_integrations"
                    label="Gerenciar integrações"
                    checked={formData.can_manage_integrations}
                    onChange={(v) => setFormData({ ...formData, can_manage_integrations: v })}
                  />
                  <PermissionCheckbox
                    id="can_manage_tags"
                    label="Gerenciar tags"
                    checked={formData.can_manage_tags}
                    onChange={(v) => setFormData({ ...formData, can_manage_tags: v })}
                  />
                  <PermissionCheckbox
                    id="can_manage_automations"
                    label="Gerenciar automações"
                    checked={formData.can_manage_automations}
                    onChange={(v) => setFormData({ ...formData, can_manage_automations: v })}
                  />
                  <PermissionCheckbox
                    id="can_view_reports"
                    label="Visualizar relatórios"
                    checked={formData.can_view_reports}
                    onChange={(v) => setFormData({ ...formData, can_view_reports: v })}
                  />
                </div>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="flex-shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveRole} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingRole ? "Salvar Alterações" : "Criar Cargo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Cargo</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir o cargo "{roleToDelete?.name}"?
              {(roleToDelete?.member_count || 0) > 0 && (
                <span className="block mt-2 text-destructive">
                  ⚠️ {roleToDelete?.member_count} membro(s) perderão este cargo.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteRole}
              disabled={isSaving}
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
