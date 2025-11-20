import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Activity, MessageSquare, Users, TrendingUp, Search, Calendar } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ActivityData {
  id: string;
  tipo: 'mensagem' | 'lead_criado' | 'lead_atualizado';
  colaborador_email: string;
  colaborador_id: string | null;
  colaborador_avatar?: string | null;
  lead_nome: string;
  lead_id: string;
  lead_telefone: string;
  mensagem?: string;
  direcao?: 'ENTRADA' | 'SAIDA';
  data_hora: string;
  stage?: string;
}

export default function Atividades() {
  const [activities, setActivities] = useState<ActivityData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterColaborador, setFilterColaborador] = useState<string>("todos");
  const [filterTipo, setFilterTipo] = useState<string>("todos");
  const [colaboradores, setColaboradores] = useState<Array<{ id: string; email: string }>>([]);
  const [stats, setStats] = useState({
    totalAtividades: 0,
    mensagensEnviadas: 0,
    colaboradoresAtivos: 0,
    leadsInteragidos: 0,
  });

  useEffect(() => {
    loadActivities();
    loadColaboradores();
  }, []);

  const loadColaboradores = async () => {
    try {
      const { data: members, error } = await supabase
        .from('organization_members')
        .select('user_id, email')
        .order('email');

      if (error) throw error;
      setColaboradores(members.map(m => ({ id: m.user_id || '', email: m.email || '' })));
    } catch (error) {
      console.error('Erro ao carregar colaboradores:', error);
    }
  };

  const loadActivities = async () => {
    try {
      setLoading(true);

      // Buscar mensagens com informações dos leads
      const { data: messages, error: messagesError } = await supabase
        .from('mensagens_chat')
        .select(`
          id,
          corpo_mensagem,
          direcao,
          data_hora,
          id_lead,
          leads (
            id,
            nome_lead,
            telefone_lead,
            stage
          )
        `)
        .order('data_hora', { ascending: false })
        .limit(100);

      if (messagesError) throw messagesError;

      // Buscar criação de leads
      const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select('id, nome_lead, telefone_lead, created_at, stage')
        .order('created_at', { ascending: false })
        .limit(50);

      if (leadsError) throw leadsError;

      // Buscar avatars dos colaboradores
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, avatar_url');

      const avatarMap: Record<string, string | null> = {};
      if (profiles) {
        profiles.forEach(profile => {
          if (profile.user_id) {
            avatarMap[profile.user_id] = profile.avatar_url;
          }
        });
      }

      // Combinar atividades
      const messageActivities: ActivityData[] = (messages || []).map((msg: any) => ({
        id: `msg-${msg.id}`,
        tipo: 'mensagem' as const,
        colaborador_email: 'Sistema',
        colaborador_id: null,
        colaborador_avatar: null,
        lead_nome: msg.leads?.nome_lead || 'Lead desconhecido',
        lead_id: msg.id_lead,
        lead_telefone: msg.leads?.telefone_lead || '',
        mensagem: msg.corpo_mensagem,
        direcao: msg.direcao,
        data_hora: msg.data_hora,
        stage: msg.leads?.stage,
      }));

      const leadActivities: ActivityData[] = (leads || []).map((lead: any) => ({
        id: `lead-${lead.id}`,
        tipo: 'lead_criado' as const,
        colaborador_email: 'Sistema',
        colaborador_id: null,
        colaborador_avatar: null,
        lead_nome: lead.nome_lead,
        lead_id: lead.id,
        lead_telefone: lead.telefone_lead,
        data_hora: lead.created_at,
        stage: lead.stage,
      }));

      const allActivities = [...messageActivities, ...leadActivities]
        .sort((a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime());

      setActivities(allActivities);

      // Calcular estatísticas
      const mensagensEnviadas = messageActivities.filter(a => a.direcao === 'SAIDA').length;
      const leadsUnicos = new Set(allActivities.map(a => a.lead_id)).size;
      const colaboradoresUnicos = new Set(allActivities.map(a => a.colaborador_id).filter(Boolean)).size;

      setStats({
        totalAtividades: allActivities.length,
        mensagensEnviadas,
        colaboradoresAtivos: colaboradoresUnicos || 1,
        leadsInteragidos: leadsUnicos,
      });

    } catch (error) {
      console.error('Erro ao carregar atividades:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredActivities = activities.filter(activity => {
    const matchSearch = 
      activity.lead_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      activity.colaborador_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      activity.mensagem?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchColaborador = filterColaborador === "todos" || activity.colaborador_id === filterColaborador;
    const matchTipo = filterTipo === "todos" || activity.tipo === filterTipo;

    return matchSearch && matchColaborador && matchTipo;
  });

  const getActivityIcon = (tipo: string) => {
    switch (tipo) {
      case 'mensagem':
        return <MessageSquare className="h-4 w-4" />;
      case 'lead_criado':
        return <Users className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getActivityColor = (tipo: string) => {
    switch (tipo) {
      case 'mensagem':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
      case 'lead_criado':
        return 'bg-green-500/10 text-green-600 dark:text-green-400';
      default:
        return 'bg-purple-500/10 text-purple-600 dark:text-purple-400';
    }
  };

  const getActivityLabel = (activity: ActivityData) => {
    if (activity.tipo === 'mensagem') {
      return activity.direcao === 'ENTRADA' ? 'Mensagem recebida' : 'Mensagem enviada';
    }
    return 'Lead criado';
  };

  return (
    <DashboardLayout>
      <div className="min-h-screen p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-primary/10 p-3 rounded-full">
              <Activity className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Dashboard de Atividades</h1>
              <p className="text-muted-foreground mt-1">
                Acompanhe as interações entre colaboradores e leads
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Atividades</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats.totalAtividades}</div>
                  <p className="text-xs text-muted-foreground">Últimas 100 atividades</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Mensagens Enviadas</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats.mensagensEnviadas}</div>
                  <p className="text-xs text-muted-foreground">Mensagens de saída</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Colaboradores Ativos</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats.colaboradoresAtivos}</div>
                  <p className="text-xs text-muted-foreground">Com interações</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Leads Interagidos</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats.leadsInteragidos}</div>
                  <p className="text-xs text-muted-foreground">Leads únicos</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Filters and Activity List */}
        <Card>
          <CardHeader>
            <CardTitle>Histórico de Atividades</CardTitle>
            <CardDescription>
              Visualize todas as interações e ações realizadas no sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por lead, colaborador ou mensagem..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              <Select value={filterTipo} onValueChange={setFilterTipo}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue placeholder="Tipo de atividade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas atividades</SelectItem>
                  <SelectItem value="mensagem">Mensagens</SelectItem>
                  <SelectItem value="lead_criado">Leads criados</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterColaborador} onValueChange={setFilterColaborador}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue placeholder="Colaborador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos colaboradores</SelectItem>
                  {colaboradores.map((colab) => (
                    <SelectItem key={colab.id} value={colab.id}>
                      {colab.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Activity Timeline */}
            <ScrollArea className="h-[600px] pr-4">
              {loading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex gap-4">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredActivities.length === 0 ? (
                <div className="text-center py-12">
                  <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Nenhuma atividade encontrada</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredActivities.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <Avatar className="h-10 w-10">
                        {activity.colaborador_avatar && (
                          <AvatarImage 
                            src={activity.colaborador_avatar} 
                            alt={activity.colaborador_email} 
                          />
                        )}
                        <AvatarFallback className={getActivityColor(activity.tipo)}>
                          {getActivityIcon(activity.tipo)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="font-normal">
                                {getActivityLabel(activity)}
                              </Badge>
                              <span className="text-sm text-muted-foreground">
                                {activity.colaborador_email}
                              </span>
                              <span className="text-sm text-muted-foreground">→</span>
                              <span className="text-sm font-medium">{activity.lead_nome}</span>
                              {activity.stage && (
                                <Badge variant="secondary" className="text-xs">
                                  {activity.stage}
                                </Badge>
                              )}
                            </div>

                            {activity.mensagem && (
                              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                                {activity.mensagem}
                              </p>
                            )}

                            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              <span>
                                {formatDistanceToNow(new Date(activity.data_hora), {
                                  addSuffix: true,
                                  locale: ptBR,
                                })}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
