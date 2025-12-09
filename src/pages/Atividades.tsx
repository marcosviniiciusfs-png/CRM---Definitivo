import { useState, useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Activity, MessageSquare, Search, Calendar, Clock, LogIn, LogOut, Tag, UserCheck, GitBranch } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface MessageActivity {
  id: string;
  tipo: 'mensagem';
  colaborador_email: string;
  lead_nome: string;
  lead_telefone: string;
  mensagem: string;
  direcao: 'ENTRADA' | 'SAIDA';
  data_hora: string;
}

interface UserSession {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar: string | null;
  login_at: string;
  logout_at: string | null;
  duration_minutes: number | null;
}

interface SystemActivity {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar: string | null;
  activity_type: string;
  description: string;
  lead_id: string | null;
  metadata: any;
  created_at: string;
}

export default function Atividades() {
  const [messageActivities, setMessageActivities] = useState<MessageActivity[]>([]);
  const [userSessions, setUserSessions] = useState<UserSession[]>([]);
  const [systemActivities, setSystemActivities] = useState<SystemActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterColaborador, setFilterColaborador] = useState<string>("todos");
  const [colaboradores, setColaboradores] = useState<Array<{ id: string; name: string; email: string }>>([]);

  useEffect(() => {
    loadAllActivities();
    loadColaboradores();
  }, []);

  const loadColaboradores = async () => {
    try {
      // Usar RPC segura para não expor emails
      const { data: members, error } = await supabase.rpc('get_organization_members_masked');

      if (error) throw error;

      const userIds = members?.filter((m: any) => m.user_id).map((m: any) => m.user_id) || [];
      let profilesMap: { [key: string]: string } = {};

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', userIds);

        if (profiles) {
          profilesMap = profiles.reduce((acc, profile) => {
            if (profile.user_id && profile.full_name) {
              acc[profile.user_id] = profile.full_name;
            }
            return acc;
          }, {} as { [key: string]: string });
        }
      }

      setColaboradores(
        members?.filter((m: any) => m.user_id).map((m: any) => ({
          id: m.user_id || '',
          name: m.user_id && profilesMap[m.user_id] ? profilesMap[m.user_id] : 'Usuário',
          email: '' // Não expor email
        })) || []
      );
    } catch (error) {
      console.error('Erro ao carregar colaboradores:', error);
    }
  };

  const loadAllActivities = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadMessageActivities(),
        loadUserSessions(),
        loadSystemActivities()
      ]);
    } catch (error) {
      console.error('Erro ao carregar atividades:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessageActivities = async () => {
    const { data: messages, error } = await supabase
      .from('mensagens_chat')
      .select(`
        id,
        corpo_mensagem,
        direcao,
        data_hora,
        id_lead,
        leads (
          nome_lead,
          telefone_lead
        )
      `)
      .order('data_hora', { ascending: false })
      .limit(100);

    if (error) throw error;

    const activities: MessageActivity[] = (messages || []).map((msg: any) => ({
      id: `msg-${msg.id}`,
      tipo: 'mensagem' as const,
      colaborador_email: 'Sistema',
      lead_nome: msg.leads?.nome_lead || 'Lead desconhecido',
      lead_telefone: msg.leads?.telefone_lead || '',
      mensagem: msg.corpo_mensagem,
      direcao: msg.direcao,
      data_hora: msg.data_hora,
    }));

    setMessageActivities(activities);
  };

  const loadUserSessions = async () => {
    const { data: sessions, error } = await supabase
      .from('user_sessions')
      .select('*')
      .order('login_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const userIds = [...new Set(sessions?.map(s => s.user_id) || [])];
    let usersMap: { [key: string]: { name: string; avatar: string | null } } = {};

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url')
        .in('user_id', userIds);

      const { data: members } = await supabase
        .from('organization_members')
        .select('user_id, email')
        .in('user_id', userIds);

      if (profiles && members) {
        usersMap = profiles.reduce((acc, profile) => {
          const member = members.find(m => m.user_id === profile.user_id);
          if (profile.user_id) {
            acc[profile.user_id] = {
              name: profile.full_name || member?.email || 'Usuário',
              avatar: profile.avatar_url
            };
          }
          return acc;
        }, {} as { [key: string]: { name: string; avatar: string | null } });
      }
    }

    const sessionsWithUsers: UserSession[] = (sessions || []).map(session => ({
      id: session.id,
      user_id: session.user_id,
      user_name: usersMap[session.user_id]?.name || 'Usuário',
      user_avatar: usersMap[session.user_id]?.avatar || null,
      login_at: session.login_at,
      logout_at: session.logout_at,
      duration_minutes: session.duration_minutes
    }));

    setUserSessions(sessionsWithUsers);
  };

  const loadSystemActivities = async () => {
    const { data: activities, error } = await supabase
      .from('system_activities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const userIds = [...new Set(activities?.map(a => a.user_id) || [])];
    let usersMap: { [key: string]: { name: string; avatar: string | null } } = {};

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url')
        .in('user_id', userIds);

      const { data: members } = await supabase
        .from('organization_members')
        .select('user_id, email')
        .in('user_id', userIds);

      if (profiles && members) {
        usersMap = profiles.reduce((acc, profile) => {
          const member = members.find(m => m.user_id === profile.user_id);
          if (profile.user_id) {
            acc[profile.user_id] = {
              name: profile.full_name || member?.email || 'Usuário',
              avatar: profile.avatar_url
            };
          }
          return acc;
        }, {} as { [key: string]: { name: string; avatar: string | null } });
      }
    }

    const activitiesWithUsers: SystemActivity[] = (activities || []).map(activity => ({
      id: activity.id,
      user_id: activity.user_id,
      user_name: usersMap[activity.user_id]?.name || 'Usuário',
      user_avatar: usersMap[activity.user_id]?.avatar || null,
      activity_type: activity.activity_type,
      description: activity.description,
      lead_id: activity.lead_id,
      metadata: activity.metadata,
      created_at: activity.created_at
    }));

    setSystemActivities(activitiesWithUsers);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'lead_stage_changed':
        return <GitBranch className="h-4 w-4" />;
      case 'lead_responsible_assigned':
        return <UserCheck className="h-4 w-4" />;
      case 'tag_added':
        return <Tag className="h-4 w-4" />;
      case 'team_member_changed':
        return <UserCheck className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'lead_stage_changed':
        return 'bg-blue-500/10 text-blue-600';
      case 'lead_responsible_assigned':
        return 'bg-green-500/10 text-green-600';
      case 'tag_added':
        return 'bg-purple-500/10 text-purple-600';
      case 'team_member_changed':
        return 'bg-orange-500/10 text-orange-600';
      default:
        return 'bg-gray-500/10 text-gray-600';
    }
  };

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return '0 minutos';
    if (minutes < 60) return `${minutes} minutos`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}min`;
  };

  const filteredMessages = messageActivities.filter(activity => {
    const matchesSearch =
      activity.lead_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      activity.mensagem.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const filteredSessions = userSessions.filter(session => {
    const matchesSearch = session.user_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesColaborador =
      filterColaborador === 'todos' || session.user_id === filterColaborador;
    return matchesSearch && matchesColaborador;
  });

  const filteredSystemActivities = systemActivities.filter(activity => {
    const matchesSearch =
      activity.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      activity.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesColaborador =
      filterColaborador === 'todos' || activity.user_id === filterColaborador;
    return matchesSearch && matchesColaborador;
  });

  return (
    <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Histórico de Atividades</h1>
            <p className="text-muted-foreground">
              Acompanhe todas as atividades e interações no sistema
            </p>
          </div>
        </div>

        <Tabs defaultValue="messages" className="space-y-6">
          <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
            <TabsTrigger value="messages" className="flex items-center gap-2 rounded-none px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200">
              <MessageSquare className="h-4 w-4" />
              Mensagens
            </TabsTrigger>
            <TabsTrigger value="sessions" className="flex items-center gap-2 rounded-none px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200">
              <LogIn className="h-4 w-4" />
              Conexões
            </TabsTrigger>
            <TabsTrigger value="system" className="flex items-center gap-2 rounded-none px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200">
              <Activity className="h-4 w-4" />
              Outras Atividades
            </TabsTrigger>
          </TabsList>

          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterColaborador} onValueChange={setFilterColaborador}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Todos Colaboradores" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="todos">Todos Colaboradores</SelectItem>
                {colaboradores.map((colab) => (
                  <SelectItem key={colab.id} value={colab.id}>
                    {colab.name || colab.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <TabsContent value="messages" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Histórico de Mensagens</CardTitle>
                <CardDescription>Mensagens enviadas e recebidas pelos leads</CardDescription>
              </CardHeader>
              <CardContent>
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
                  ) : filteredMessages.length === 0 ? (
                    <div className="text-center py-12">
                      <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">Nenhuma mensagem encontrada</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredMessages.map((activity) => (
                        <div
                          key={activity.id}
                          className="flex gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                        >
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className={activity.direcao === 'ENTRADA' ? 'bg-blue-500/10' : 'bg-green-500/10'}>
                              <MessageSquare className="h-5 w-5" />
                            </AvatarFallback>
                          </Avatar>

                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant={activity.direcao === 'ENTRADA' ? 'default' : 'secondary'}>
                                {activity.direcao === 'ENTRADA' ? 'Entrada' : 'Saída'}
                              </Badge>
                              <span className="text-sm font-medium">{activity.lead_nome}</span>
                            </div>

                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {activity.mensagem}
                            </p>

                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sessions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Histórico de Conexões</CardTitle>
                <CardDescription>Registro de login e logout dos colaboradores</CardDescription>
              </CardHeader>
              <CardContent>
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
                  ) : filteredSessions.length === 0 ? (
                    <div className="text-center py-12">
                      <LogIn className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">Nenhuma sessão encontrada</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredSessions.map((session) => (
                        <div
                          key={session.id}
                          className="flex gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                        >
                          <Avatar className="h-10 w-10">
                            {session.user_avatar && (
                              <AvatarImage src={session.user_avatar} alt={session.user_name} />
                            )}
                            <AvatarFallback className="bg-muted">
                              {getInitials(session.user_name)}
                            </AvatarFallback>
                          </Avatar>

                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{session.user_name}</span>
                              {!session.logout_at && (
                                <Badge variant="default" className="bg-green-500">
                                  Online
                                </Badge>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <LogIn className="h-4 w-4" />
                                <span>
                                  Login:{' '}
                                  {formatDistanceToNow(new Date(session.login_at), {
                                    addSuffix: true,
                                    locale: ptBR,
                                  })}
                                </span>
                              </div>

                              {session.logout_at && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <LogOut className="h-4 w-4" />
                                  <span>
                                    Logout:{' '}
                                    {formatDistanceToNow(new Date(session.logout_at), {
                                      addSuffix: true,
                                      locale: ptBR,
                                    })}
                                  </span>
                                </div>
                              )}
                            </div>

                            {session.duration_minutes && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Clock className="h-4 w-4" />
                                <span>Duração: {formatDuration(session.duration_minutes)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="system" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Outras Atividades</CardTitle>
                <CardDescription>Mudanças de etapa, atribuições e tags</CardDescription>
              </CardHeader>
              <CardContent>
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
                  ) : filteredSystemActivities.length === 0 ? (
                    <div className="text-center py-12">
                      <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">Nenhuma atividade encontrada</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredSystemActivities.map((activity) => (
                        <div
                          key={activity.id}
                          className="flex gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex gap-3">
                            <Avatar className="h-10 w-10">
                              {activity.user_avatar && (
                                <AvatarImage src={activity.user_avatar} alt={activity.user_name} />
                              )}
                              <AvatarFallback className="bg-muted">
                                {getInitials(activity.user_name)}
                              </AvatarFallback>
                            </Avatar>

                            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${getActivityColor(activity.activity_type)}`}>
                              {getActivityIcon(activity.activity_type)}
                            </div>
                          </div>

                          <div className="flex-1 space-y-2">
                            <p className="text-sm">{activity.description}</p>

                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              <span>
                                {formatDistanceToNow(new Date(activity.created_at), {
                                  addSuffix: true,
                                  locale: ptBR,
                                })}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
    </div>
  );
}
