import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Phone, Mail, Building, Calendar, DollarSign, MessageSquare, Activity, Loader2, FileText, Paperclip } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface LeadData {
  id: string;
  nome_lead: string;
  telefone_lead: string;
  email: string | null;
  empresa: string | null;
  valor: number | null;
  descricao_negocio: string | null;
  created_at: string;
  stage: string | null;
  source: string | null;
}

interface ActivityWithUser {
  id: string;
  activity_type: string;
  content: string;
  created_at: string;
  user_name: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
}

const LeadDetails = () => {
  const { id: leadId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [leadData, setLeadData] = useState<LeadData | null>(null);
  const [activities, setActivities] = useState<ActivityWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    if (leadId) {
      loadLeadDetails();
    }
  }, [leadId]);

  const loadLeadDetails = async () => {
    if (!leadId) return;
    
    setLoading(true);
    try {
      // Fetch lead data
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('id, nome_lead, telefone_lead, email, empresa, valor, descricao_negocio, created_at, stage, source')
        .eq('id', leadId)
        .maybeSingle();

      if (leadError) throw leadError;
      
      if (!lead) {
        toast.error("Lead não encontrado");
        navigate('/leads');
        return;
      }

      setLeadData(lead);

      // Fetch activities with user names
      const { data: activitiesData, error: activitiesError } = await supabase
        .from('lead_activities')
        .select('id, activity_type, content, created_at, user_id, attachment_url, attachment_name')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      if (activitiesError) throw activitiesError;

      // Get user names for activities
      if (activitiesData && activitiesData.length > 0) {
        const userIds = [...new Set(activitiesData.map(a => a.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', userIds);

        const profileMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);

        const activitiesWithUsers: ActivityWithUser[] = activitiesData.map(activity => ({
          id: activity.id,
          activity_type: activity.activity_type,
          content: activity.content,
          created_at: activity.created_at,
          user_name: profileMap.get(activity.user_id) || 'Usuário',
          attachment_url: activity.attachment_url,
          attachment_name: activity.attachment_name,
        }));

        setActivities(activitiesWithUsers);
      } else {
        setActivities([]);
      }
    } catch (error) {
      console.error('Error loading lead details:', error);
      toast.error("Erro ao carregar detalhes do lead");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNote = async () => {
    if (!newNote.trim() || !leadId || !user) return;

    setSavingNote(true);
    try {
      const { error } = await supabase
        .from('lead_activities')
        .insert({
          lead_id: leadId,
          user_id: user.id,
          activity_type: 'note',
          content: newNote.trim(),
        });

      if (error) throw error;

      toast.success("Anotação salva com sucesso");
      setNewNote("");
      loadLeadDetails(); // Refresh activities
    } catch (error) {
      console.error('Error saving note:', error);
      toast.error("Erro ao salvar anotação");
    } finally {
      setSavingNote(false);
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'call':
        return <Phone className="h-4 w-4 text-primary" />;
      case 'email':
        return <Mail className="h-4 w-4 text-primary" />;
      case 'note':
        return <MessageSquare className="h-4 w-4 text-primary" />;
      case 'meeting':
        return <Calendar className="h-4 w-4 text-primary" />;
      case 'document':
        return <FileText className="h-4 w-4 text-primary" />;
      default:
        return <Activity className="h-4 w-4 text-primary" />;
    }
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return 'Não informado';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "dd 'de' MMMM, yyyy", { locale: ptBR });
    } catch {
      return dateString;
    }
  };

  const formatDateTime = (dateString: string) => {
    try {
      return format(new Date(dateString), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return dateString;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!leadData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Lead não encontrado</p>
        <Link to="/leads">
          <Button variant="outline">Voltar para Leads</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/leads">
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{leadData.nome_lead}</h1>
          {leadData.empresa && <p className="text-muted-foreground">{leadData.empresa}</p>}
        </div>
        {leadData.stage && <Badge>{leadData.stage}</Badge>}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Histórico de Atividades
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma atividade registrada
                </p>
              ) : (
                <div className="space-y-4">
                  {activities.map((activity) => (
                    <div key={activity.id} className="flex gap-4 pb-4 border-b last:border-0 last:pb-0">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        {getActivityIcon(activity.activity_type)}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{activity.content}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDateTime(activity.created_at)} • {activity.user_name}
                        </p>
                        {activity.attachment_url && (
                          <a
                            href={activity.attachment_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                          >
                            <Paperclip className="h-3 w-3" />
                            {activity.attachment_name || 'Anexo'}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                Anotações Rápidas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea 
                placeholder="Adicione uma anotação sobre este lead..." 
                className="min-h-[100px]"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
              <Button 
                className="w-full" 
                onClick={handleSaveNote}
                disabled={!newNote.trim() || savingNote}
              >
                {savingNote ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  'Salvar Anotação'
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informações do Lead</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {leadData.empresa && (
                <div className="flex items-start gap-3">
                  <Building className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Empresa</p>
                    <p className="text-sm text-muted-foreground">{leadData.empresa}</p>
                  </div>
                </div>
              )}
              
              {leadData.email && (
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Email</p>
                    <p className="text-sm text-muted-foreground">{leadData.email}</p>
                  </div>
                </div>
              )}
              
              <div className="flex items-start gap-3">
                <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Telefone</p>
                  <p className="text-sm text-muted-foreground">{leadData.telefone_lead}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <DollarSign className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Valor Estimado</p>
                  <p className="text-lg font-bold text-primary">{formatCurrency(leadData.valor)}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Criado em</p>
                  <p className="text-sm text-muted-foreground">{formatDate(leadData.created_at)}</p>
                </div>
              </div>

              {leadData.descricao_negocio && (
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium mb-1">Descrição</p>
                  <p className="text-sm text-muted-foreground">{leadData.descricao_negocio}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ações Rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {leadData.telefone_lead && (
                <Button 
                  className="w-full justify-start gap-2" 
                  variant="outline"
                  onClick={() => window.open(`tel:${leadData.telefone_lead}`, '_blank')}
                >
                  <Phone className="h-4 w-4" />
                  Fazer Ligação
                </Button>
              )}
              {leadData.email && (
                <Button 
                  className="w-full justify-start gap-2" 
                  variant="outline"
                  onClick={() => window.open(`mailto:${leadData.email}`, '_blank')}
                >
                  <Mail className="h-4 w-4" />
                  Enviar Email
                </Button>
              )}
              <Button 
                className="w-full justify-start gap-2" 
                variant="outline"
                onClick={() => navigate(`/chat?lead=${leadId}`)}
              >
                <MessageSquare className="h-4 w-4" />
                Abrir Chat
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default LeadDetails;
