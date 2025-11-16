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
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Lead } from "@/types/chat";
import { Mail, Phone, MessageSquare, FileText, X } from "lucide-react";
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
      <DialogContent className="max-w-5xl h-[90vh] p-0 gap-0">
        <div className="flex flex-col h-full">
          {/* Header */}
          <DialogHeader className="px-6 py-4 border-b">
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
          <div className="flex-1 overflow-hidden">
            <div className="h-full flex">
              {/* Main Content */}
              <div className="flex-1 overflow-y-auto">
                <Tabs defaultValue="contatos" className="w-full">
                  <TabsList className="w-full justify-start rounded-none border-b px-6 bg-transparent h-12">
                    <TabsTrigger value="contatos" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
                      Contatos
                    </TabsTrigger>
                    <TabsTrigger value="atividades" className="rounded-none data-[state=active]:border-b-2 data-[state=active]:border-primary">
                      Histórico de atividades
                    </TabsTrigger>
                  </TabsList>

                  <div className="p-6">
                    <TabsContent value="contatos" className="mt-0 space-y-6">
                      {/* Valor do negócio */}
                      <div className="space-y-3">
                        <h3 className="font-semibold text-sm text-foreground">Valor do negócio</h3>
                        <div className="space-y-2">
                          <Label htmlFor="value" className="text-xs text-muted-foreground">Produto e serviços</Label>
                          <div className="flex items-center gap-2">
                            <span className="text-2xl font-bold text-foreground">R$</span>
                            <Input
                              id="value"
                              type="text"
                              value={editedValue}
                              onChange={(e) => setEditedValue(e.target.value)}
                              className="text-2xl font-bold h-auto py-1 border-0 border-b rounded-none px-0"
                            />
                          </div>
                        </div>
                      </div>

                      <Separator />

                      {/* Dados do negócio */}
                      <div className="space-y-3">
                        <h3 className="font-semibold text-sm text-foreground">Dados do negócio</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Responsável</Label>
                            <div className="flex items-center gap-2 text-sm">
                              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="text-xs font-medium text-primary">B</span>
                              </div>
                              <span>Brito</span>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Empresa</Label>
                            <Input
                              value={editedEmpresa}
                              onChange={(e) => setEditedEmpresa(e.target.value)}
                              placeholder="Nome da empresa"
                              className="h-8"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Data de início</Label>
                            <Input
                              type="date"
                              defaultValue={new Date(lead.created_at).toISOString().split('T')[0]}
                              className="h-8"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Última atualização</Label>
                            <Input
                              type="date"
                              defaultValue={new Date(lead.updated_at).toISOString().split('T')[0]}
                              className="h-8"
                              disabled
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Descrição</Label>
                          <Textarea
                            placeholder="Adicionar descrição"
                            className="resize-none"
                            rows={3}
                          />
                        </div>
                      </div>

                      <Separator />

                      {/* Dados do contato */}
                      <div className="space-y-3">
                        <h3 className="font-semibold text-sm text-foreground">Dados do contato</h3>
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <span className="font-medium text-primary">
                                {editedName.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <Input
                                value={editedName}
                                onChange={(e) => setEditedName(e.target.value)}
                                className="font-medium"
                              />
                            </div>
                          </div>

                          <div className="grid gap-3">
                            <div className="grid grid-cols-[100px_1fr] items-center gap-3">
                              <Label className="text-xs text-muted-foreground">Email</Label>
                              <Input
                                type="email"
                                value={editedEmail}
                                onChange={(e) => setEditedEmail(e.target.value)}
                                placeholder="email@exemplo.com"
                                className="h-8"
                              />
                            </div>
                            <div className="grid grid-cols-[100px_1fr] items-center gap-3">
                              <Label className="text-xs text-muted-foreground">Telefone</Label>
                              <Input
                                value={editedPhone}
                                onChange={(e) => setEditedPhone(e.target.value)}
                                placeholder="(00) 00000-0000"
                                className="h-8"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="atividades" className="mt-0">
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="text-muted-foreground text-sm">
                          Nenhuma atividade registrada
                        </div>
                      </div>
                    </TabsContent>
                  </div>
                </Tabs>
              </div>

              {/* Sidebar de Ações */}
              <div className="w-64 border-l bg-muted/20 p-4 space-y-4">
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm text-foreground mb-3">Ações</h3>
                  <Button className="w-full justify-start gap-2 bg-primary hover:bg-primary/90" size="sm">
                    <Mail className="h-4 w-4" />
                    Enviar e-mail
                  </Button>
                  <Button className="w-full justify-start gap-2 bg-blue-600 hover:bg-blue-700" size="sm">
                    <Phone className="h-4 w-4" />
                    Fazer ligação
                  </Button>
                  <Button className="w-full justify-start gap-2 bg-purple-600 hover:bg-purple-700" size="sm">
                    <FileText className="h-4 w-4" />
                    Gerar proposta
                  </Button>
                  <Button className="w-full justify-start gap-2 bg-green-600 hover:bg-green-700" size="sm">
                    <MessageSquare className="h-4 w-4" />
                    Enviar WhatsApp
                  </Button>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Button
                      variant="outline"
                      onClick={onClose}
                      disabled={isSaving}
                      size="sm"
                      className="flex-1 mr-2"
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleSaveChanges}
                      disabled={isSaving}
                      size="sm"
                      className="flex-1"
                    >
                      {isSaving ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
