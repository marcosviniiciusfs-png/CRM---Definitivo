import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Lead, Message } from "@/types/chat";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Send, Phone, Search, Check, CheckCheck, Clock, Loader2 } from "lucide-react";
import { formatPhoneNumber } from "@/lib/utils";

const Chat = () => {
  const location = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Carregar leads e configurar realtime
  useEffect(() => {
    loadLeads();

    // Se veio um lead selecionado da página Leads
    if (location.state?.selectedLead) {
      setSelectedLead(location.state.selectedLead);
    }

    // Configurar realtime para atualizações automáticas
    const channel = supabase
      .channel('leads-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads'
        },
        () => {
          loadLeads();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [location.state]);

  // Carregar mensagens quando um lead é selecionado e configurar realtime
  useEffect(() => {
    if (selectedLead) {
      loadMessages(selectedLead.id);

      // Configurar realtime para mensagens do lead selecionado
      const messagesChannel = supabase
        .channel(`messages-${selectedLead.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'mensagens_chat',
            filter: `id_lead=eq.${selectedLead.id}`
          },
          (payload) => {
            console.log('Mensagem recebida em realtime:', payload);
            // Recarregar mensagens
            loadMessages(selectedLead.id);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(messagesChannel);
      };
    }
  }, [selectedLead]);

  // Auto-scroll para última mensagem
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadLeads = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setLeads(data || []);
    } catch (error) {
      console.error("Erro ao carregar leads:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os contatos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (leadId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("mensagens_chat")
        .select("*")
        .eq("id_lead", leadId)
        .order("data_hora", { ascending: true });

      if (error) throw error;
      setMessages((data || []) as Message[]);
    } catch (error) {
      console.error("Erro ao carregar mensagens:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as mensagens",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || !selectedLead) return;

    setSending(true);
    try {
      // Buscar a organização do usuário
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error('Usuário não autenticado');

      const { data: memberData, error: memberError } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', currentUser.id)
        .single();

      if (memberError || !memberData) {
        console.error('❌ Erro ao buscar organização:', memberError);
        throw new Error('Erro ao buscar organização do usuário.');
      }

      // Buscar a instância conectada da organização
      const { data: instanceData, error: instanceError } = await supabase
        .from('whatsapp_instances')
        .select('instance_name, id, status')
        .eq('organization_id', memberData.organization_id)
        .eq('status', 'CONNECTED')
        .order('connected_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (instanceError) {
        console.error('❌ Erro ao buscar instância:', instanceError);
        throw new Error('Erro ao buscar instância WhatsApp. Tente novamente.');
      }

      if (!instanceData) {
        console.warn('⚠️ Nenhuma instância conectada encontrada para a organização');
        throw new Error('Nenhuma instância WhatsApp conectada. Por favor, peça ao administrador para conectar o WhatsApp nas Configurações.');
      }

      console.log('📱 Instância encontrada:', {
        name: instanceData.instance_name,
        id: instanceData.id,
        status: instanceData.status
      });

      // Nome do usuário logado ou fallback para "Atendente"
      const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || "Atendente";
      
      // Formatar mensagem: *Nome:* com quebra de linha
      const messageForEvolution = `*${userName}:*\n${text.trim()}`;

      console.log('📤 Enviando mensagem:', {
        instance: instanceData.instance_name,
        to: selectedLead.telefone_lead,
        message: messageForEvolution
      });

      // Call edge function to send message via Evolution API
      const { data, error } = await supabase.functions.invoke('send-whatsapp-message', {
        body: {
          instance_name: instanceData.instance_name,
          remoteJid: selectedLead.telefone_lead,
          message_text: messageForEvolution,
          leadId: selectedLead.id,
        },
      });

      if (error) {
        console.error('❌ Erro na invocação da função:', error);
        throw error;
      }

      if (!data || !data.success) {
        const errorMessage = data?.error || 'Erro desconhecido ao enviar mensagem';
        console.error('❌ Resposta de erro da função:', data);
        throw new Error(errorMessage);
      }

      console.log('✅ Mensagem enviada com sucesso:', {
        messageId: data.messageId,
        evolutionData: data.evolutionData
      });

      // Reload messages after sending
      await loadMessages(selectedLead.id);
      setNewMessage("");

      toast({
        title: "Mensagem enviada",
        description: "Sua mensagem foi enviada via WhatsApp",
      });
    } catch (error: any) {
      console.error("❌ Erro ao enviar mensagem:", error);
      
      // Extrair mensagem de erro mais específica
      let errorMessage = "Não foi possível enviar a mensagem";
      
      if (error.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      toast({
        title: "Erro ao enviar",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(newMessage);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case "SENT":
        return <Check className="h-3 w-3" />;
      case "DELIVERED":
        return <CheckCheck className="h-3 w-3" />;
      case "READ":
        return <CheckCheck className="h-3 w-3 text-primary" />;
      default:
        return <Clock className="h-3 w-3" />;
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const filteredLeads = leads.filter(
    (lead) =>
      lead.nome_lead.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.telefone_lead.includes(searchQuery)
  );

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Lista de Leads - Coluna Esquerda */}
      <Card className="w-80 flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold mb-3">Conversas</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar contato..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {loading && !selectedLead ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              <p>Nenhum contato encontrado</p>
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {filteredLeads.map((lead) => (
                <button
                  key={lead.id}
                  onClick={() => setSelectedLead(lead)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors ${
                    selectedLead?.id === lead.id ? "bg-muted" : ""
                  }`}
                >
                  <Avatar>
                    <AvatarImage src={lead.avatar_url || undefined} alt={lead.nome_lead} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {getInitials(lead.nome_lead)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-left overflow-hidden">
                    <p className="font-medium truncate">{lead.nome_lead}</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {formatPhoneNumber(lead.telefone_lead)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </Card>

      {/* Área de Chat - Coluna Direita */}
      <Card className="flex-1 flex flex-col">
        {selectedLead ? (
          <>
            {/* Cabeçalho do Chat */}
            <div className="p-4 border-b flex items-center gap-3">
            <Avatar>
              <AvatarImage src={selectedLead.avatar_url || undefined} alt={selectedLead.nome_lead} />
              <AvatarFallback className="bg-primary/10 text-primary">
                {getInitials(selectedLead.nome_lead)}
              </AvatarFallback>
            </Avatar>
              <div>
                <h2 className="font-semibold">{selectedLead.nome_lead}</h2>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {formatPhoneNumber(selectedLead.telefone_lead)}
                </p>
              </div>
            </div>

            {/* Área de Mensagens */}
            <ScrollArea className="flex-1 p-4">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p>Nenhuma mensagem ainda. Inicie a conversa!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.direcao === "SAIDA"
                          ? "justify-end"
                          : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[70%] rounded-lg p-3 ${
                          message.direcao === "SAIDA"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap">
                          {message.corpo_mensagem}
                        </p>
                        <div
                          className={`flex items-center gap-1 mt-1 text-xs ${
                            message.direcao === "SAIDA"
                              ? "text-primary-foreground/70"
                              : "text-muted-foreground"
                          }`}
                        >
                          <span>{formatTime(message.data_hora)}</span>
                          {message.direcao === "SAIDA" && (
                            <span className="ml-1">
                              {getStatusIcon(message.status_entrega)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Input de Mensagem */}
            <form
              onSubmit={handleSendMessage}
              className="p-4 border-t flex gap-2"
            >
              <Input
                placeholder="Digite sua mensagem..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                disabled={sending}
                className="flex-1"
              />
              <Button type="submit" disabled={sending || !newMessage.trim()}>
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Selecione um contato para iniciar a conversa</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default Chat;
