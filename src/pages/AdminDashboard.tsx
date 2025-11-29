import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Users, UserCheck, Shield, Activity, ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import payingUsersIcon from "@/assets/paying-users-icon.gif";
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell, Rectangle } from "recharts";

interface User {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
}

interface ChartDataPoint {
  date: string;
  count: number;
}

interface PlanChartData {
  name: string;
  count: number;
  color: string;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [mainUsersCount, setMainUsersCount] = useState(0);
  const [payingUsersCount, setPayingUsersCount] = useState(0);
  const [mrr, setMrr] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [planChartData, setPlanChartData] = useState<PlanChartData[]>([]);
  const [hoveredPlanBarIndex, setHoveredPlanBarIndex] = useState<number | null>(null);
  const itemsPerPage = 10;

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

      // Buscar contagem de usuários pagantes, MRR e dados do gráfico em paralelo
      console.log('[AdminDashboard] Chamando count-paying-users, calculate-mrr e subscription-growth...');
      const [payingResult, mrrResult, chartResult] = await Promise.all([
        supabase.functions.invoke('count-paying-users'),
        supabase.functions.invoke('calculate-mrr'),
        supabase.functions.invoke('subscription-growth')
      ]);
      
      console.log('[AdminDashboard] Resultado count-paying-users:', payingResult);
      console.log('[AdminDashboard] Resultado calculate-mrr:', mrrResult);
      console.log('[AdminDashboard] Resultado subscription-growth:', chartResult);
      
      if (payingResult.error) {
        console.error('[AdminDashboard] Erro em count-paying-users:', payingResult.error);
        setPayingUsersCount(0);
      } else {
        setPayingUsersCount(payingResult.data?.count || 0);
      }

      if (mrrResult.error) {
        console.error('[AdminDashboard] Erro em calculate-mrr:', mrrResult.error);
        setMrr(0);
        setPlanChartData([]);
      } else {
        setMrr(mrrResult.data?.mrr || 0);
        setPlanChartData(mrrResult.data?.planChartData || []);
      }

      if (chartResult.error) {
        console.error('[AdminDashboard] Erro em subscription-growth:', chartResult.error);
        setChartData([]);
      } else {
        setChartData(chartResult.data?.chartData || []);
      }
      
