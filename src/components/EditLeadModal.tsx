import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Lead } from "@/types/chat";
import { Mail, Phone, MessageSquare, FileText, X, Pencil, Video, MapPin } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface EditLeadModalProps {
  lead: Lead;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export const EditLeadModal = ({ lead, open, onClose, onUpdate }: EditLeadModalProps) => {
  const [editedName, setEditedName] = useState(lead.nome_lead);
  const [editedPhone, setEditedPhone] = useState(lead.telefone_lead);
  const [editedEmail, setEditedEmail] = useState(lead.email || "");
  const [editedValue, setEditedValue] = useState(lead.valor?.toString() || "0");
  const [editedStage, setEditedStage] = useState(lead.stage || "NOVO");
  const [editedEmpresa, setEditedEmpresa] = useState(lead.empresa || "");
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveChanges = async () => {
    if (!editedName.trim()) {
      toast.error("O nome do lead é obrigatório");
      return;
    }

    if (!editedPhone.trim()) {
      toast.error("O telefone do lead é obrigatório");
      return;
    }

    setIsSaving(true);

    try {
      const updateData: any = {
        nome_lead: editedName.trim(),
        telefone_lead: editedPhone.trim(),
        email: editedEmail.trim() || null,
        empresa: editedEmpresa.trim() || null,
        stage: editedStage,
      };

      if (editedValue.trim()) {
        const numericValue = parseFloat(editedValue.replace(/[^\d.,]/g, '').replace(',', '.'));
        if (!isNaN(numericValue)) {
          updateData.valor = numericValue;
        }
      }

      const { error } = await supabase
        .from("leads")
        .update(updateData)
        .eq("id", lead.id);

      if (error) throw error;

      toast.success("Lead atualizado com sucesso!");
      onClose();
      onUpdate();
    } catch (error) {
      console.error("Erro ao atualizar lead:", error);
      toast.error("Erro ao atualizar lead");
    } finally {
      setIsSaving(false);
    }
  };

  const getStageLabel = (stage: string) => {
    const stages: Record<string, string> = {
      NOVO: "Novo Lead",
      EM_ATENDIMENTO: "Em Atendimento",
      FECHADO: "Fechado",
      PERDIDO: "Perdido"
    };
    return stages[stage] || stage;
  };

  const getStageColor = (stage: string) => {
    const colors: Record<string, string> = {
      NOVO: "bg-blue-500",
      EM_ATENDIMENTO: "bg-yellow-500",
      FECHADO: "bg-green-500",
      PERDIDO: "bg-red-500"
    };
    return colors[stage] || "bg-gray-500";
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[90vh] p-0 gap-0 flex flex-col">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-xl">
                {lead.nome_lead}
              </DialogTitle>
              <Badge className={`${getStageColor(editedStage)} text-white`}>
                {getStageLabel(editedStage)}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-6 w-6"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Main Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                {/* Funil de Vendas */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                    <FileText className="h-4 w-4" />
                    <span>Funil de Vendas</span>
                  </div>
                  <div className="flex items-center w-full -space-x-6">
                    {/* Contato - Primeira etapa */}
                    <div 
                      className={`flex-1 relative h-12 flex items-center justify-center text-sm font-semibold transition-all duration-200 cursor-pointer ${
                        editedStage === 'NOVO' 
                          ? 'bg-[hsl(250,90%,60%)] text-white hover:brightness-110 z-10' 
                          : 'bg-[hsl(220,13%,91%)] text-gray-700 hover:bg-[hsl(220,13%,85%)]'
                      }`}
                      style={{
                        clipPath: 'polygon(0 0, calc(100% - 24px) 0, 100% 50%, calc(100% - 24px) 100%, 0 100%)'
                      }}
                    >
                      <span className="relative z-10 pr-6 pl-4">Contato</span>
                    </div>
                    
                    {/* Envio de proposta */}
                    <div 
                      className={`flex-1 relative h-12 flex items-center justify-center text-sm font-semibold transition-all duration-200 cursor-pointer ${
                        editedStage === 'EM_ATENDIMENTO' 
                          ? 'bg-[hsl(250,90%,60%)] text-white hover:brightness-110 z-10' 
                          : 'bg-[hsl(220,13%,91%)] text-gray-700 hover:bg-[hsl(220,13%,85%)]'
                      }`}
                      style={{
                        clipPath: 'polygon(24px 0, calc(100% - 24px) 0, 100% 50%, calc(100% - 24px) 100%, 24px 100%, 0 50%)'
                      }}
                    >
                      <span className="relative z-10 px-1">Envio de proposta</span>
                    </div>
                    
                    {/* Follow-up */}
                    <div 
                      className={`flex-1 relative h-12 flex items-center justify-center text-sm font-semibold transition-all duration-200 cursor-pointer ${
                        editedStage === 'FOLLOW_UP' 
                          ? 'bg-[hsl(250,90%,60%)] text-white hover:brightness-110 z-10' 
                          : 'bg-[hsl(220,13%,91%)] text-gray-700 hover:bg-[hsl(220,13%,85%)]'
                      }`}
                      style={{
                        clipPath: 'polygon(24px 0, calc(100% - 24px) 0, 100% 50%, calc(100% - 24px) 100%, 24px 100%, 0 50%)'
                      }}
                    >
                      <span className="relative z-10 px-1">Follow-up</span>
                    </div>
                    
                    {/* Fechamento - Última etapa */}
                    <div 
                      className={`flex-1 relative h-12 flex items-center justify-center text-sm font-semibold transition-all duration-200 cursor-pointer ${
                        editedStage === 'FECHADO' 
                          ? 'bg-[hsl(250,90%,60%)] text-white hover:brightness-110 z-10' 
                          : 'bg-[hsl(220,13%,91%)] text-gray-700 hover:bg-[hsl(220,13%,85%)]'
                      }`}
                      style={{
                        clipPath: 'polygon(24px 0, 100% 0, 100% 100%, 24px 100%, 0 50%)'
                      }}
                    >
                      <span className="relative z-10 pl-6 pr-4">Fechamento</span>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Tabs de Ações */}
                <Tabs defaultValue="nota" className="w-full">
                  <TabsList className="w-full justify-start bg-transparent border-b rounded-none h-auto p-0">
                    <TabsTrigger value="nota" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
                      <Pencil className="h-4 w-4" />
                      Nota
                    </TabsTrigger>
                    <TabsTrigger value="email" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
                      <Mail className="h-4 w-4" />
                      E-mail
                    </TabsTrigger>
                    <TabsTrigger value="ligacao" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
                      <Phone className="h-4 w-4" />
                      Ligação
                    </TabsTrigger>
                    <TabsTrigger value="whatsapp" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
                      <MessageSquare className="h-4 w-4" />
                      WhatsApp
                    </TabsTrigger>
                    <TabsTrigger value="proposta" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
                      <FileText className="h-4 w-4" />
                      Proposta
                    </TabsTrigger>
                    <TabsTrigger value="reuniao" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
                      <Video className="h-4 w-4" />
                      Reunião
                    </TabsTrigger>
                    <TabsTrigger value="visita" className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary">
                      <MapPin className="h-4 w-4" />
                      Visita
                    </TabsTrigger>
                  </TabsList>

                  <div className="mt-4">
                    <TabsContent value="nota" className="mt-0">
                      <Textarea
                        placeholder="O que foi feito e qual o próximo passo?"
                        className="min-h-[120px] resize-none"
                      />
                      <div className="flex justify-end mt-3">
                        <Button variant="link" size="sm" className="text-primary">
                          + Modelos
                        </Button>
                      </div>
                    </TabsContent>
                    <TabsContent value="email" className="mt-0">
                      <Textarea
                        placeholder="Escreva seu e-mail..."
                        className="min-h-[120px] resize-none"
                      />
                    </TabsContent>
                    <TabsContent value="ligacao" className="mt-0">
                      <Textarea
                        placeholder="Notas sobre a ligação..."
                        className="min-h-[120px] resize-none"
                      />
                    </TabsContent>
                    <TabsContent value="whatsapp" className="mt-0">
                      <Textarea
                        placeholder="Escreva sua mensagem..."
                        className="min-h-[120px] resize-none"
                      />
                    </TabsContent>
                    <TabsContent value="proposta" className="mt-0">
                      <Textarea
                        placeholder="Detalhes da proposta..."
                        className="min-h-[120px] resize-none"
                      />
                    </TabsContent>
                    <TabsContent value="reuniao" className="mt-0">
                      <Textarea
                        placeholder="Notas sobre a reunião..."
                        className="min-h-[120px] resize-none"
                      />
                    </TabsContent>
                    <TabsContent value="visita" className="mt-0">
                      <Textarea
                        placeholder="Notas sobre a visita..."
                        className="min-h-[120px] resize-none"
                      />
                    </TabsContent>
                  </div>
                </Tabs>

                <Separator />

                {/* Histórico de atividades */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-base">Histórico de atividades</h3>
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="text-muted-foreground text-sm">
                      Nenhuma atividade registrada
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      Que tal agendar uma ligação para evoluir este negócio?
                    </p>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>

          {/* Sidebar de Ações e Dados */}
          <div className="w-80 border-l bg-muted/20 flex flex-col flex-shrink-0 overflow-y-auto">
            <div className="p-4 space-y-4">
              {/* Ações */}
              <Card className="bg-primary/5 border-primary/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Ações</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2">
                  <Button className="justify-start gap-2 bg-emerald-600 hover:bg-emerald-700 text-white h-auto py-3 flex-col items-center" size="sm">
                    <Mail className="h-5 w-5" />
                    <span className="text-xs">Enviar e-mail</span>
                  </Button>
                  <Button className="justify-start gap-2 bg-blue-600 hover:bg-blue-700 text-white h-auto py-3 flex-col items-center" size="sm">
                    <Phone className="h-5 w-5" />
                    <span className="text-xs">Fazer ligação</span>
                  </Button>
                  <Button className="justify-start gap-2 bg-purple-600 hover:bg-purple-700 text-white h-auto py-3 flex-col items-center" size="sm">
                    <FileText className="h-5 w-5" />
                    <span className="text-xs">Gerar proposta</span>
                  </Button>
                  <Button className="justify-start gap-2 bg-green-600 hover:bg-green-700 text-white h-auto py-3 flex-col items-center" size="sm">
                    <MessageSquare className="h-5 w-5" />
                    <span className="text-xs">Enviar WhatsApp</span>
                  </Button>
                </CardContent>
              </Card>

              {/* Valor do negócio */}
              <Card className="bg-primary/5 border-primary/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Valor do negócio</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold">R$ {parseFloat(editedValue || "0").toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Produtos e serviços</Label>
                    <p className="text-sm text-muted-foreground">
                      Nenhum produto ou serviço foi adicionado a este negócio
                    </p>
                    <Button variant="link" className="text-primary p-0 h-auto text-sm">
                      + Adicionar produtos/serviços
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Dados do negócio */}
              <Card className="bg-primary/5 border-primary/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Dados do negócio</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-start justify-between">
                    <span className="text-muted-foreground">Responsável</span>
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-medium text-primary">B</span>
                      </div>
                      <span className="font-medium">Brito</span>
                    </div>
                  </div>

                  <div className="flex items-start justify-between">
                    <span className="text-muted-foreground">Data de início</span>
                    <span className="font-medium">Hoje</span>
                  </div>

                  <div className="flex items-start justify-between">
                    <span className="text-muted-foreground">Data de conclusão</span>
                    <span className="text-muted-foreground">Adicionar</span>
                  </div>

                  <div className="flex items-start justify-between">
                    <span className="text-muted-foreground">Descrição</span>
                    <span className="text-muted-foreground">Adicionar descrição</span>
                  </div>

                  <Separator className="my-2" />

                  <div className="flex items-start justify-between">
                    <span className="text-muted-foreground">Cadastrado por</span>
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-medium text-primary">B</span>
                      </div>
                      <span className="font-medium">Brito</span>
                    </div>
                  </div>

                  <div className="flex items-start justify-between">
                    <span className="text-muted-foreground">Data de cadastro</span>
                    <span className="font-medium">
                      {new Date(lead.created_at).toLocaleDateString('pt-BR') === new Date().toLocaleDateString('pt-BR') 
                        ? `Hoje às ${new Date(lead.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                        : new Date(lead.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>

                  <div className="flex items-start justify-between">
                    <span className="text-muted-foreground">Última atualização</span>
                    <span className="font-medium">
                      {new Date(lead.updated_at).toLocaleDateString('pt-BR') === new Date().toLocaleDateString('pt-BR') 
                        ? `Hoje às ${new Date(lead.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                        : new Date(lead.updated_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Botões de ação fixos no rodapé */}
            <div className="mt-auto p-4 border-t bg-background">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={onClose}
                  disabled={isSaving}
                  size="sm"
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSaveChanges}
                  disabled={isSaving}
                  size="sm"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isSaving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
