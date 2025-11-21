import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users, FileText, CheckSquare, List, AlertCircle, Pencil, CheckCircle, XCircle } from "lucide-react";
import outcomeGif from "@/assets/outcome.gif";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, BarChart, Bar, Rectangle } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
const leadSourceData = [{
  month: "Jan",
  emailMarketing: 1200,
  api: 50,
  vendaLeads: 5
}, {
  month: "Fev",
  emailMarketing: 1800,
  api: 80,
  vendaLeads: 8
}, {
  month: "Mar",
  emailMarketing: 2400,
  api: 120,
  vendaLeads: 12
}, {
  month: "Apr",
  emailMarketing: 3200,
  api: 180,
  vendaLeads: 15
}, {
  month: "Mai",
  emailMarketing: 4500,
  api: 220,
  vendaLeads: 18
}, {
  month: "Jun",
  emailMarketing: 5200,
  api: 260,
  vendaLeads: 20
}, {
  month: "Jul",
  emailMarketing: 6100,
  api: 280,
  vendaLeads: 22
}, {
  month: "Ago",
  emailMarketing: 6800,
  api: 300,
  vendaLeads: 23
}, {
  month: "Set",
  emailMarketing: 7200,
  api: 315,
  vendaLeads: 24
}, {
  month: "Oct",
  emailMarketing: 7896,
  api: 325,
  vendaLeads: 24
}];
const conversionData = [{
  month: "Mai",
  rate: 5.2
}, {
  month: "Jun",
  rate: 5.8
}, {
  month: "Jul",
  rate: 6.1
}, {
  month: "Ago",
  rate: 6.5
}, {
  month: "Set",
  rate: 7.0
}, {
  month: "Out",
  rate: 7.5
}];

