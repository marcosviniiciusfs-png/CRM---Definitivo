import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { UserCircle, UserPlus, UserMinus, UserX, Users, Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const emailSchema = z.string().email({ message: "Email inválido" });

interface Colaborador {
  id: string;
  email: string;
  role: string;
  created_at: string;
  user_id: string | null;
}

const Colaboradores = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [itemsPerPage, setItemsPerPage] = useState("20");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [stats, setStats] = useState({
    ativos: 0,
    novos: 0,
    saidas: 0,
    inativos: 0
  });
  
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

      // Get user's organization
      const { data: memberData, error: memberError } = await supabase
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (memberError) {
        console.error('❌ Erro ao carregar organização:', memberError);
        toast({
          title: "Erro ao carregar organização",
          description: "Não foi possível carregar os dados da organização. Faça login novamente.",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      if (!memberData || !memberData.organization_id) {
        console.error('❌ Usuário não associado a nenhuma organização');
        toast({
          title: "Organização não encontrada",
          description: "Você não está associado a nenhuma organização. Entre em contato com o suporte.",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      const orgId = memberData.organization_id;
      setOrganizationId(orgId);
      
      console.log('🏢 Organização carregada:', orgId);
      
      // Load all members of the organization
      const { data: members, error: membersError } = await supabase
        .from('organization_members')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (membersError) {
        console.error('❌ Erro ao carregar membros:', membersError);
        toast({
          title: "Erro",
          description: "Não foi possível carregar os membros da organização",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      if (members) {
        console.log(`✅ ${members.length} colaborador(es) carregado(s)`);
        setColaboradores(members);
        
        // Calculate stats
        const now = new Date();
        const thisMonth = now.getMonth();
        const thisYear = now.getFullYear();
        
        const novos = members.filter((m: any) => {
          const createdDate = new Date(m.created_at);
          return createdDate.getMonth() === thisMonth && 
                 createdDate.getFullYear() === thisYear;
        }).length;
        
        setStats({
          ativos: members.length,
          novos: novos,
          saidas: 0,
          inativos: 0
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
      // Validate all fields
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

      // Verificar sessão ativa
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

      console.log('🚀 Adicionando colaborador:', newColaborador.email);

      // Use edge function to handle user creation and organization membership
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
        console.error('❌ Erro ao adicionar membro:', error);
        toast({
          title: "Erro ao adicionar colaborador",
          description: error.message || "Não foi possível adicionar o colaborador. Tente novamente.",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      if (data?.error) {
        console.error('❌ Erro retornado pela função:', data.error);
        toast({
          title: "Erro",
          description: data.error,
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      console.log('✅ Colaborador adicionado com sucesso:', data);

      toast({
        title: "Sucesso!",
        description: data?.message || `${newColaborador.name} foi adicionado à organização com sucesso`,
      });

      setIsDialogOpen(false);
      setNewColaborador({ name: "", email: "", password: "", role: "member" });
      
      // Recarregar dados da organização
      await loadOrganizationData();

    } catch (error: any) {
      console.error('❌ Erro inesperado:', error);
      toast({
        title: "Erro inesperado",
        description: error?.message || "Ocorreu um erro ao adicionar o colaborador. Por favor, tente novamente.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredColaboradores = colaboradores.filter((colab) =>
    colab.email?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false
  );

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

  const getInitials = (email: string) => {
    return email.substring(0, 2).toUpperCase();
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100 p-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="bg-white p-3 rounded-lg shadow-sm">
              <Users className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Gestão de Colaboradores</h1>
              <p className="text-gray-600 mt-1">Gerencie e acompanhe todos os colaboradores ativos</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button 
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => setIsDialogOpen(true)}
            >
              Novo Colaborador
            </Button>
            <Button variant="secondary" className="bg-purple-600 hover:bg-purple-700 text-white">
              Lote de Colaboradores
            </Button>
            <Button variant="secondary" className="bg-gray-600 hover:bg-gray-700 text-white">
              Ver Inativos
            </Button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="border-l-4 border-l-green-500 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Colaboradores Ativos</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{stats.ativos}</p>
                </div>
                <div className="bg-green-100 p-3 rounded-full">
                  <UserCircle className="h-8 w-8 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-500 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Entraram este Mês</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{stats.novos}</p>
                  <p className="text-xs text-blue-600 mt-1">Novos colaboradores</p>
                </div>
                <div className="bg-blue-100 p-3 rounded-full">
                  <UserPlus className="h-8 w-8 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-yellow-500 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Saíram este Mês</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{stats.saidas}</p>
                  <p className="text-xs text-yellow-600 mt-1">Desligamentos</p>
                </div>
                <div className="bg-yellow-100 p-3 rounded-full">
                  <UserMinus className="h-8 w-8 text-yellow-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-500 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Inativos</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{stats.inativos}</p>
                </div>
                <div className="bg-red-100 p-3 rounded-full">
                  <UserX className="h-8 w-8 text-red-600" />
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
              <h2 className="text-xl font-semibold text-gray-900">Lista de Colaboradores</h2>
            </div>
            <p className="text-sm text-gray-600 mb-6">Gerencie colaboradores, cargos e status de convites.</p>

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
                  placeholder="Buscar por email..."
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
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-semibold text-gray-700">INFO</TableHead>
                    <TableHead className="font-semibold text-gray-700">CARGO</TableHead>
                    <TableHead className="font-semibold text-gray-700">STATUS</TableHead>
                    <TableHead className="font-semibold text-gray-700">CRIAÇÃO</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-purple-600" />
                      </TableCell>
                    </TableRow>
                  ) : filteredColaboradores.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                        Nenhum colaborador encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredColaboradores.map((colab) => (
                      <TableRow key={colab.id} className="hover:bg-gray-50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback className="bg-gradient-to-br from-purple-400 to-blue-500 text-white">
                                {getInitials(colab.email)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm text-gray-500">{colab.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getRoleColor(colab.role)}>
                            {getRoleLabel(colab.role)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {colab.user_id ? (
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
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
      </div>
    </DashboardLayout>
  );
};

export default Colaboradores;
