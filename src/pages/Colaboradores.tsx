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
    email: "",
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
        return;
      }

      // Get user's organization
      const { data: memberData, error: memberError } = await supabase
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', user.id)
        .single();

      if (memberError) {
        console.error('Error loading organization:', memberError);
        return;
      }

      if (memberData) {
        setOrganizationId(memberData.organization_id);
        
        // Load all members of the organization
        const { data: members, error: membersError } = await supabase
          .from('organization_members')
          .select('*')
          .eq('organization_id', memberData.organization_id)
          .order('created_at', { ascending: false });

        if (membersError) {
          console.error('Error loading members:', membersError);
          return;
        }

        if (members) {
          setColaboradores(members);
          
          // Calculate stats
          const now = new Date();
          const thisMonth = now.getMonth();
          const thisYear = now.getFullYear();
          
          const novos = members.filter(m => {
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
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddColaborador = async () => {
    try {
      // Validate email
      const validationResult = emailSchema.safeParse(newColaborador.email);
      
      if (!validationResult.success) {
        toast({
          title: "Erro de validação",
          description: "Por favor, insira um email válido",
          variant: "destructive"
        });
        return;
      }

      if (!organizationId) {
        toast({
          title: "Erro",
          description: "Organização não encontrada",
          variant: "destructive"
        });
        return;
      }

      setIsLoading(true);

      // Check if user with this email already exists
      const { data: existingUser } = await supabase
        .from('organization_members')
        .select('email')
        .eq('organization_id', organizationId)
        .eq('email', newColaborador.email.toLowerCase().trim())
        .single();

      if (existingUser) {
        toast({
          title: "Colaborador já existe",
          description: "Este email já está cadastrado na organização",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      // For now, we'll add the email as a pending member
      // When the user signs up with this email, they'll be automatically added to the organization
      const { error } = await supabase
        .from('organization_members')
        .insert({
          organization_id: organizationId,
          user_id: null, // Will be filled when user signs up
          role: newColaborador.role,
          email: newColaborador.email.toLowerCase().trim()
        });

      if (error) {
        console.error('Error adding colaborador:', error);
        toast({
          title: "Erro",
          description: "Não foi possível adicionar o colaborador",
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Colaborador adicionado!",
        description: `Convite enviado para ${newColaborador.email}`,
      });

      setIsDialogOpen(false);
      setNewColaborador({ email: "", role: "member" });
      loadOrganizationData();

    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Erro",
        description: "Ocorreu um erro ao adicionar o colaborador",
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
      </div>
    </DashboardLayout>
  );
};

export default Colaboradores;