// Função para calcular a cor da barra baseada no valor
const getBarColor = (value: number) => {
  const minRate = 5.2;
  const maxRate = 7.5;
  const normalized = (value - minRate) / (maxRate - minRate);
  
  // Verde escuro (#006928) para valores baixos
  // Verde claro/brilhante (#00ff6a) para valores altos
  const darkGreen = { r: 0, g: 105, b: 40 };
  const brightGreen = { r: 0, g: 255, b: 106 };
  
  const r = Math.round(darkGreen.r + (brightGreen.r - darkGreen.r) * normalized);
  const g = Math.round(darkGreen.g + (brightGreen.g - darkGreen.g) * normalized);
  const b = Math.round(darkGreen.b + (brightGreen.b - darkGreen.b) * normalized);
  
  return `rgb(${r}, ${g}, ${b})`;
};
const Dashboard = () => {
  const {
    user
  } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isEditGoalOpen, setIsEditGoalOpen] = useState(false);
  const [currentValue, setCurrentValue] = useState(7580);
  const [totalValue, setTotalValue] = useState(8000);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [editTotalValue, setEditTotalValue] = useState(totalValue.toString());
  const [editDeadline, setEditDeadline] = useState<string>("");
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  
  // Função para tocar som sutil ao passar o mouse
  const playHoverSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800; // Frequência em Hz (tom agudo e sutil)
      oscillator.type = 'sine'; // Tipo de onda
      
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime); // Volume baixo
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1); // Duração de 0.1 segundos
    } catch (error) {
      console.log('Audio context not supported');
    }
  };
  useEffect(() => {
    loadGoal();
  }, [user]);
  const loadGoal = async () => {
    try {
      setLoading(true);
      if (!user) {
        setLoading(false);
        return;
      }

      // Buscar organization_id do usuário
      const {
        data: orgMember,
        error: orgError
      } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).single();
      if (orgError || !orgMember) {
        console.error('Erro ao buscar organização:', orgError);
        setLoading(false);
        return;
      }

      // Buscar meta do usuário
      const {
        data: goals,
        error
      } = await supabase.from('goals').select('*').eq('user_id', user.id).order('created_at', {
        ascending: false
      }).limit(1);
      if (error) throw error;
      if (goals && goals.length > 0) {
        // Meta encontrada
        const goal = goals[0];
        setGoalId(goal.id);
        setCurrentValue(Number(goal.current_value));
        setTotalValue(Number(goal.target_value));
        setDeadline(goal.deadline ? new Date(goal.deadline) : null);
      } else {
        // Criar meta padrão
        const {
          data: newGoal,
          error: createError
        } = await supabase.from('goals').insert({
          user_id: user.id,
          organization_id: orgMember.organization_id,
          current_value: 7580,
          target_value: 8000
        }).select().single();
        if (createError) throw createError;
        if (newGoal) {
          setGoalId(newGoal.id);
          setCurrentValue(Number(newGoal.current_value));
          setTotalValue(Number(newGoal.target_value));
          setDeadline(newGoal.deadline ? new Date(newGoal.deadline) : null);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar meta:', error);
      toast.error('Erro ao carregar meta');
    } finally {
      setLoading(false);
    }
  };
  const percentage = currentValue / totalValue * 100;
  const remaining = totalValue - currentValue;
  const handleEditGoal = () => {
    setEditTotalValue(totalValue.toString());
    setEditDeadline(deadline ? deadline.toISOString().split('T')[0] : "");
    setIsEditGoalOpen(true);
  };
  const handleSaveGoal = async () => {
    const newTotalValue = parseFloat(editTotalValue);
    if (isNaN(newTotalValue)) {
      toast.error("Por favor, insira um valor válido");
      return;
    }
    if (newTotalValue <= 0) {
      toast.error("O valor da meta deve ser maior que zero");
      return;
    }
    if (!editDeadline) {
      toast.error("Por favor, selecione um prazo");
      return;
    }
    try {
      if (!goalId || !user) {
        toast.error("Meta não encontrada");
        return;
      }
      const {
        error
      } = await supabase.from('goals').update({
        target_value: newTotalValue,
        deadline: editDeadline
      }).eq('id', goalId).eq('user_id', user.id);
      if (error) throw error;
      setTotalValue(newTotalValue);
      setDeadline(new Date(editDeadline));
      setIsEditGoalOpen(false);
      toast.success("Meta atualizada com sucesso!");
    } catch (error) {
      console.error('Erro ao salvar meta:', error);
      toast.error("Erro ao salvar meta");
    }
  };
  const getDaysRemaining = () => {
    if (!deadline) return null;
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diffTime = deadlineDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };
  const isDeadlineFuture = () => {
    if (!editDeadline) return null;
    const selectedDate = new Date(editDeadline);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    selectedDate.setHours(0, 0, 0, 0);
    return selectedDate >= today;
  };

  // Limitar o gráfico a 100% mesmo se ultrapassar a meta
  const displayValue = Math.min(currentValue, totalValue);
  const displayRemaining = Math.max(0, totalValue - currentValue);
  const goalData = [{
    name: "Atingido",
    value: displayValue,
    fill: "url(#goalGradient)"
  }, {
    name: "Restante",
    value: displayRemaining,
    fill: "hsl(0, 0%, 90%)"
  }];
  if (loading) {
    return <div className="space-y-6">
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-[400px] w-full" />
          <Skeleton className="h-[400px] w-full" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>;
  }
  return <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <MetricCard title="Novos Leads" value="7089" icon={TrendingUp} iconColor="text-cyan-500" />
        <MetricCard title="Novos Clientes" value="65" icon={Users} iconColor="text-green-500" />
        <MetricCard title="Faturas Enviadas" value="628" icon={FileText} iconColor="text-slate-400" />
        <MetricCard title="Tarefas Atuais" value="5" icon={CheckSquare} iconColor="text-purple-500" />
        <MetricCard title="Tarefas de Leads" value="120" icon={List} iconColor="text-orange-400" />
        <MetricCard title="Tarefas Atrasadas" value="48" icon={AlertCircle} iconColor="text-red-500" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-3 relative">
            <div className="flex items-center justify-between w-full">
              <CardTitle className="text-lg font-semibold">Metas</CardTitle>
              <button onClick={handleEditGoal} className="p-2 hover:bg-accent rounded-md transition-colors">
                <Pencil className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
              </button>
            </div>
            {deadline && <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none">
                  <style>{`@keyframes rotate{0%{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
                  <rect width="16" height="16" x="4" y="4" stroke="currentColor" strokeWidth="1.5" rx="8" className="text-muted-foreground" />
                  <path stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" d="M12.021 12l2.325 2.325" className="text-muted-foreground" />
                  <path stroke="hsl(var(--primary))" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12.021 12V6.84" style={{
                animation: 'rotate 2s linear infinite both',
                transformOrigin: 'center'
              }} />
                </svg>
              </div>}
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center pb-8 pt-2">
            {deadline && <div className="text-center -mb-8">
                <p className="text-sm text-muted-foreground">Prazo para bater a meta</p>
                <p className="text-2xl font-bold">
                  {getDaysRemaining() !== null && getDaysRemaining()! > 0 ? `${getDaysRemaining()} dias restantes` : getDaysRemaining() === 0 ? "Hoje é o prazo!" : "Prazo expirado"}
                </p>
              </div>}
            <div className="relative w-full max-w-[400px] h-[220px]">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <defs>
                    <linearGradient id="goalGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#00aaff" />
                      <stop offset="100%" stopColor="#00ff00" />
                    </linearGradient>
                  </defs>
                  <Pie data={goalData} cx="50%" cy="85%" startAngle={180} endAngle={0} innerRadius={90} outerRadius={110} paddingAngle={0} dataKey="value" strokeWidth={0} cornerRadius={10}>
                    {goalData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} stroke="none" />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              
              {/* Valor central */}
              <div className="absolute inset-0 flex flex-col items-center justify-end pb-10">
                <p className="text-xl font-bold">R${currentValue}</p>
                <p className="text-base text-muted-foreground">de R${totalValue}</p>
                <p className="text-sm text-muted-foreground mt-1">{percentage.toFixed(0)}% concluído</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Taxa de Conversão</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{
                backgroundColor: 'rgba(0, 179, 76, 0.1)'
              }}>
                  <img 
                    src={outcomeGif} 
                    alt="Taxa de Conversão" 
                    className="w-12 h-12 object-contain"
                  />
                </div>
                <div>
                  <p className="text-4xl font-bold" style={{
                  color: '#00b34c'
                }}>7.5%</p>
                  <p className="text-xs text-muted-foreground">Leads → Clientes</p>
                </div>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 rounded" style={{
              backgroundColor: 'rgba(0, 179, 76, 0.1)'
            }}>
                <TrendingUp className="w-3 h-3" style={{
                color: '#00b34c'
              }} />
                <span className="text-xs font-medium" style={{
                color: '#00b34c'
              }}>+1.2%</span>
              </div>
            </div>
            
            <div>
              <p className="text-xs text-muted-foreground mb-2">Evolução (últimos 6 meses)</p>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={conversionData} className="rounded-sm shadow px-0 py-0 pr-0 mx-0 mr-0 mb-0 mt-[100px]">
                  <defs>
                    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                      <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>
                  <Bar 
                    dataKey="rate" 
                    radius={[4, 4, 0, 0]}
                    cursor="default"
                    onMouseEnter={(data, index) => {
                      playHoverSound();
                      setHoveredBarIndex(index);
                    }}
                    onMouseLeave={() => {
                      setHoveredBarIndex(null);
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
                          fill={getBarColor(payload.rate)}
                          radius={[4, 4, 0, 0]}
                          filter="url(#glow)"
                          style={{ transition: 'all 0.2s ease' }}
                        />
                      );
                    }}
                    shape={(props: any) => {
                      const { x, y, width, height, payload, index } = props;
                      const isOtherBarHovered = hoveredBarIndex !== null && hoveredBarIndex !== index;
                      const opacity = isOtherBarHovered ? 0.3 : 1;
                      
                      return (
                        <Rectangle
                          x={x}
                          y={y}
                          width={width}
                          height={height}
                          fill={getBarColor(payload.rate)}
                          radius={[4, 4, 0, 0]}
                          opacity={opacity}
                          style={{ transition: 'opacity 0.2s ease' }}
                        />
                      );
                    }}
                  />
                  <XAxis dataKey="month" tick={{
                  fill: 'hsl(var(--muted-foreground))',
                  fontSize: 10
                }} axisLine={false} tickLine={false} />
                  <Tooltip 
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                    }} 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const currentRate = payload[0].value as number;
                        const currentIndex = conversionData.findIndex(d => d.rate === currentRate);
                        const currentMonth = conversionData[currentIndex]?.month;
                        const previousRate = currentIndex > 0 ? conversionData[currentIndex - 1].rate : null;
                        const difference = previousRate ? currentRate - previousRate : null;
                        const percentChange = previousRate ? ((difference! / previousRate) * 100) : null;
                        
                        // Calcular média móvel dos últimos 3 meses
                        const startIndex = Math.max(0, currentIndex - 2);
                        const movingAverageData = conversionData.slice(startIndex, currentIndex + 1);
                        const movingAverage = movingAverageData.reduce((sum, d) => sum + d.rate, 0) / movingAverageData.length;
                        
                        // Calcular tendência (comparar com média)
                        const trend = currentRate - movingAverage;
                        const trendPercent = (trend / movingAverage) * 100;
                        
                        return (
                          <div style={{
                            backgroundColor: 'hsl(var(--popover))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            padding: '12px 14px',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                            minWidth: '200px'
                          }}>
                            {/* Cabeçalho */}
                            <div style={{ borderBottom: '1px solid hsl(var(--border))', paddingBottom: '8px', marginBottom: '8px' }}>
                              <p style={{ margin: 0, fontSize: '10px', color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {currentMonth}
                              </p>
                              <p style={{ margin: '2px 0 0 0', fontWeight: 700, fontSize: '20px', color: '#00b34c' }}>
                                {currentRate}%
                              </p>
                              <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'hsl(var(--muted-foreground))' }}>
                                Taxa de Conversão
                              </p>
                            </div>
                            
                            {/* Comparação com mês anterior */}
                            {difference !== null && (
                              <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid hsl(var(--border))' }}>
                                <p style={{ margin: '0 0 4px 0', fontSize: '10px', color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                  vs. Mês Anterior
                                </p>
                                <p style={{ 
                                  margin: 0, 
                                  fontSize: '13px',
                                  color: difference >= 0 ? '#00b34c' : '#ef4444',
                                  fontWeight: 600,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}>
                                  {difference >= 0 ? '↗' : '↘'} {difference >= 0 ? '+' : ''}{difference.toFixed(1)}% 
                                  <span style={{ opacity: 0.7, fontSize: '11px', fontWeight: 400 }}>
                                    ({percentChange! >= 0 ? '+' : ''}{percentChange!.toFixed(1)}%)
                                  </span>
                                </p>
                              </div>
                            )}
                            
                            {/* Média Móvel (3 meses) */}
                            <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid hsl(var(--border))' }}>
                              <p style={{ margin: '0 0 4px 0', fontSize: '10px', color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Média Móvel (3 meses)
                              </p>
                              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                                {movingAverage.toFixed(2)}%
                              </p>
                            </div>
                            
                            {/* Tendência */}
                            <div>
                              <p style={{ margin: '0 0 4px 0', fontSize: '10px', color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Tendência
                              </p>
                              <p style={{ 
                                margin: 0, 
                                fontSize: '13px',
                                color: trend >= 0 ? '#00b34c' : '#ef4444',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                {trend >= 0 ? '📈' : '📉'} {trend >= 0 ? 'Acima' : 'Abaixo'} da média
                                <span style={{ opacity: 0.7, fontSize: '11px', fontWeight: 400 }}>
                                  ({trendPercent >= 0 ? '+' : ''}{trendPercent.toFixed(1)}%)
                                </span>
                              </p>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Fonte de Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">E-mail Marketing</span>
                  <span className="text-sm font-semibold">7896</span>
                </div>
                <ResponsiveContainer width="100%" height={60}>
                  <LineChart data={leadSourceData}>
                    <Line type="monotone" dataKey="emailMarketing" stroke="hsl(180, 70%, 45%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>Jan</span>
                  <span>Apr</span>
                  <span>Jul</span>
                  <span>Oct</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">API</span>
                  <span className="text-sm font-semibold">325</span>
                </div>
                <ResponsiveContainer width="100%" height={60}>
                  <LineChart data={leadSourceData}>
                    <Line type="monotone" dataKey="api" stroke="hsl(180, 70%, 45%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>Jan</span>
                  <span>Apr</span>
                  <span>Jul</span>
                  <span>Oct</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-muted-foreground">Venda de Leads</span>
                  <span className="text-sm font-semibold">24</span>
                </div>
                <ResponsiveContainer width="100%" height={60}>
                  <LineChart data={leadSourceData}>
                    <Line type="monotone" dataKey="vendaLeads" stroke="hsl(0, 0%, 40%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>Jan</span>
                  <span>Apr</span>
                  <span>Jul</span>
                  <span>Oct</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isEditGoalOpen} onOpenChange={setIsEditGoalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Meta</DialogTitle>
            <DialogDescription>
              Defina sua meta e o prazo para atingi-la.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="total-value">Meta (R$)</Label>
              <Input id="total-value" type="number" value={editTotalValue} onChange={e => setEditTotalValue(e.target.value)} placeholder="0" step="0.01" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="deadline">Prazo para bater a meta</Label>
              <Input id="deadline" type="date" value={editDeadline} onChange={e => setEditDeadline(e.target.value)} className={editDeadline ? isDeadlineFuture() ? "border-green-500" : "border-red-500" : ""} />
              {editDeadline && <div className={`flex items-center gap-2 text-sm ${isDeadlineFuture() ? "text-green-600" : "text-red-600"}`}>
                  {isDeadlineFuture() ? <>
                      <CheckCircle className="w-4 h-4" />
                      <span>Data futura válida</span>
                    </> : <>
                      <XCircle className="w-4 h-4" />
                      <span>Data no passado - selecione uma data futura</span>
                    </>}
                </div>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditGoalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveGoal} disabled={!editDeadline || !isDeadlineFuture()}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>;
};
export default Dashboard;