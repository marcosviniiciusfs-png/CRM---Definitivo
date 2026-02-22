import { useState } from "react";
import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { UserCircle, UserPlus, UserMinus, UserX, Users, Search, Loader2, BarChart3, Pencil, Shield, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { CollaboratorDashboard } from "@/components/CollaboratorDashboard";
import { RoleManagementTab } from "@/components/RoleManagementTab";
import { CommissionsTab } from "@/components/CommissionsTab";

const emailSchema = z.string().email({ message: "Email inválido" });

interface Colaborador {
  id: string;
  email: string;
  role: string;
  created_at: string;
  user_id: string | null;
  full_name?: string;
  avatar_url?: string;
  is_active?: boolean;
  display_name?: string;
  custom_role_id?: string | null;
}

interface CustomRoleOption {
  id: string;
  name: string;
  color: string;
}

const Colaboradores = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState("20");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [colaboradorToDelete, setColaboradorToDelete] = useState<Colaborador | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  
  // Edit modal state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [colaboradorToEdit, setColaboradorToEdit] = useState<Colaborador | null>(null);
  const [editData, setEditData] = useState({
    name: "",
    email: "",
    newPassword: "",
    role: "member" as "owner" | "admin" | "member",
    is_active: true,
    custom_role_id: null as string | null
  });
  
  const [newColaborador, setNewColaborador] = useState({
    name: "",
    email: "",
    password: "",
    role: "member" as "owner" | "admin" | "member",
    custom_role_id: null as string | null
  });
  
  const { toast } = useToast();
  const { isReady, organizationId: contextOrgId, user } = useOrganizationReady();
  const queryClient = useQueryClient();
  const [isMutating, setIsMutating] = useState(false);

  const { data: orgData, isLoading: isQueryLoading } = useQuery({
    queryKey: ['colaboradores-data', contextOrgId],
    queryFn: async () => {
      if (!user || !contextOrgId) throw new Error('Not ready');

      const { data: memberData } = await supabase
        .from('organization_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('organization_id', contextOrgId)
        .single();

      const userRole = memberData?.role || null;

      const [membersResult, rolesResult, subResult] = await Promise.all([
        supabase
          .from('organization_members')
          .select('id, user_id, organization_id, role, created_at, email, is_active, display_name, custom_role_id')
          .eq('organization_id', contextOrgId),
        supabase
          .from('organization_custom_roles')
          .select('id, name, color')
          .eq('organization_id', contextOrgId),
        supabase.functions.invoke('check-subscription')
      ]);

      const customRoles: CustomRoleOption[] = rolesResult.data || [];
      if (membersResult.error) throw membersResult.error;

      const members = membersResult.data || [];
      const userIds = members.filter(m => m.user_id).map(m => m.user_id);
      let profilesMap: { [key: string]: { full_name: string | null; avatar_url: string | null } } = {};
      
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, avatar_url')
          .in('user_id', userIds);
        
        if (profiles) {
          profilesMap = profiles.reduce((acc, profile) => {
            acc[profile.user_id] = { full_name: profile.full_name, avatar_url: profile.avatar_url };
            return acc;
          }, {} as { [key: string]: { full_name: string | null; avatar_url: string | null } });
        }
      }
      
      const transformedMembers: Colaborador[] = members.map((member: any) => {
        const profileName = member.user_id && profilesMap[member.user_id] 
          ? profilesMap[member.user_id].full_name : null;
        return {
          ...member,
          is_active: member.is_active ?? true,
          full_name: profileName || member.display_name || null,
          avatar_url: member.user_id && profilesMap[member.user_id] ? profilesMap[member.user_id].avatar_url : null
        };
      });

      // Fetch goals for KPI comparison
      let goalsByUser: Record<string, number> = {};
      try {
        const { data: goalsData } = await supabase
          .from('goals')
          .select('user_id, target_value')
          .eq('organization_id', contextOrgId);
        (goalsData || []).forEach(g => { goalsByUser[g.user_id] = g.target_value; });
      } catch {}

      const now = new Date();
      const thisMonth = now.getMonth();
      const thisYear = now.getFullYear();
      const activeMembers = transformedMembers.filter(m => m.is_active !== false);
      const inactiveMembers = transformedMembers.filter(m => m.is_active === false);
      const novos = activeMembers.filter((m: any) => {
        const createdDate = new Date(m.created_at);
        return createdDate.getMonth() === thisMonth && createdDate.getFullYear() === thisYear;
      }).length;

      const stats = { ativos: activeMembers.length, novos, saidas: 0, inativos: inactiveMembers.length };

      const subData = subResult.data;
      const subscriptionLimits = subData?.subscribed && subData?.total_collaborators
        ? { total: subData.total_collaborators, current: activeMembers.length }
        : null;

      let salesByUser: Record<string, { count: number; revenue: number }> = {};
      let pendingCommissionsByUser: Record<string, number> = {};
      try {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const [wonStagesRes, wonLeadsRes, commissionsRes] = await Promise.all([
          supabase.from('funnel_stages').select('id').eq('stage_type', 'won'),
          supabase.from('leads').select('responsavel_user_id, valor, funnel_stage_id')
            .eq('organization_id', contextOrgId).gte('updated_at', startOfMonth),
          supabase.from('commissions').select('user_id, commission_value, status')
            .eq('organization_id', contextOrgId).eq('status', 'pending')
        ]);
        const wonIds = new Set(wonStagesRes.data?.map(s => s.id) || []);
        const wonLeads = (wonLeadsRes.data || []).filter(l => l.funnel_stage_id && wonIds.has(l.funnel_stage_id));
        wonLeads.forEach(l => {
          if (l.responsavel_user_id) {
            if (!salesByUser[l.responsavel_user_id]) salesByUser[l.responsavel_user_id] = { count: 0, revenue: 0 };
            salesByUser[l.responsavel_user_id].count++;
            salesByUser[l.responsavel_user_id].revenue += l.valor || 0;
          }
        });
        (commissionsRes.data || []).forEach(c => {
          pendingCommissionsByUser[c.user_id] = (pendingCommissionsByUser[c.user_id] || 0) + c.commission_value;
        });
      } catch (e) {
        console.error('Error loading sales KPIs:', e);
      }

      return {
        colaboradores: transformedMembers,
        userRole,
        currentUserId: user.id,
        stats,
        customRoles,
        subscriptionLimits,
        salesByUser,
        pendingCommissionsByUser,
        goalsByUser,
      };
    },
    enabled: isReady && !!contextOrgId && !!user,
    staleTime: 5 * 60 * 1000,
  });

  // Derive state from query data
  const organizationId = contextOrgId;
  const colaboradores = orgData?.colaboradores ?? [];
  const userRole = orgData?.userRole ?? null;
  const currentUserId = orgData?.currentUserId ?? null;
  const stats = orgData?.stats ?? { ativos: 0, novos: 0, saidas: 0, inativos: 0 };
  const customRoles = orgData?.customRoles ?? [];
  const subscriptionLimits = orgData?.subscriptionLimits ?? null;
  const salesByUser = orgData?.salesByUser ?? {};
  const pendingCommissionsByUser = orgData?.pendingCommissionsByUser ?? {};
  const goalsByUser = orgData?.goalsByUser ?? {} as Record<string, number>;
  const isLoading = isQueryLoading || isMutating;

  const invalidateData = () => {
    queryClient.invalidateQueries({ queryKey: ['colaboradores-data'] });
  };

  const handleAddColaborador = async () => {
    try {
      if (userRole !== 'owner' && userRole !== 'admin') {
        toast({ title: "Acesso negado", description: "Apenas proprietários e administradores podem adicionar colaboradores", variant: "destructive" });
        return;
      }
      const validationResult = emailSchema.safeParse(newColaborador.email);
      if (!validationResult.success) {
        toast({ title: "Erro de validação", description: "Por favor, insira um email válido", variant: "destructive" });
        return;
      }
      if (!newColaborador.name.trim()) {
        toast({ title: "Erro de validação", description: "Por favor, insira o nome do colaborador", variant: "destructive" });
        return;
      }
      if (!newColaborador.password || newColaborador.password.length < 6) {
        toast({ title: "Erro de validação", description: "A senha deve ter pelo menos 6 caracteres", variant: "destructive" });
        return;
      }
      if (!organizationId) {
        toast({ title: "Erro", description: "Você precisa fazer login novamente. Sua sessão pode ter expirado.", variant: "destructive" });
        return;
      }

      setIsMutating(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Sessão expirada", description: "Faça login novamente para continuar", variant: "destructive" });
        setIsMutating(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('add-organization-member', {
        body: {
          email: newColaborador.email.toLowerCase().trim(),
          password: newColaborador.password,
          name: newColaborador.name.trim(),
          role: newColaborador.role,
          organizationId: organizationId,
          custom_role_id: newColaborador.custom_role_id || null
        }
      });

      if (error) {
        toast({ title: "Erro ao adicionar colaborador", description: error.message || "Não foi possível adicionar o colaborador. Tente novamente.", variant: "destructive" });
        setIsMutating(false);
        return;
      }
      if (data?.error) {
        toast({ title: "Erro", description: data.error, variant: "destructive" });
        setIsMutating(false);
        return;
      }

      toast({ title: "Sucesso!", description: data?.message || `${newColaborador.name} foi adicionado à organização com sucesso` });
      setIsDialogOpen(false);
      setNewColaborador({ name: "", email: "", password: "", role: "member", custom_role_id: null });
      invalidateData();
    } catch (error: any) {
      toast({ title: "Erro inesperado", description: error?.message || "Ocorreu um erro ao adicionar o colaborador. Por favor, tente novamente.", variant: "destructive" });
    } finally {
      setIsMutating(false);
    }
  };

  const handleEditColaborador = (colaborador: Colaborador) => {
    if (userRole !== 'owner' && userRole !== 'admin') {
      toast({ title: "Acesso negado", description: "Apenas proprietários e administradores podem editar colaboradores", variant: "destructive" });
      return;
    }
    if (userRole === 'admin' && colaborador.role === 'owner') {
      toast({ title: "Acesso negado", description: "Administradores não podem editar proprietários", variant: "destructive" });
      return;
    }
    setColaboradorToEdit(colaborador);
    setEditData({
      name: colaborador.full_name || "",
      email: colaborador.email || "",
      newPassword: "",
      role: colaborador.role as "owner" | "admin" | "member",
      is_active: colaborador.is_active !== false,
      custom_role_id: colaborador.custom_role_id || null
    });
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!colaboradorToEdit) return;
    if (editData.email && editData.email !== colaboradorToEdit.email) {
      const validationResult = emailSchema.safeParse(editData.email);
      if (!validationResult.success) {
        toast({ title: "Erro de validação", description: "Por favor, insira um email válido", variant: "destructive" });
        return;
      }
    }
    if (editData.newPassword && editData.newPassword.length < 6) {
      toast({ title: "Erro de validação", description: "A nova senha deve ter pelo menos 6 caracteres", variant: "destructive" });
      return;
    }

    setIsMutating(true);
    try {
      const { data, error } = await supabase.functions.invoke('update-organization-member', {
        body: {
          memberId: colaboradorToEdit.id,
          name: editData.name || undefined,
          email: editData.email !== colaboradorToEdit.email ? editData.email : undefined,
          newPassword: editData.newPassword || undefined,
          role: editData.role !== colaboradorToEdit.role ? editData.role : undefined,
          is_active: editData.is_active,
          custom_role_id: editData.custom_role_id
        }
      });
      if (error) {
        toast({ title: "Erro ao atualizar", description: error.message || "Não foi possível atualizar o colaborador", variant: "destructive" });
        return;
      }
      if (data?.error) {
        toast({ title: "Erro", description: data.error, variant: "destructive" });
        return;
      }
      toast({ title: "Sucesso!", description: "Colaborador atualizado com sucesso" });
      setIsEditDialogOpen(false);
      setColaboradorToEdit(null);
      invalidateData();
    } catch (error: any) {
      toast({ title: "Erro inesperado", description: error?.message || "Ocorreu um erro ao atualizar o colaborador", variant: "destructive" });
    } finally {
      setIsMutating(false);
    }
  };

  const handleDeleteColaborador = (colaborador: Colaborador) => {
    if (userRole !== 'owner') {
      toast({ title: "Acesso negado", description: "Apenas o proprietário da organização pode excluir colaboradores", variant: "destructive" });
      return;
    }
    if (colaborador.user_id === currentUserId) {
      toast({ title: "Ação não permitida", description: "Você não pode excluir sua própria conta", variant: "destructive" });
      return;
    }
    setColaboradorToDelete(colaborador);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteColaborador = async () => {
    if (!colaboradorToDelete) return;
    setIsMutating(true);
    try {
      const { error } = await supabase.from('organization_members').delete().eq('id', colaboradorToDelete.id);
      if (error) throw error;
      toast({ title: "Colaborador removido", description: `${colaboradorToDelete.full_name || colaboradorToDelete.email} foi removido da organização` });
      invalidateData();
      setDeleteDialogOpen(false);
      setColaboradorToDelete(null);
    } catch (error: any) {
      toast({ title: "Erro ao excluir", description: error.message || "Não foi possível excluir o colaborador", variant: "destructive" });
    } finally {
      setIsMutating(false);
    }
  };

  // Filter collaborators based on active status and search term
  const filteredColaboradores = colaboradores
    .filter((colab) => {
      const matchesSearch = (colab.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        colab.email?.toLowerCase().includes(searchTerm.toLowerCase())) ?? false;
      const matchesStatus = showInactive ? colab.is_active === false : colab.is_active !== false;
      return matchesSearch && matchesStatus;
    });

  const getRoleColor = (role: string) => {
    switch (role) {
      case "owner": return "bg-blue-100 text-blue-700 hover:bg-blue-100";
      case "admin": return "bg-purple-100 text-purple-700 hover:bg-purple-100";
      case "member": return "bg-green-100 text-green-700 hover:bg-green-100";
      default: return "bg-gray-100 text-gray-700 hover:bg-gray-100";
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "owner": return "Proprietário";
      case "admin": return "Administrador";
      case "member": return "Membro";
      default: return role;
    }
  };

  const getInitials = (name: string | null) => {
    if (!name) return 'NC';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  if (!isReady) {
    return <LoadingAnimation text="Carregando colaboradores..." />;
  }

  return (
    <div className="min-h-screen p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-card p-3 rounded-lg shadow-sm">
            <Users className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Gestão de Colaboradores</h1>
            <p className="text-muted-foreground mt-1">Gerencie e acompanhe todos os colaboradores ativos</p>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {subscriptionLimits && (
            <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg border">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Colaboradores: <span className="font-semibold text-foreground">{subscriptionLimits.current}/{subscriptionLimits.total}</span>
              </span>
              {subscriptionLimits.current >= subscriptionLimits.total && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="ml-auto"
                  onClick={() => window.location.href = '/pricing'}
                >
                  Adicionar Mais
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="gerenciamento" className="space-y-6">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
          <TabsTrigger value="gerenciamento" className="gap-2 rounded-none px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200">
            <Users className="h-4 w-4" />
            Gerenciamento
          </TabsTrigger>
          <TabsTrigger value="cargos" className="gap-2 rounded-none px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200">
            <Shield className="h-4 w-4" />
            Cargos
          </TabsTrigger>
          <TabsTrigger value="comissoes" className="gap-2 rounded-none px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200">
            <DollarSign className="h-4 w-4" />
            Comissões
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="gap-2 rounded-none px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200">
            <BarChart3 className="h-4 w-4" />
            Dashboard de Colaboradores
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gerenciamento" className="space-y-6">
          {/* Action buttons */}
          <div className="flex gap-3 justify-end">
            {(userRole === 'owner' || userRole === 'admin') && (
              <Button 
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                onClick={() => setIsDialogOpen(true)}
              >
                Novo Colaborador
              </Button>
            )}
            <Button 
              variant={showInactive ? "default" : "secondary"}
              onClick={() => setShowInactive(!showInactive)}
            >
              {showInactive ? "Ver Ativos" : "Ver Inativos"}
            </Button>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card className="border-l-4 border-l-green-500 shadow-md">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Colaboradores Ativos</p>
                    <p className="text-3xl font-bold text-foreground mt-2">{stats.ativos}</p>
                  </div>
                  <div className="bg-green-500/10 dark:bg-green-500/20 p-3 rounded-full">
                    <UserCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-blue-500 shadow-md">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Entraram este Mês</p>
                    <p className="text-3xl font-bold text-foreground mt-2">{stats.novos}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Novos colaboradores</p>
                  </div>
                  <div className="bg-blue-500/10 dark:bg-blue-500/20 p-3 rounded-full">
                    <UserPlus className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-yellow-500 shadow-md">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Saíram este Mês</p>
                    <p className="text-3xl font-bold text-foreground mt-2">{stats.saidas}</p>
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">Desligamentos</p>
                  </div>
                  <div className="bg-yellow-500/10 dark:bg-yellow-500/20 p-3 rounded-full">
                    <UserMinus className="h-8 w-8 text-yellow-600 dark:text-yellow-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-red-500 shadow-md">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Inativos</p>
                    <p className="text-3xl font-bold text-foreground mt-2">{stats.inativos}</p>
                  </div>
                  <div className="bg-red-500/10 dark:bg-red-500/20 p-3 rounded-full">
                    <UserX className="h-8 w-8 text-red-600 dark:text-red-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Table Card */}
          <Card className="shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-6">
                <Users className="h-5 w-5 text-blue-600" />
                <h2 className="text-xl font-semibold text-foreground">
                  {showInactive ? "Colaboradores Inativos" : "Lista de Colaboradores"}
                </h2>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                {showInactive 
                  ? "Colaboradores com acesso desativado. Você pode reativá-los a qualquer momento."
                  : "Gerencie colaboradores, cargos e status de convites."}
              </p>

              {/* Controls */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Select value={itemsPerPage} onValueChange={setItemsPerPage}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-gray-600">itens por página</span>
                  </div>
                  <span className="text-sm text-gray-600">{filteredColaboradores.length} registros disponíveis</span>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Buscar por nome ou email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-64"
                  />
                </div>
              </div>

              {/* Table */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">INFO</TableHead>
                      <TableHead className="font-semibold">CARGO</TableHead>
                      <TableHead className="font-semibold">VENDAS</TableHead>
                      <TableHead className="font-semibold">RECEITA</TableHead>
                      <TableHead className="font-semibold">STATUS</TableHead>
                      {(userRole === 'owner' || userRole === 'admin') && <TableHead className="font-semibold">AÇÕES</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={(userRole === 'owner' || userRole === 'admin') ? 6 : 5} className="text-center py-8">
                          <Loader2 className="h-8 w-8 animate-spin mx-auto text-purple-600" />
                        </TableCell>
                      </TableRow>
                    ) : filteredColaboradores.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={(userRole === 'owner' || userRole === 'admin') ? 6 : 5} className="text-center py-8 text-muted-foreground">
                          {showInactive ? "Nenhum colaborador inativo" : "Nenhum colaborador encontrado"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredColaboradores.map((colab) => (
                        <TableRow key={colab.id} className="hover:bg-muted/50">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-10 w-10">
                                {colab.avatar_url && (
                                  <AvatarImage 
                                    src={colab.avatar_url} 
                                    alt={colab.full_name || colab.email || 'Avatar'} 
                                  />
                                )}
                                <AvatarFallback className="bg-gradient-to-br from-purple-400 to-blue-500 text-white">
                                  {getInitials(colab.full_name || colab.email || 'NC')}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium text-foreground">
                                  {colab.full_name || 'Nome não cadastrado'}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {colab.email}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge className={getRoleColor(colab.role)}>
                                {getRoleLabel(colab.role)}
                              </Badge>
                              {colab.custom_role_id && customRoles.find(r => r.id === colab.custom_role_id) && (
                                <Badge 
                                  variant="outline" 
                                  className="text-xs max-w-[100px] truncate"
                                  style={{ 
                                    borderColor: customRoles.find(r => r.id === colab.custom_role_id)?.color,
                                    color: customRoles.find(r => r.id === colab.custom_role_id)?.color 
                                  }}
                                  title={customRoles.find(r => r.id === colab.custom_role_id)?.name}
                                >
                                  {customRoles.find(r => r.id === colab.custom_role_id)?.name}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-center">
                              <span className="text-sm font-semibold text-foreground">
                                {colab.user_id ? (salesByUser[colab.user_id]?.count || 0) : 0}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              {(() => {
                                const revenue = colab.user_id ? (salesByUser[colab.user_id]?.revenue || 0) : 0;
                                const goal = colab.user_id ? goalsByUser[colab.user_id] : undefined;
                                const pct = goal && goal > 0 ? (revenue / goal) * 100 : null;
                                const kpiColor = pct === null ? '' : pct >= 100 ? 'text-emerald-600' : pct >= 60 ? 'text-amber-600' : 'text-red-600';
                                const kpiBg = pct === null ? '' : pct >= 100 ? 'bg-emerald-100 dark:bg-emerald-900/30' : pct >= 60 ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-red-100 dark:bg-red-900/30';
                                return (
                                  <>
                                    <span className="text-sm font-semibold text-foreground">
                                      R$ {revenue.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                                    </span>
                                    {pct !== null && (
                                      <Badge variant="secondary" className={`ml-1 text-xs ${kpiBg} ${kpiColor} border-0`}>
                                        {Math.round(pct)}%
                                      </Badge>
                                    )}
                                  </>
                                );
                              })()}
                              {colab.user_id && pendingCommissionsByUser[colab.user_id] > 0 && (
                                <p className="text-xs text-amber-600">
                                  Comissão: R$ {pendingCommissionsByUser[colab.user_id].toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {colab.is_active === false ? (
                              <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                                Inativo
                              </Badge>
                            ) : colab.user_id ? (
                              <Badge style={{ backgroundColor: '#66ee78', color: '#000' }}>
                                Ativo
                              </Badge>
                            ) : (
                              <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">
                                Pendente
                              </Badge>
                            )}
                          </TableCell>
                          {(userRole === 'owner' || userRole === 'admin') && (
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditColaborador(colab)}
                                  disabled={userRole === 'admin' && colab.role === 'owner'}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {userRole === 'owner' && colab.user_id !== currentUserId && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteColaborador(colab)}
                                  >
                                    <UserX className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cargos">
          {organizationId && <RoleManagementTab organizationId={organizationId} userRole={userRole} />}
        </TabsContent>

        <TabsContent value="comissoes">
          {organizationId && <CommissionsTab organizationId={organizationId} userRole={userRole} />}
        </TabsContent>

        <TabsContent value="dashboard">
          {organizationId && <CollaboratorDashboard organizationId={organizationId} />}
        </TabsContent>
      </Tabs>

      {/* Add Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Adicionar Colaborador</DialogTitle>
            <DialogDescription>
              Preencha os dados do novo colaborador
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={newColaborador.name}
                onChange={(e) => setNewColaborador({ ...newColaborador, name: e.target.value })}
                placeholder="Nome do colaborador"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={newColaborador.email}
                onChange={(e) => setNewColaborador({ ...newColaborador, email: e.target.value })}
                placeholder="email@exemplo.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={newColaborador.password}
                onChange={(e) => setNewColaborador({ ...newColaborador, password: e.target.value })}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">Cargo do Sistema</Label>
              <Select
                value={newColaborador.role}
                onValueChange={(v) => setNewColaborador({ ...newColaborador, role: v as any })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cargo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Membro</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                  {userRole === 'owner' && (
                    <SelectItem value="owner">Proprietário</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            {customRoles.length > 0 && (
              <div className="grid gap-2">
                <Label>Cargo Personalizado</Label>
                <Select
                  value={newColaborador.custom_role_id || "none"}
                  onValueChange={(v) => setNewColaborador({ ...newColaborador, custom_role_id: v === "none" ? null : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {customRoles.map(role => (
                      <SelectItem key={role.id} value={role.id}>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: role.color }} />
                          {role.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddColaborador} disabled={isMutating}>
              {isMutating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Colaborador</DialogTitle>
            <DialogDescription>
              Altere os dados do colaborador
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Nome</Label>
              <Input
                id="edit-name"
                value={editData.name}
                onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                placeholder="Nome do colaborador"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                type="email"
                value={editData.email}
                onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                placeholder="email@exemplo.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-password">Nova Senha (opcional)</Label>
              <Input
                id="edit-password"
                type="password"
                value={editData.newPassword}
                onChange={(e) => setEditData({ ...editData, newPassword: e.target.value })}
                placeholder="Deixe em branco para manter"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-role">Cargo do Sistema</Label>
              <Select
                value={editData.role}
                onValueChange={(v) => setEditData({ ...editData, role: v as any })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cargo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Membro</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                  {userRole === 'owner' && (
                    <SelectItem value="owner">Proprietário</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            {customRoles.length > 0 && (
              <div className="grid gap-2">
                <Label>Cargo Personalizado</Label>
                <Select
                  value={editData.custom_role_id || "none"}
                  onValueChange={(v) => setEditData({ ...editData, custom_role_id: v === "none" ? null : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {customRoles.map(role => (
                      <SelectItem key={role.id} value={role.id}>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: role.color }} />
                          {role.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-active">Status Ativo</Label>
              <Switch
                id="edit-active"
                checked={editData.is_active}
                onCheckedChange={(checked) => setEditData({ ...editData, is_active: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={isMutating}>
              {isMutating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover {colaboradorToDelete?.full_name || colaboradorToDelete?.email} da organização?
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDeleteColaborador} disabled={isMutating}>
              {isMutating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Colaboradores;
