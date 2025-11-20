import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Users, UserCheck, Shield, Activity } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface User {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [mainUsersCount, setMainUsersCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      console.log('[AdminDashboard] Iniciando carregamento de dados...');

      // Buscar contagem de usuários principais
      console.log('[AdminDashboard] Chamando count_main_users...');
      const { data: countData, error: countError } = await supabase.rpc('count_main_users');
      
      console.log('[AdminDashboard] Resultado count_main_users:', { countData, countError });
      
      if (countError) {
        console.error('[AdminDashboard] Erro em count_main_users:', countError);
        throw countError;
      }
      setMainUsersCount(countData || 0);

      // Buscar todos os usuários
      console.log('[AdminDashboard] Chamando list_all_users...');
      const { data: usersData, error: usersError } = await supabase.rpc('list_all_users');
      
      console.log('[AdminDashboard] Resultado list_all_users:', { usersData, usersError });
      
      if (usersError) {
        console.error('[AdminDashboard] Erro em list_all_users:', usersError);
        throw usersError;
      }
      setUsers(usersData || []);
      
      console.log('[AdminDashboard] Dados carregados com sucesso!', { 
        totalUsers: usersData?.length || 0,
        mainUsers: countData || 0 
      });
    } catch (error: any) {
      console.error('[AdminDashboard] Erro ao carregar dados:', error);
      toast.error(`Erro ao carregar dados: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const totalUsers = users.length;
  const confirmedUsers = users.filter(u => u.email_confirmed_at).length;
  const activeUsers = users.filter(u => u.last_sign_in_at).length;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard Administrativo</h1>
            <p className="text-muted-foreground">Visão geral de todos os usuários do sistema</p>
          </div>
        </div>

        {/* Métricas */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalUsers}</div>
              <p className="text-xs text-muted-foreground">
                Todos os usuários registrados
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Usuários Principais</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{mainUsersCount}</div>
              <p className="text-xs text-muted-foreground">
                Owners de organizações
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">E-mails Confirmados</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{confirmedUsers}</div>
              <p className="text-xs text-muted-foreground">
                {totalUsers > 0 ? Math.round((confirmedUsers / totalUsers) * 100) : 0}% do total
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Usuários Ativos</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeUsers}</div>
              <p className="text-xs text-muted-foreground">
                Com último login registrado
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabela de Usuários */}
        <Card>
          <CardHeader>
            <CardTitle>Lista de Usuários</CardTitle>
            <CardDescription>
              Informações detalhadas de todos os usuários cadastrados no sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <ScrollArea className="h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data de Cadastro</TableHead>
                      <TableHead>Último Login</TableHead>
                      <TableHead>E-mail Confirmado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow 
                        key={user.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/admin/user/${user.id}`)}
                      >
                        <TableCell className="font-medium">{user.email}</TableCell>
                        <TableCell>
                          {user.last_sign_in_at ? (
                            <Badge variant="default">Ativo</Badge>
                          ) : (
                            <Badge variant="secondary">Inativo</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm">
                              {format(new Date(user.created_at), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(user.created_at), "HH:mm:ss", { locale: ptBR })}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {user.last_sign_in_at ? (
                            <div className="flex flex-col">
                              <span className="text-sm">
                                {format(new Date(user.last_sign_in_at), "dd/MM/yyyy", { locale: ptBR })}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(user.last_sign_in_at), "HH:mm:ss", { locale: ptBR })}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Nunca</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {user.email_confirmed_at ? (
                            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                              Confirmado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                              Pendente
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