      console.log('[AdminDashboard] Dados carregados com sucesso!', { 
        totalUsers: usersData?.length || 0,
        mainUsers: countData || 0,
        payingUsers: payingResult.data?.count || 0,
        mrr: mrrResult.data?.mrr || 0
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

  // Paginação
  const totalPages = Math.ceil(totalUsers / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentUsers = users.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

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

        {/* Métricas - Primeira Linha */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card className="glow-border h-[140px]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Usuários Pagantes</CardTitle>
              <img src={payingUsersIcon} alt="Paying users" className="h-12 w-12 glow-icon" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{payingUsersCount}</div>
              <p className="text-xs text-muted-foreground">
                Com assinatura ativa no Stripe
              </p>
            </CardContent>
          </Card>

          <Card className="glow-border h-[140px]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
              <Users className="h-4 w-4 glow-icon" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalUsers}</div>
              <p className="text-xs text-muted-foreground">
                Todos os usuários registrados
              </p>
            </CardContent>
          </Card>

          <Card className="glow-border h-[140px]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Usuários Principais</CardTitle>
              <UserCheck className="h-4 w-4 glow-icon" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{mainUsersCount}</div>
              <p className="text-xs text-muted-foreground">
                Owners de organizações
              </p>
            </CardContent>
          </Card>

          <Card className="glow-border h-[140px]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">E-mails Confirmados</CardTitle>
              <Shield className="h-4 w-4 glow-icon" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{confirmedUsers}</div>
              <p className="text-xs text-muted-foreground">
                {totalUsers > 0 ? Math.round((confirmedUsers / totalUsers) * 100) : 0}% do total
              </p>
            </CardContent>
          </Card>

          <Card className="glow-border h-[140px]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Usuários Ativos</CardTitle>
              <Activity className="h-4 w-4 glow-icon" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeUsers}</div>
              <p className="text-xs text-muted-foreground">
                Com último login registrado
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Card MRR - Segunda Linha */}
        <Card className="glow-border h-[140px] lg:w-[calc(40%-0.5rem)]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">MRR (Receita Mensal)</CardTitle>
            <TrendingUp className="h-4 w-4 glow-icon text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL'
              }).format(mrr)}
            </div>
            <p className="text-xs text-muted-foreground">
              Receita recorrente mensal
            </p>
          </CardContent>
        </Card>

        {/* Grid com Gráfico e Tabela - Terceira Linha */}
        <div className="grid gap-6 lg:grid-cols-[40%_60%]">
          {/* Gráfico de Crescimento de Assinaturas */}
          <Card className="glow-border">
            <CardHeader>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle>Crescimento de Assinaturas</CardTitle>
                  <CardDescription>
                    Evolução do número total de assinaturas nos últimos 30 dias
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center h-[300px]">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : chartData.length === 0 ? (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  Nenhum dado de assinatura disponível
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorSubscriptions" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis 
                      dataKey="date" 
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickLine={false}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                              <p className="text-sm font-medium">{payload[0].payload.date}</p>
                              <p className="text-sm text-muted-foreground">
                                {payload[0].value} assinaturas
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorSubscriptions)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}

              {/* Gráfico de Barras - Planos */}
              {!loading && planChartData.length > 0 && (
                <div className="mt-6">
                  <h4 className="text-sm font-medium mb-4 text-muted-foreground">Assinaturas por Plano</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={planChartData}>
                      <defs>
                        <filter id="planGlow" x="-50%" y="-50%" width="200%" height="200%">
                          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                          <feMerge>
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                          </feMerge>
                        </filter>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis 
                        dataKey="name" 
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                        tickLine={false}
                      />
                      <YAxis 
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <RechartsTooltip
                        cursor={{ fill: 'transparent' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                                <p className="text-sm font-medium">{payload[0].payload.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {payload[0].value} assinaturas ativas
                                </p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar 
                        dataKey="count" 
                        radius={[8, 8, 0, 0]}
                        cursor="default"
                        onMouseEnter={(data, index) => {
                          setHoveredPlanBarIndex(index);
                        }}
                        onMouseLeave={() => {
                          setHoveredPlanBarIndex(null);
                        }}
                        activeBar={(props: any) => {
                          const { x, y, width, height, payload } = props;
                          const centerX = x + width / 2;
                          const newWidth = width * 1.1;
                          const newHeight = height * 1.05;
                          const newX = centerX - newWidth / 2;
                          const newY = y - (newHeight - height);
                          
                          return (
                            <Rectangle
                              x={newX}
                              y={newY}
                              width={newWidth}
                              height={newHeight}
                              fill={payload.color}
                              radius={[8, 8, 0, 0]}
                              filter="url(#planGlow)"
                              style={{ transition: 'all 0.2s ease' }}
                            />
                          );
                        }}
                        shape={(props: any) => {
                          const { x, y, width, height, payload, index } = props;
                          const isOtherBarHovered = hoveredPlanBarIndex !== null && hoveredPlanBarIndex !== index;
                          const opacity = isOtherBarHovered ? 0.3 : 1;
                          
                          return (
                            <Rectangle
                              x={x}
                              y={y}
                              width={width}
                              height={height}
                              fill={payload.color}
                              radius={[8, 8, 0, 0]}
                              opacity={opacity}
                              style={{ transition: 'opacity 0.2s ease' }}
                            />
                          );
                        }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tabela de Usuários */}
          <Card className="glow-border">
            <CardHeader>
              <div>
                <CardTitle>Lista de Usuários</CardTitle>
                <CardDescription>
                  Mostrando {startIndex + 1}-{Math.min(endIndex, totalUsers)} de {totalUsers} usuários
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : (
                <>
                  <div className="rounded-md glow-border">
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
                        {currentUsers.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                              Nenhum usuário encontrado
                            </TableCell>
                          </TableRow>
                        ) : (
                          currentUsers.map((user) => (
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
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Controles de Paginação */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4">
                      <div className="text-sm text-muted-foreground">
                        Página {currentPage} de {totalPages}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => goToPage(1)}
                          disabled={currentPage === 1}
                        >
                          Primeira
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => goToPage(currentPage - 1)}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        
                        {/* Números de página */}
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNumber;
                            if (totalPages <= 5) {
                              pageNumber = i + 1;
                            } else if (currentPage <= 3) {
                              pageNumber = i + 1;
                            } else if (currentPage >= totalPages - 2) {
                              pageNumber = totalPages - 4 + i;
                            } else {
                              pageNumber = currentPage - 2 + i;
                            }
                            
                            return (
                              <Button
                                key={pageNumber}
                                variant={currentPage === pageNumber ? "default" : "outline"}
                                size="icon"
                                onClick={() => goToPage(pageNumber)}
                              >
                                {pageNumber}
                              </Button>
                            );
                          })}
                        </div>

                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => goToPage(currentPage + 1)}
                          disabled={currentPage === totalPages}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => goToPage(totalPages)}
                          disabled={currentPage === totalPages}
                        >
                          Última
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
