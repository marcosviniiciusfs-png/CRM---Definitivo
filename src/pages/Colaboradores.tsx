import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { UserCircle, UserPlus, UserMinus, UserX, Users, Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const mockColaboradores = [
  {
    id: "1",
    nome: "Gerente Imperio",
    email: "representanteimperiop@gmail.com",
    avatar: "",
    cargo: "Gerente",
    permissoes: ["adm.geral"],
    criacao: "27/08/2025"
  },
  {
    id: "2",
    nome: "Luigy Frota",
    email: "luigy.frota@gmail.com",
    avatar: "",
    cargo: "Supervisor",
    permissoes: ["time.venda", "equipe.lider"],
    criacao: "27/08/2025"
  },
  {
    id: "3",
    nome: "Samara Silva",
    email: "samara664silva@gmail.com",
    avatar: "",
    cargo: "Vendedor",
    permissoes: ["time.venda"],
    criacao: "27/08/2025"
  },
  {
    id: "4",
    nome: "Beatriz Carvalho",
    email: "beatrizcmultimarcas@gmail.com",
    avatar: "",
    cargo: "Supervisor",
    permissoes: ["time.venda", "equipe.criacao", "equipe.lider", "ranking.editor"],
    criacao: "27/08/2025"
  },
  {
    id: "5",
    nome: "Levi Felipe",
    email: "levifelipe2344@icloud.com",
    avatar: "",
    cargo: "Vendedor",
    permissoes: ["time.venda"],
    criacao: "27/08/2025"
  },
  {
    id: "6",
    nome: "Raila Oliveira",
    email: "raylaoliveira644@gmail.com",
    avatar: "",
    cargo: "Vendedor",
    permissoes: ["time.venda"],
    criacao: "27/08/2025"
  }
];

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
        .single();

      if (memberError) {
        toast({
          title: "Erro ao carregar organização",
          description: "Não foi possível carregar os dados da organização. Faça login novamente.",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      if (!memberData || !memberData.organization_id) {
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
      
      // Load all members of the organization
      const { data: members, error: membersError } = await supabase
        .from('organization_members')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (membersError) {
        toast({
          title: "Erro",
          description: "Não foi possível carregar os membros da organização",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      if (members) {
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

      // Check if user with this email already exists in the organization
      const { data: existingMember } = await supabase
        .from('organization_members')
        .select('email')
        .eq('organization_id', organizationId)
        .eq('email', newColaborador.email.toLowerCase().trim())
        .single();

      if (existingMember) {
        toast({
          title: "Colaborador já existe",
          description: "Este email já está cadastrado na organização",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      // Create the user account
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: newColaborador.email.toLowerCase().trim(),
        password: newColaborador.password,
        options: {
          data: {
            full_name: newColaborador.name.trim()
          },
          emailRedirectTo: `${window.location.origin}/`
        }
      });

      if (signUpError) {
        let errorMessage = "Não foi possível criar a conta do colaborador";
        
        if (signUpError.message.includes('already registered')) {
          errorMessage = "Este email já está registrado no sistema";
        } else if (signUpError.message.includes('invalid email')) {
          errorMessage = "Email inválido";
        } else if (signUpError.message.includes('weak password')) {
          errorMessage = "Senha muito fraca. Use pelo menos 6 caracteres";
        }
        
        toast({
          title: "Erro ao criar colaborador",
          description: errorMessage,
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      if (!signUpData.user) {
        toast({
          title: "Erro",
          description: "Não foi possível criar a conta do colaborador",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      // Add user to organization
      const { error: memberError } = await supabase
        .from('organization_members')
        .insert({
          organization_id: organizationId,
          user_id: signUpData.user.id,
          role: newColaborador.role,
          email: newColaborador.email.toLowerCase().trim()
        });

      if (memberError) {
        toast({
          title: "Erro",
          description: "Usuário criado mas não foi possível adicionar à organização. Tente novamente.",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      toast({
        title: "Colaborador criado com sucesso!",
        description: `Conta criada para ${newColaborador.name}`,
      });

      setIsDialogOpen(false);
      setNewColaborador({ name: "", email: "", password: "", role: "member" });
      await loadOrganizationData();

    } catch (error: any) {
      toast({
        title: "Erro",
        description: error?.message || "Ocorreu um erro ao criar o colaborador",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredColaboradores = colaboradores.filter((colab) =>
    colab.email.toLowerCase().includes(searchTerm.toLowerCase())
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
                  <p className="text-3xl font-bold text-gray-900 mt-2">15</p>
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
                  <p className="text-3xl font-bold text-gray-900 mt-2">3</p>
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
                  <p className="text-3xl font-bold text-gray-900 mt-2">2</p>
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
                  <p className="text-3xl font-bold text-gray-900 mt-2">2</p>
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
