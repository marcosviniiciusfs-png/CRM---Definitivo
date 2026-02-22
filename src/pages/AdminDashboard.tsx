import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Users, Shield, ChevronLeft, ChevronRight, TrendingUp, DollarSign,
  Trash2, Search, Download, ShoppingCart, CheckCircle, Clock, BarChart3,
  Eye, LogOut
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis,
  Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, Legend
} from "recharts";
import kairozLogo from "@/assets/kairoz-logo-full-new.png";

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

// ─── Icon wrapper with colored circle ───
function IconCircle({ icon: Icon, color }: { icon: React.ElementType; color: string }) {
  const colorMap: Record<string, string> = {
    green: "bg-green-100 text-green-600",
    blue: "bg-blue-100 text-blue-600",
    orange: "bg-orange-100 text-orange-600",
    purple: "bg-purple-100 text-purple-600",
    red: "bg-red-100 text-red-600",
    yellow: "bg-yellow-100 text-yellow-600",
  };
  return (
    <div className={`flex items-center justify-center w-10 h-10 rounded-full ${colorMap[color] || colorMap.blue}`}>
      <Icon className="w-5 h-5" />
    </div>
  );
}

// ─── Metric card (clean white style) ───
function AdminMetricCard({
  title, value, subtitle, icon, color,
}: {
  title: string; value: string | number; subtitle?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <Card className="bg-white border shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm text-gray-500">{title}</p>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
          </div>
          <IconCircle icon={icon} color={color} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [mainUsersCount, setMainUsersCount] = useState(0);
  const [payingUsersCount, setPayingUsersCount] = useState(0);
  const [mrr, setMrr] = useState(0);
  const [dailyRevenue, setDailyRevenue] = useState(0);
  const [newUsersThisMonth, setNewUsersThisMonth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [planChartData, setPlanChartData] = useState<PlanChartData[]>([]);
  const itemsPerPage = 10;

  // Admin management state
  const [admins, setAdmins] = useState<{ user_id: string; email: string; created_at: string }[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [subscriptionMap, setSubscriptionMap] = useState<Record<string, string>>({});
  const [addingAdmin, setAddingAdmin] = useState(false);

  // Filters
  const [clientSearch, setClientSearch] = useState("");
  const [clientPlanFilter, setClientPlanFilter] = useState("all");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [orderPlanFilter, setOrderPlanFilter] = useState("all");

  // ─── Data loading (unchanged logic) ───
  const loadAdmins = async () => {
    setAdminsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-manage-admins', { method: 'GET' });
      if (error) throw error;
      setAdmins(data?.admins || []);
    } catch (err: any) {
      console.error('[AdminDashboard] Error loading admins:', err);
    } finally {
      setAdminsLoading(false);
    }
  };

  const handleAddAdmin = async () => {
    if (!newAdminEmail || !newAdminPassword) {
      toast.error("Preencha e-mail e senha");
      return;
    }
    if (newAdminPassword.length < 8) {
      toast.error("A senha deve ter pelo menos 8 caracteres");
      return;
    }
    setAddingAdmin(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-manage-admins', {
        method: 'POST',
        body: { action: 'create', email: newAdminEmail, password: newAdminPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Admin adicionado com sucesso!");
      setNewAdminEmail("");
      setNewAdminPassword("");
      loadAdmins();
    } catch (err: any) {
      toast.error(err.message || "Erro ao adicionar admin");
    } finally {
      setAddingAdmin(false);
    }
  };

  const handleRemoveAdmin = async (userId: string) => {
    if (userId === user?.id) {
      toast.error("Você não pode remover a si mesmo");
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('admin-manage-admins', {
        method: 'POST',
        body: { action: 'delete', userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Admin removido com sucesso!");
      loadAdmins();
    } catch (err: any) {
      toast.error(err.message || "Erro ao remover admin");
    }
  };

  useEffect(() => {
    loadData();
    loadAdmins();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: countData, error: countError } = await supabase.rpc('count_main_users');
      if (countError) throw countError;
      setMainUsersCount(countData || 0);

      const { data: usersData, error: usersError } = await supabase.rpc('list_all_users');
      if (usersError) throw usersError;
      setUsers(usersData || []);

      // Load subscriptions for plan mapping
      const { data: subsData } = await supabase
        .from('subscriptions')
        .select('user_id, plan_id, status')
        .eq('status', 'authorized');
      
      const subMap: Record<string, string> = {};
      (subsData || []).forEach((s: any) => { subMap[s.user_id] = s.plan_id; });
      setSubscriptionMap(subMap);

      const [payingResult, mrrResult, dailyRevenueResult, chartResult] = await Promise.all([
        supabase.functions.invoke('count-paying-users'),
        supabase.functions.invoke('calculate-mrr'),
        supabase.functions.invoke('calculate-daily-revenue'),
        supabase.functions.invoke('subscription-growth')
      ]);

      setPayingUsersCount(payingResult.error ? 0 : payingResult.data?.count || 0);
      if (mrrResult.error) { setMrr(0); setPlanChartData([]); }
      else { setMrr(mrrResult.data?.mrr || 0); setPlanChartData(mrrResult.data?.planChartData || []); }
      setDailyRevenue(dailyRevenueResult.error ? 0 : dailyRevenueResult.data?.dailyRevenue || 0);
      setChartData(chartResult.error ? [] : chartResult.data?.chartData || []);
    } catch (error: any) {
      console.error('[AdminDashboard] Erro ao carregar dados:', error);
      toast.error(`Erro ao carregar dados: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const totalUsers = users.length;
  const freeUsers = totalUsers - payingUsersCount;
  const conversionRate = totalUsers > 0 ? ((payingUsersCount / totalUsers) * 100).toFixed(1) : "0";
  const ticketMedio = payingUsersCount > 0 ? mrr / payingUsersCount : 0;

  useEffect(() => {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const usersThisMonth = users.filter(u => new Date(u.created_at) >= firstDayOfMonth);
    setNewUsersThisMonth(usersThisMonth.length);
  }, [users]);

  // Pagination
  const totalPages = Math.ceil(totalUsers / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;

  // Filtered users for clients tab
  const filteredClients = users.filter(u => {
    const matchSearch = !clientSearch || u.email.toLowerCase().includes(clientSearch.toLowerCase());
    return matchSearch;
  });
  const clientPages = Math.ceil(filteredClients.length / itemsPerPage);
  const currentClients = filteredClients.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const PLAN_NAMES: Record<string, string> = { star: 'Star', pro: 'Pro', elite: 'Elite' };
  const getUserPlan = (userId: string) => subscriptionMap[userId] || 'none';
  const getUserPlanLabel = (userId: string) => PLAN_NAMES[getUserPlan(userId)] || 'Free';
  const getUserPlanClass = (userId: string) => {
    const plan = getUserPlan(userId);
    if (plan === 'star') return 'bg-yellow-50 text-yellow-700 border-yellow-200';
    if (plan === 'pro') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (plan === 'elite') return 'bg-purple-50 text-purple-700 border-purple-200';
    return 'bg-gray-50 text-gray-500 border-gray-200';
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  // Build growth chart data with pro/free lines
  const growthChartData = chartData.map((point, i) => ({
    date: point.date,
    pro: Math.min(point.count, payingUsersCount),
    gratuitos: Math.max(0, point.count - payingUsersCount),
  }));

  // CSV export
  const exportCSV = (data: any[], filename: string) => {
    if (!data.length) return;
    const headers = Object.keys(data[0]).join(",");
    const rows = data.map(r => Object.values(r).join(",")).join("\n");
    const blob = new Blob([headers + "\n" + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Last 5 subscriptions for dashboard overview
  const recentUsers = [...users].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ─── Pagination component ───
  const PaginationControls = ({ current, total, onChange }: { current: number; total: number; onChange: (p: number) => void }) => {
    if (total <= 1) return null;
    return (
      <div className="flex items-center justify-between pt-4">
        <span className="text-sm text-gray-500">Página {current} de {total}</span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => onChange(current - 1)} disabled={current === 1} className="bg-white text-gray-700 border-gray-200">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {Array.from({ length: Math.min(5, total) }, (_, i) => {
            let p;
            if (total <= 5) p = i + 1;
            else if (current <= 3) p = i + 1;
            else if (current >= total - 2) p = total - 4 + i;
            else p = current - 2 + i;
            return (
              <Button key={p} variant={current === p ? "default" : "outline"} size="icon" onClick={() => onChange(p)}
                className={current === p ? "bg-gray-900 text-white" : "bg-white text-gray-700 border-gray-200"}>
                {p}
              </Button>
            );
          })}
          <Button variant="outline" size="icon" onClick={() => onChange(current + 1)} disabled={current === total} className="bg-white text-gray-700 border-gray-200">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ─── Top Navbar ─── */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 px-6">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <img src={kairozLogo} alt="Kairoz" className="h-8" />
            <Badge className="bg-gray-900 text-white hover:bg-gray-900 text-xs">Admin</Badge>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{user?.email}</span>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Sair" className="text-gray-500 hover:text-gray-700">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* ─── Main Content with Tabs ─── */}
      <div className="max-w-[1400px] mx-auto px-6 py-6">
        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="bg-white border-b border-gray-200 mb-6">
            <TabsTrigger value="dashboard" className="text-gray-600 data-[state=active]:text-gray-900 data-[state=active]:border-gray-900">Dashboard</TabsTrigger>
            <TabsTrigger value="pedidos" className="text-gray-600 data-[state=active]:text-gray-900 data-[state=active]:border-gray-900">Pedidos</TabsTrigger>
            <TabsTrigger value="clientes" className="text-gray-600 data-[state=active]:text-gray-900 data-[state=active]:border-gray-900">Clientes</TabsTrigger>
            <TabsTrigger value="admins" className="text-gray-600 data-[state=active]:text-gray-900 data-[state=active]:border-gray-900">Usuários Admin</TabsTrigger>
          </TabsList>

          {/* ══════════ TAB 1: DASHBOARD ══════════ */}
          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <AdminMetricCard title="Receita Total" value={formatCurrency(mrr)} subtitle={`${payingUsersCount} assinantes Pro`} icon={DollarSign} color="green" />
              <AdminMetricCard title="Últimos 7 Dias" value={formatCurrency(dailyRevenue)} subtitle={`${newUsersThisMonth} novos Pro`} icon={TrendingUp} color="blue" />
              <AdminMetricCard title="Total de Usuários" value={totalUsers} subtitle={`${freeUsers} gratuitos`} icon={Users} color="orange" />
              <AdminMetricCard title="Taxa de Conversão" value={`${conversionRate}%`} subtitle="Free → Pro" icon={BarChart3} color="purple" />
            </div>

            {/* Line Chart */}
            <Card className="bg-white border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-gray-900">Clientes Pagantes vs Gratuitos - Últimos Meses</CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length === 0 ? (
                  <div className="flex items-center justify-center h-[300px] text-gray-400">Nenhum dado disponível</div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={growthChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} tickLine={false} />
                      <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} allowDecimals={false} />
                      <RechartsTooltip
                        contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="pro" stroke="#3b82f6" strokeWidth={2} name="Pro" dot={false} />
                      <Line type="monotone" dataKey="gratuitos" stroke="#9ca3af" strokeWidth={2} name="Gratuitos" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Bottom 2 cols */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent subscriptions */}
              <Card className="bg-white border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold text-gray-900">Últimas Assinaturas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {recentUsers.map(u => (
                      <div key={u.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{u.email}</p>
                          <p className="text-xs text-gray-400">{format(new Date(u.created_at), "dd/MM/yyyy", { locale: ptBR })}</p>
                        </div>
                        <Badge variant="outline" className={getUserPlanClass(u.id)}>
                          {getUserPlanLabel(u.id)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Plan summary */}
              <Card className="bg-white border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold text-gray-900">Resumo de Planos</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-700">Plano Pro <Badge className="ml-2 bg-green-100 text-green-700 hover:bg-green-100 text-xs">Ativo</Badge></span>
                      <span className="text-sm font-semibold text-gray-900">{payingUsersCount}</span>
                    </div>
                    <Progress value={totalUsers > 0 ? (payingUsersCount / totalUsers) * 100 : 0} className="h-2" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-700">Plano Gratuito</span>
                      <span className="text-sm font-semibold text-gray-900">{freeUsers}</span>
                    </div>
                    <Progress value={totalUsers > 0 ? (freeUsers / totalUsers) * 100 : 0} className="h-2" />
                  </div>
                  <div className="pt-3 border-t border-gray-100">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">Ticket Médio (Pro)</span>
                      <span className="text-sm font-semibold text-gray-900">{formatCurrency(ticketMedio)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ══════════ TAB 2: PEDIDOS ══════════ */}
          <TabsContent value="pedidos" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <AdminMetricCard title="Total de Pedidos" value={totalUsers} icon={ShoppingCart} color="blue" />
              <AdminMetricCard title="Receita Total" value={formatCurrency(mrr)} icon={DollarSign} color="green" />
              <AdminMetricCard title="Pedidos Ativos" value={payingUsersCount} icon={CheckCircle} color="green" />
              <AdminMetricCard title="Pendentes" value={freeUsers} icon={Clock} color="red" />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input placeholder="Buscar pedido..." value={orderSearch} onChange={e => setOrderSearch(e.target.value)}
                  className="pl-9 bg-white border-gray-200 text-gray-900 placeholder:text-gray-400" />
              </div>
              <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
                <SelectTrigger className="w-[160px] bg-white border-gray-200 text-gray-700">
                  <SelectValue placeholder="Todos os status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
              <Select value={orderPlanFilter} onValueChange={setOrderPlanFilter}>
                <SelectTrigger className="w-[160px] bg-white border-gray-200 text-gray-700">
                  <SelectValue placeholder="Todos os planos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os planos</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="free">Gratuito</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" className="bg-white border-gray-200 text-gray-700" onClick={() => exportCSV(users.map(u => ({ email: u.email, data: u.created_at, status: u.last_sign_in_at ? 'Ativo' : 'Inativo' })), 'pedidos.csv')}>
                <Download className="h-4 w-4 mr-2" /> Exportar CSV
              </Button>
            </div>

            {/* Orders table */}
            <Card className="bg-white border shadow-sm">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="text-gray-500 font-medium">CLIENTE</TableHead>
                      <TableHead className="text-gray-500 font-medium">PLANO</TableHead>
                      <TableHead className="text-gray-500 font-medium">VALOR</TableHead>
                      <TableHead className="text-gray-500 font-medium">STATUS</TableHead>
                      <TableHead className="text-gray-500 font-medium">DATA</TableHead>
                      <TableHead className="text-gray-500 font-medium">AÇÕES</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.filter(u => {
                      if (orderSearch && !u.email.toLowerCase().includes(orderSearch.toLowerCase())) return false;
                      if (orderStatusFilter === "active" && !u.last_sign_in_at) return false;
                      if (orderStatusFilter === "inactive" && u.last_sign_in_at) return false;
                      return true;
                    }).slice(startIndex, endIndex).map(u => (
                      <TableRow key={u.id} className="hover:bg-gray-50">
                        <TableCell className="text-gray-900 font-medium">{u.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getUserPlanClass(u.id)}>
                            {getUserPlanLabel(u.id)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-gray-700">{getUserPlan(u.id) !== 'none' ? formatCurrency(ticketMedio) : "R$ 0,00"}</TableCell>
                        <TableCell>
                          {u.last_sign_in_at ? (
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Ativo</Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-gray-100 text-gray-500">Inativo</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-gray-500 text-sm">{format(new Date(u.created_at), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => navigate(`/admin/user/${u.id}`)} className="text-gray-400 hover:text-gray-700">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <PaginationControls current={currentPage} total={totalPages} onChange={goToPage} />
          </TabsContent>

          {/* ══════════ TAB 3: CLIENTES ══════════ */}
          <TabsContent value="clientes" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <AdminMetricCard title="Total de Clientes" value={totalUsers} icon={Users} color="blue" />
              <AdminMetricCard title="Clientes Pagantes" value={payingUsersCount} icon={CheckCircle} color="green" />
              <AdminMetricCard title="Em Gratuito" value={freeUsers} icon={Users} color="orange" />
              <AdminMetricCard title="Novos este Mês" value={newUsersThisMonth} icon={TrendingUp} color="purple" />
            </div>

            {/* Growth chart */}
            <Card className="bg-white border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold text-gray-900">Crescimento de Clientes - Últimos Meses</CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length === 0 ? (
                  <div className="flex items-center justify-center h-[250px] text-gray-400">Nenhum dado disponível</div>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={growthChartData}>
                      <defs>
                        <linearGradient id="colorPro" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorFree" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#9ca3af" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#9ca3af" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" stroke="#9ca3af" fontSize={12} tickLine={false} />
                      <YAxis stroke="#9ca3af" fontSize={12} tickLine={false} allowDecimals={false} />
                      <RechartsTooltip contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }} />
                      <Legend />
                      <Area type="monotone" dataKey="pro" stroke="#3b82f6" fill="url(#colorPro)" name="Pro" />
                      <Area type="monotone" dataKey="gratuitos" stroke="#9ca3af" fill="url(#colorFree)" name="Gratuitos" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input placeholder="Buscar cliente..." value={clientSearch} onChange={e => { setClientSearch(e.target.value); setCurrentPage(1); }}
                  className="pl-9 bg-white border-gray-200 text-gray-900 placeholder:text-gray-400" />
              </div>
              <Select value={clientPlanFilter} onValueChange={setClientPlanFilter}>
                <SelectTrigger className="w-[160px] bg-white border-gray-200 text-gray-700">
                  <SelectValue placeholder="Todos os planos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os planos</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="free">Gratuito</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" className="bg-white border-gray-200 text-gray-700" onClick={() => exportCSV(users.map(u => ({ email: u.email, cadastro: u.created_at, status: u.last_sign_in_at ? 'Ativo' : 'Inativo' })), 'clientes.csv')}>
                <Download className="h-4 w-4 mr-2" /> Exportar CSV
              </Button>
            </div>

            {/* Clients table */}
            <Card className="bg-white border shadow-sm">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="text-gray-500 font-medium">EMAIL</TableHead>
                      <TableHead className="text-gray-500 font-medium">DATA DE CADASTRO</TableHead>
                      <TableHead className="text-gray-500 font-medium">PLANO</TableHead>
                      <TableHead className="text-gray-500 font-medium">STATUS</TableHead>
                      <TableHead className="text-gray-500 font-medium">TEMPO ASSINANTE</TableHead>
                      <TableHead className="text-gray-500 font-medium">AÇÕES</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentClients.map(u => (
                      <TableRow key={u.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/admin/user/${u.id}`)}>
                        <TableCell className="text-gray-900 font-medium">{u.email}</TableCell>
                        <TableCell className="text-gray-500 text-sm">{format(new Date(u.created_at), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getUserPlanClass(u.id)}>
                            {getUserPlanLabel(u.id)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {u.last_sign_in_at ? (
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Ativo</Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-gray-100 text-gray-500">Inativo</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-gray-500 text-sm">
                          {formatDistanceToNow(new Date(u.created_at), { locale: ptBR, addSuffix: false })}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/admin/user/${u.id}`); }}
                            className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 text-xs">
                            Ver Plano
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <PaginationControls current={currentPage} total={clientPages} onChange={p => setCurrentPage(p)} />
          </TabsContent>

          {/* ══════════ TAB 4: USUÁRIOS ADMIN ══════════ */}
          <TabsContent value="admins" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Create admin form */}
              <Card className="bg-white border shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold text-gray-900">Criar Novo Administrador</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="admin-email" className="text-sm text-gray-700">Email</Label>
                    <Input id="admin-email" type="email" placeholder="email@exemplo.com"
                      value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)}
                      className="bg-white border-gray-200 text-gray-900" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin-pass" className="text-sm text-gray-700">Senha</Label>
                    <Input id="admin-pass" type="password" placeholder="Mínimo 8 caracteres"
                      value={newAdminPassword} onChange={e => setNewAdminPassword(e.target.value)}
                      className="bg-white border-gray-200 text-gray-900" />
                  </div>
                  <Button onClick={handleAddAdmin} disabled={addingAdmin} className="w-full bg-gray-900 text-white hover:bg-gray-800">
                    {addingAdmin ? "Criando..." : "Criar Administrador"}
                  </Button>
                </CardContent>
              </Card>

              {/* Active admins list */}
              <Card className="bg-white border shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold text-gray-900">Administradores Ativos</CardTitle>
                </CardHeader>
                <CardContent>
                  {adminsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-6 h-6 border-4 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {admins.map(admin => (
                        <div key={admin.user_id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                          <div className="flex items-center gap-3">
                            <Avatar className="w-9 h-9">
                              <AvatarFallback className="bg-gray-100 text-gray-600 text-sm">
                                {admin.email.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-gray-900">{admin.email}</p>
                                {admin.user_id === user?.id && (
                                  <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-xs">Você</Badge>
                                )}
                              </div>
                              <p className="text-xs text-gray-400">
                                Adicionado em {admin.created_at ? format(new Date(admin.created_at), "dd/MM/yyyy", { locale: ptBR }) : "-"}
                              </p>
                            </div>
                          </div>
                          {admin.user_id !== user?.id && (
                            <Button variant="ghost" size="icon" onClick={() => handleRemoveAdmin(admin.user_id)}
                              className="text-red-400 hover:text-red-600 hover:bg-red-50">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
