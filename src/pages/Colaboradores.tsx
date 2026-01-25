import { useState, useEffect } from "react";

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
import { UserCircle, UserPlus, UserMinus, UserX, Users, Search, Loader2, BarChart3, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { CollaboratorDashboard } from "@/components/CollaboratorDashboard";

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
}

const Colaboradores = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState("20");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
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
    is_active: true
  });
  
  const [stats, setStats] = useState({
    ativos: 0,
    novos: 0,
    saidas: 0,
    inativos: 0
  });
  const [subscriptionLimits, setSubscriptionLimits] = useState<{
    total: number;
    current: number;
  } | null>(null);
  
  const [newColaborador, setNewColaborador] = useState({
    name: "",
    email: "",
    password: "",
    role: "member" as "owner" | "admin" | "member"
  });
  
  const { toast } = useToast();

  useEffect(() => {
    loadOrganizationData();
  }, []);

  const loadOrganizationData = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast({
          title: "Erro",
          description: "Usuário não autenticado",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      const { data: memberData, error: memberError } = await supabase
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (memberError || !memberData?.organization_id) {
        toast({
          title: "Organização não encontrada",
          description: "Você não está associado a nenhuma organização.",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      const orgId = memberData.organization_id;
      setOrganizationId(orgId);
      setUserRole(memberData.role);
      setCurrentUserId(user.id);

      // Fetch members with is_active and display_name columns
      const [membersResult, subResult] = await Promise.all([
        supabase
          .from('organization_members')
          .select('id, user_id, organization_id, role, created_at, email, is_active, display_name')
          .eq('organization_id', orgId),
        supabase.functions.invoke('check-subscription')
      ]);

      if (membersResult.error) {
        toast({
          title: "Erro",
          description: "Não foi possível carregar os membros da organização",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      const members = membersResult.data || [];
      
      // Fetch profiles in parallel
      const userIds = members.filter(m => m.user_id).map(m => m.user_id);
      let profilesMap: { [key: string]: { full_name: string | null; avatar_url: string | null } } = {};
      
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, avatar_url')
          .in('user_id', userIds);
        
        if (profiles) {
          profilesMap = profiles.reduce((acc, profile) => {
            acc[profile.user_id] = { 
              full_name: profile.full_name,
              avatar_url: profile.avatar_url
            };
            return acc;
          }, {} as { [key: string]: { full_name: string | null; avatar_url: string | null } });
        }
      }
      
      // Transform and set data - use profile full_name OR display_name for collaborators without user_id
      const transformedMembers = members.map((member: any) => {
        const profileName = member.user_id && profilesMap[member.user_id] 
          ? profilesMap[member.user_id].full_name 
          : null;
        
        return {
          ...member,
          is_active: member.is_active ?? true,
          // Use profile name if available, otherwise use display_name from organization_members
          full_name: profileName || member.display_name || null,
          avatar_url: member.user_id && profilesMap[member.user_id]
            ? profilesMap[member.user_id].avatar_url
            : null
        };
      });
      
      setColaboradores(transformedMembers);
      
      // Calculate stats
      const now = new Date();
      const thisMonth = now.getMonth();
      const thisYear = now.getFullYear();
      
      const activeMembers = transformedMembers.filter((m: Colaborador) => m.is_active !== false);
      const inactiveMembers = transformedMembers.filter((m: Colaborador) => m.is_active === false);
      
      const novos = activeMembers.filter((m: any) => {
        const createdDate = new Date(m.created_at);
        return createdDate.getMonth() === thisMonth && 
               createdDate.getFullYear() === thisYear;
      }).length;
      
      setStats({
        ativos: activeMembers.length,
        novos: novos,
        saidas: 0,
        inativos: inactiveMembers.length
      });

      // Set subscription limits
      const subData = subResult.data;
      if (subData?.subscribed && subData?.total_collaborators) {
        setSubscriptionLimits({
          total: subData.total_collaborators,
          current: activeMembers.length
        });
      }
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Erro",
        description: "Ocorreu um erro ao carregar os dados",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddColaborador = async () => {
    try {
      if (userRole !== 'owner' && userRole !== 'admin') {
        toast({
          title: "Acesso negado",
          description: "Apenas proprietários e administradores podem adicionar colaboradores",
          variant: "destructive"
        });
        return;
      }

      const validationResult = emailSchema.safeParse(newColaborador.email);
      
      if (!validationResult.success) {
        toast({
          title: "Erro de validação",
          description: "Por favor, insira um email válido",
          variant: "destructive"
        });
        return;
      }

      if (!newColaborador.name.trim()) {
        toast({
          title: "Erro de validação",
          description: "Por favor, insira o nome do colaborador",
          variant: "destructive"
        });
        return;
      }

      if (!newColaborador.password || newColaborador.password.length < 6) {
        toast({
          title: "Erro de validação",
          description: "A senha deve ter pelo menos 6 caracteres",
          variant: "destructive"
        });
        return;
      }

      if (!organizationId) {
        toast({
          title: "Erro",
          description: "Você precisa fazer login novamente. Sua sessão pode ter expirado.",
          variant: "destructive"
        });
        return;
      }

      setIsLoading(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Sessão expirada",
          description: "Faça login novamente para continuar",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('add-organization-member', {
        body: {
          email: newColaborador.email.toLowerCase().trim(),
          password: newColaborador.password,
          name: newColaborador.name.trim(),
          role: newColaborador.role,
          organizationId: organizationId
        }
      });

      if (error) {
        toast({
          title: "Erro ao adicionar colaborador",
          description: error.message || "Não foi possível adicionar o colaborador. Tente novamente.",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      if (data?.error) {
        toast({
          title: "Erro",
          description: data.error,
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      toast({
        title: "Sucesso!",
        description: data?.message || `${newColaborador.name} foi adicionado à organização com sucesso`,
      });

      setIsDialogOpen(false);
      setNewColaborador({ name: "", email: "", password: "", role: "member" });
      
      await loadOrganizationData();

    } catch (error: any) {
      toast({
        title: "Erro inesperado",
        description: error?.message || "Ocorreu um erro ao adicionar o colaborador. Por favor, tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditColaborador = (colaborador: Colaborador) => {
    if (userRole !== 'owner' && userRole !== 'admin') {
      toast({
        title: "Acesso negado",
        description: "Apenas proprietários e administradores podem editar colaboradores",
        variant: "destructive"
      });
      return;
    }

    // Admins cannot edit owners
    if (userRole === 'admin' && colaborador.role === 'owner') {
      toast({
        title: "Acesso negado",
        description: "Administradores não podem editar proprietários",
        variant: "destructive"
      });
      return;
    }

    setColaboradorToEdit(colaborador);
    setEditData({
      name: colaborador.full_name || "",
      email: colaborador.email || "",
      newPassword: "",
      role: colaborador.role as "owner" | "admin" | "member",
      is_active: colaborador.is_active !== false
    });
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!colaboradorToEdit) return;

    // Validate email if changed
    if (editData.email && editData.email !== colaboradorToEdit.email) {
      const validationResult = emailSchema.safeParse(editData.email);
      if (!validationResult.success) {
        toast({
          title: "Erro de validação",
          description: "Por favor, insira um email válido",
          variant: "destructive"
        });
        return;
      }
    }

    // Validate password if provided
    if (editData.newPassword && editData.newPassword.length < 6) {
      toast({
        title: "Erro de validação",
        description: "A nova senha deve ter pelo menos 6 caracteres",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('update-organization-member', {
        body: {
          memberId: colaboradorToEdit.id,
          name: editData.name || undefined,
          email: editData.email !== colaboradorToEdit.email ? editData.email : undefined,
          newPassword: editData.newPassword || undefined,
          role: editData.role !== colaboradorToEdit.role ? editData.role : undefined,
          is_active: editData.is_active
        }
      });

      if (error) {
        toast({
          title: "Erro ao atualizar",
          description: error.message || "Não foi possível atualizar o colaborador",
          variant: "destructive"
        });
        return;
      }

      if (data?.error) {
        toast({
          title: "Erro",
          description: data.error,
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Sucesso!",
        description: "Colaborador atualizado com sucesso",
      });

      setIsEditDialogOpen(false);
      setColaboradorToEdit(null);
      await loadOrganizationData();

    } catch (error: any) {
      toast({
        title: "Erro inesperado",
        description: error?.message || "Ocorreu um erro ao atualizar o colaborador",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteColaborador = (colaborador: Colaborador) => {
    if (userRole !== 'owner') {
      toast({
        title: "Acesso negado",
        description: "Apenas o proprietário da organização pode excluir colaboradores",
        variant: "destructive"
      });
      return;
    }

    if (colaborador.user_id === currentUserId) {
      toast({
        title: "Ação não permitida",
        description: "Você não pode excluir sua própria conta",
        variant: "destructive"
      });
      return;
    }

    setColaboradorToDelete(colaborador);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteColaborador = async () => {
    if (!colaboradorToDelete) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('organization_members')
        .delete()
        .eq('id', colaboradorToDelete.id);

      if (error) throw error;

      toast({
        title: "Colaborador removido",
        description: `${colaboradorToDelete.full_name || colaboradorToDelete.email} foi removido da organização`,
      });

      await loadOrganizationData();
      setDeleteDialogOpen(false);
      setColaboradorToDelete(null);
    } catch (error: any) {
      toast({
        title: "Erro ao excluir",
        description: error.message || "Não foi possível excluir o colaborador",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
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
          <TabsTrigger value="dashboard" className="gap-2 rounded-none px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200">
            <BarChart3 className="h-4 w-4" />
            Dashboard de Colaboradores
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gerenciamento" className="space-y-6">
          {/* Action buttons */}
          <div className="flex gap-3 justify-end">
            {(userRole === 'owner' || userRole === 'admin') && (
              <>
                <Button 
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                  onClick={() => setIsDialogOpen(true)}
                >
                  Novo Colaborador
                </Button>
                <Button variant="secondary" className="bg-purple-600 hover:bg-purple-700 text-white">
                  Lote de Colaboradores
                </Button>
              </>
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
                    <TableHead className="font-semibold">STATUS</TableHead>
                    <TableHead className="font-semibold">CRIAÇÃO</TableHead>
                    {(userRole === 'owner' || userRole === 'admin') && <TableHead className="font-semibold">AÇÕES</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={(userRole === 'owner' || userRole === 'admin') ? 5 : 4} className="text-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-purple-600" />
                      </TableCell>
                    </TableRow>
                  ) : filteredColaboradores.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={(userRole === 'owner' || userRole === 'admin') ? 5 : 4} className="text-center py-8 text-muted-foreground">
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
                          <Badge className={getRoleColor(colab.role)}>
                            {getRoleLabel(colab.role)}
                          </Badge>
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
                        <TableCell className="text-gray-600">
                          {new Date(colab.created_at).toLocaleDateString('pt-BR')}
                        </TableCell>
                        {(userRole === 'owner' || userRole === 'admin') && (
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditColaborador(colab)}
                                disabled={userRole === 'admin' && colab.role === 'owner'}
                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              >
                                <Pencil className="h-4 w-4 mr-1" />
                                Editar
                              </Button>
                              {userRole === 'owner' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteColaborador(colab)}
                                  disabled={colab.user_id === currentUserId}
                                  className={
                                    colab.user_id === currentUserId
                                      ? "text-muted-foreground cursor-not-allowed"
                                      : "text-red-600 hover:text-red-700 hover:bg-red-50"
                                  }
                                >
                                  <UserX className="h-4 w-4 mr-1" />
                                  Excluir
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

        {/* Dialog para adicionar colaborador */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Criar Novo Colaborador</DialogTitle>
              <DialogDescription>
                Crie uma conta para o novo colaborador da organização.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nome Completo</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Nome do colaborador"
                  value={newColaborador.name}
                  onChange={(e) => setNewColaborador({ ...newColaborador, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="colaborador@exemplo.com"
                  value={newColaborador.email}
                  onChange={(e) => setNewColaborador({ ...newColaborador, email: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={newColaborador.password}
                  onChange={(e) => setNewColaborador({ ...newColaborador, password: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="role">Cargo</Label>
                <Select
                  value={newColaborador.role}
                  onValueChange={(value: "owner" | "admin" | "member") => 
                    setNewColaborador({ ...newColaborador, role: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Membro</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="owner">Proprietário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false);
                  setNewColaborador({ name: "", email: "", password: "", role: "member" });
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleAddColaborador}
                disabled={isLoading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  "Criar Colaborador"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog para editar colaborador */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Editar Colaborador</DialogTitle>
              <DialogDescription>
                Atualize as informações do colaborador.
              </DialogDescription>
            </DialogHeader>
            {colaboradorToEdit && (
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit-name">Nome Completo</Label>
                  <Input
                    id="edit-name"
                    type="text"
                    placeholder="Nome do colaborador"
                    value={editData.name}
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    placeholder="colaborador@exemplo.com"
                    value={editData.email}
                    onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-password">Nova Senha (deixe vazio para manter)</Label>
                  <Input
                    id="edit-password"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={editData.newPassword}
                    onChange={(e) => setEditData({ ...editData, newPassword: e.target.value })}
                  />
                </div>
                {userRole === 'owner' && (
                  <div className="grid gap-2">
                    <Label htmlFor="edit-role">Cargo</Label>
                    <Select
                      value={editData.role}
                      onValueChange={(value: "owner" | "admin" | "member") => 
                        setEditData({ ...editData, role: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Membro</SelectItem>
                        <SelectItem value="admin">Administrador</SelectItem>
                        <SelectItem value="owner">Proprietário</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <Label htmlFor="edit-active" className="text-base font-medium">Acesso Ativo</Label>
                    <p className="text-sm text-muted-foreground">
                      {editData.is_active ? "O colaborador pode acessar o sistema" : "O acesso está desativado"}
                    </p>
                  </div>
                  <Switch
                    id="edit-active"
                    checked={editData.is_active}
                    onCheckedChange={(checked) => setEditData({ ...editData, is_active: checked })}
                    disabled={colaboradorToEdit.user_id === currentUserId}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  setColaboradorToEdit(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={isLoading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar Alterações"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog de confirmação de exclusão */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Confirmar Exclusão</DialogTitle>
              <DialogDescription>
                Tem certeza que deseja remover este colaborador da organização?
              </DialogDescription>
            </DialogHeader>
            {colaboradorToDelete && (
              <div className="py-4">
                <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                  <Avatar className="h-12 w-12">
                    {colaboradorToDelete.avatar_url && (
                      <AvatarImage src={colaboradorToDelete.avatar_url} />
                    )}
                    <AvatarFallback className="bg-gradient-to-br from-purple-400 to-blue-500 text-white">
                      {getInitials(colaboradorToDelete.full_name || colaboradorToDelete.email || 'NC')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">
                      {colaboradorToDelete.full_name || 'Nome não cadastrado'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {colaboradorToDelete.email}
                    </p>
                    <Badge className={getRoleColor(colaboradorToDelete.role)}>
                      {getRoleLabel(colaboradorToDelete.role)}
                    </Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-4">
                  Esta ação não pode ser desfeita. O colaborador perderá acesso à organização.
                </p>
              </div>
            )}
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setDeleteDialogOpen(false)}
                disabled={isLoading}
              >
                Cancelar
              </Button>
              <Button 
                variant="destructive"
                onClick={confirmDeleteColaborador}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  "Confirmar Exclusão"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </TabsContent>

        <TabsContent value="dashboard">
          <CollaboratorDashboard organizationId={organizationId || undefined} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Colaboradores;
