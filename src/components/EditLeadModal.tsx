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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Lead } from "@/types/chat";
import { Mail, Phone, MessageSquare, FileText, X, Pencil, Video, MapPin, Paperclip, User, Trash2, Check, LucideIcon } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import * as Icons from "lucide-react";
import { FaTooth } from "react-icons/fa";

// Wrapper para ícone do react-icons
const ToothIcon: React.FC<{ className?: string }> = ({ className }) => (
  <FaTooth className={className} />
);

// Mapa de ícones customizados (não-lucide)
const customIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Tooth: ToothIcon,
};

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
  const [isUpdatingStage, setIsUpdatingStage] = useState(false);
  const [activityContent, setActivityContent] = useState("");
  const [activities, setActivities] = useState<any[]>([]);
  const [currentTab, setCurrentTab] = useState("nota");
  const [isLoadingActivities, setIsLoadingActivities] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [editingFile, setEditingFile] = useState<File | null>(null);
  const [editingKeepCurrentAttachment, setEditingKeepCurrentAttachment] = useState(true);
  const [editingCurrentAttachment, setEditingCurrentAttachment] = useState<{ url: string; name: string } | null>(null);
  const [deletingActivityId, setDeletingActivityId] = useState<string | null>(null);
  
  // Estados para edição dos dados do negócio
  const [editingResponsavel, setEditingResponsavel] = useState(false);
  const [editingDataInicio, setEditingDataInicio] = useState(false);
  const [editingDataConclusao, setEditingDataConclusao] = useState(false);
  const [editingDescricao, setEditingDescricao] = useState(false);
  const [dataInicio, setDataInicio] = useState<Date | undefined>(new Date());
  const [dataConclusao, setDataConclusao] = useState<Date | undefined>(undefined);
  const [descricao, setDescricao] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [colaboradores, setColaboradores] = useState<Array<{ 
    id: string; 
    email: string; 
    user_id: string | null;
    full_name?: string;
  }>>([]);

  // Estados para produtos/serviços
  const [availableItems, setAvailableItems] = useState<any[]>([]);
  const [leadItems, setLeadItems] = useState<any[]>([]);
  const [showItemsDialog, setShowItemsDialog] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(false);

  useEffect(() => {
    if (open) {
      fetchActivities();
      fetchColaboradores();
      loadDadosNegocio();
      fetchAvailableItems();
      fetchLeadItems();
    }
  }, [open]);

  const loadDadosNegocio = async () => {
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('responsavel, data_inicio, data_conclusao, descricao_negocio')
        .eq('id', lead.id)
        .single();

      if (error) throw error;

      if (data) {
        setResponsavel(data.responsavel || '');
        setDataInicio(data.data_inicio ? new Date(data.data_inicio) : new Date());
        setDataConclusao(data.data_conclusao ? new Date(data.data_conclusao) : undefined);
        setDescricao(data.descricao_negocio || '');
      } else {
        // Se não tem dados, definir usuário atual como responsável
        setCurrentUserAsResponsavel();
      }
    } catch (error) {
      console.error('Erro ao carregar dados do negócio:', error);
      setCurrentUserAsResponsavel();
    }
  };

  const saveDadosNegocio = async () => {
    try {
      const { error } = await supabase
        .from('leads')
        .update({
          responsavel: responsavel,
          data_inicio: dataInicio?.toISOString(),
          data_conclusao: dataConclusao?.toISOString() || null,
          descricao_negocio: descricao
        })
        .eq('id', lead.id);

      if (error) throw error;

      toast.success('Dados do negócio salvos com sucesso!');
      onUpdate();
    } catch (error) {
      console.error('Erro ao salvar dados do negócio:', error);
      toast.error('Erro ao salvar dados do negócio');
    }
  };

  const setCurrentUserAsResponsavel = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        // Buscar perfil do usuário
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', user.id)
          .single();
        
        // Usar nome do perfil se disponível, senão usar email
        setResponsavel(profile?.full_name || user.email || '');
      }
    } catch (error) {
      console.error("Erro ao obter usuário atual:", error);
    }
  };

  const fetchColaboradores = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Buscar organization_id do lead
      const { data: leadData } = await supabase
        .from("leads")
        .select("organization_id")
        .eq("id", lead.id)
        .single();

      if (!leadData?.organization_id) return;

      const { data, error } = await supabase
        .from("organization_members")
        .select("id, email, user_id")
        .eq("organization_id", leadData.organization_id);

      if (error) throw error;
      
      // Buscar perfis dos colaboradores
      if (data && data.length > 0) {
        const userIds = data.filter(m => m.user_id).map(m => m.user_id);
        
        let profilesMap: { [key: string]: { full_name: string | null } } = {};
        
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('user_id, full_name')
            .in('user_id', userIds);
          
          if (profiles) {
            profilesMap = profiles.reduce((acc, profile) => {
              acc[profile.user_id] = { full_name: profile.full_name };
              return acc;
            }, {} as { [key: string]: { full_name: string | null } });
          }
        }
        
        // Adicionar full_name aos colaboradores
        const colabsWithNames = data.map(colab => ({
          ...colab,
          full_name: colab.user_id && profilesMap[colab.user_id]
            ? profilesMap[colab.user_id].full_name
            : null
        }));
        
        console.log("Colaboradores carregados:", colabsWithNames);
        setColaboradores(colabsWithNames);
      }
    } catch (error) {
      console.error("Erro ao carregar colaboradores:", error);
    }
  };

  const fetchAvailableItems = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: leadData } = await supabase
        .from("leads")
        .select("organization_id")
        .eq("id", lead.id)
        .single();

      if (!leadData?.organization_id) return;

      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("organization_id", leadData.organization_id)
        .order("name");

      if (error) throw error;
      setAvailableItems(data || []);
    } catch (error) {
      console.error("Erro ao carregar produtos:", error);
    }
  };

  const fetchLeadItems = async () => {
    try {
      const { data, error } = await supabase
        .from("lead_items")
        .select(`
          *,
          items (*)
        `)
        .eq("lead_id", lead.id);

      if (error) throw error;
      setLeadItems(data || []);
      
      // Calcular valor total
      const total = (data || []).reduce((sum: number, item: any) => sum + (item.total_price || 0), 0);
      setEditedValue(total.toString());
    } catch (error) {
      console.error("Erro ao carregar itens do lead:", error);
    }
  };

  const handleAddItem = async (item: any) => {
    setIsLoadingItems(true);
    try {
      const { error } = await supabase
        .from("lead_items")
        .insert({
          lead_id: lead.id,
          item_id: item.id,
          quantity: 1,
          unit_price: item.sale_price,
          total_price: item.sale_price
        });

      if (error) {
        // Se já existe, mostra mensagem
        if (error.code === '23505') {
          toast.error("Este produto já foi adicionado ao lead");
        } else {
          throw error;
        }
      } else {
        toast.success("Produto adicionado com sucesso!");
        await fetchLeadItems();
      }
    } catch (error) {
      console.error("Erro ao adicionar item:", error);
      toast.error("Erro ao adicionar produto");
    } finally {
      setIsLoadingItems(false);
    }
  };

  const handleRemoveItem = async (leadItemId: string) => {
    try {
      const { error } = await supabase
        .from("lead_items")
        .delete()
        .eq("id", leadItemId);

      if (error) throw error;

      toast.success("Produto removido com sucesso!");
      await fetchLeadItems();
    } catch (error) {
      console.error("Erro ao remover item:", error);
      toast.error("Erro ao remover produto");
    }
  };

  const handleUpdateQuantity = async (leadItemId: string, newQuantity: number, unitPrice: number) => {
    if (newQuantity < 1) return;
    
    try {
      const { error } = await supabase
        .from("lead_items")
        .update({
          quantity: newQuantity,
          total_price: newQuantity * unitPrice
        })
        .eq("id", leadItemId);

      if (error) throw error;

      await fetchLeadItems();
    } catch (error) {
      console.error("Erro ao atualizar quantidade:", error);
      toast.error("Erro ao atualizar quantidade");
    }
  };

  // Função para renderizar ícone
  const getItemIcon = (iconName: string | null) => {
    if (!iconName) return null;
    
    // Verificar ícones customizados primeiro
    if (iconName in customIcons) {
      const CustomIcon = customIcons[iconName];
      return <CustomIcon className="h-5 w-5 text-primary" />;
    }
    
    // Verificar ícones do Lucide
    if (iconName in Icons) {
      const LucideIcon = Icons[iconName as keyof typeof Icons] as LucideIcon;
      return <LucideIcon className="h-5 w-5 text-primary" />;
    }
    
    return null;
  };

  const fetchActivities = async () => {
    setIsLoadingActivities(true);
    try {
      const { data, error } = await supabase
        .from("lead_activities")
        .select("*")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setActivities(data || []);
    } catch (error) {
      console.error("Erro ao carregar atividades:", error);
    } finally {
      setIsLoadingActivities(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Verificar tamanho do arquivo (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error("Arquivo muito grande. Tamanho máximo: 10MB");
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
  };

  const uploadFile = async (): Promise<{ url: string; name: string } | null> => {
    if (!selectedFile) return null;

    setIsUploadingFile(true);
    try {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${lead.id}/${Date.now()}.${fileExt}`;
      
      const { data, error } = await supabase.storage
        .from('activity-attachments')
        .upload(fileName, selectedFile);

      if (error) throw error;

      // Para buckets privados, usamos o caminho completo que será acessado via RLS
      const filePath = data.path;

      return {
        url: filePath,
        name: selectedFile.name
      };
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
      toast.error("Erro ao fazer upload do arquivo");
      return null;
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleSaveActivity = async () => {
    if (!activityContent.trim()) {
      toast.error("O conteúdo da atividade não pode estar vazio");
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const activityTypeMap: Record<string, string> = {
        nota: "Nota",
        email: "E-mail",
        ligacao: "Ligação",
        whatsapp: "WhatsApp",
        proposta: "Proposta",
        reuniao: "Reunião",
        visita: "Visita"
      };

      let attachmentUrl = null;
      let attachmentName = null;

      // Upload do arquivo se houver
      if (selectedFile) {
        const uploadResult = await uploadFile();
        if (uploadResult) {
          attachmentUrl = uploadResult.url;
          attachmentName = uploadResult.name;
        }
      }

      const { error } = await supabase
        .from("lead_activities")
        .insert({
          lead_id: lead.id,
          user_id: user.id,
          activity_type: activityTypeMap[currentTab],
          content: activityContent.trim(),
          attachment_url: attachmentUrl,
          attachment_name: attachmentName
        });

      if (error) throw error;

      toast.success("Atividade salva com sucesso!");
      setActivityContent("");
      setSelectedFile(null);
      await fetchActivities();
    } catch (error) {
      console.error("Erro ao salvar atividade:", error);
      toast.error("Erro ao salvar atividade");
    }
  };

  const handleCancelActivity = () => {
    setActivityContent("");
    setSelectedFile(null);
    setEditingActivityId(null);
    setEditingContent("");
  };

  const handleEditActivity = (activity: any) => {
    setEditingActivityId(activity.id);
    setEditingContent(activity.content);
    setEditingFile(null);
    setEditingKeepCurrentAttachment(true);
    if (activity.attachment_url && activity.attachment_name) {
      setEditingCurrentAttachment({
        url: activity.attachment_url,
        name: activity.attachment_name
      });
    } else {
      setEditingCurrentAttachment(null);
    }
  };

  const handleSaveEdit = async (activityId: string) => {
    try {
      const updateData: any = { content: editingContent };

      // Se o usuário removeu o anexo atual e não adicionou novo
      if (!editingKeepCurrentAttachment && !editingFile) {
        updateData.attachment_url = null;
        updateData.attachment_name = null;
      }

      // Se o usuário adicionou um novo anexo
      if (editingFile) {
        const fileExt = editingFile.name.split('.').pop();
        const fileName = `${lead.id}/${Date.now()}.${fileExt}`;
        
        const { data, error: uploadError } = await supabase.storage
          .from('activity-attachments')
          .upload(fileName, editingFile);

        if (uploadError) throw uploadError;

        updateData.attachment_url = data.path;
        updateData.attachment_name = editingFile.name;
      }

      const { error } = await supabase
        .from("lead_activities")
        .update(updateData)
        .eq("id", activityId);

      if (error) throw error;

      setActivities(activities.map(act => 
        act.id === activityId ? { ...act, ...updateData } : act
      ));
      setEditingActivityId(null);
      setEditingContent("");
      setEditingFile(null);
      setEditingKeepCurrentAttachment(true);
      setEditingCurrentAttachment(null);
      toast.success("Atividade atualizada com sucesso!");
    } catch (error) {
      console.error("Erro ao atualizar atividade:", error);
      toast.error("Erro ao atualizar atividade");
    }
  };

  const handleDeleteActivity = async (activityId: string) => {
    // Inicia a animação de fade-out
    setDeletingActivityId(activityId);
    
    // Aguarda a animação terminar (300ms)
    await new Promise(resolve => setTimeout(resolve, 300));
    
    try {
      const { error } = await supabase
        .from("lead_activities")
        .delete()
        .eq("id", activityId);

      if (error) throw error;

      setActivities(activities.filter(act => act.id !== activityId));
      setDeletingActivityId(null);
      toast.success("Atividade excluída com sucesso!");
    } catch (error) {
      console.error("Erro ao excluir atividade:", error);
      toast.error("Erro ao excluir atividade");
      setDeletingActivityId(null);
    }
  };

  const getActivityIcon = (type: string) => {
    const icons: Record<string, any> = {
      "Nota": Pencil,
      "E-mail": Mail,
      "Ligação": Phone,
      "WhatsApp": MessageSquare,
      "Proposta": FileText,
      "Reunião": Video,
      "Visita": MapPin
    };
    return icons[type] || Pencil;
  };

  const handleStageClick = async (newStage: string) => {
    if (newStage === editedStage || isUpdatingStage) return;
    
    setIsUpdatingStage(true);
    
    try {
      const { error } = await supabase
        .from("leads")
        .update({ stage: newStage })
        .eq("id", lead.id);

      if (error) throw error;

      setEditedStage(newStage);
      toast.success(`Lead movido para ${getStageLabel(newStage)}`);
      onUpdate();
    } catch (error) {
      console.error("Erro ao atualizar etapa:", error);
      toast.error("Erro ao atualizar etapa do lead");
    } finally {
      setIsUpdatingStage(false);
    }
  };

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
                  <div className="flex items-center w-full gap-[2px]">
                    {/* Novo Lead - Primeira etapa (esquerda reta, direita com ponta) */}
                    <div 
                      onClick={() => handleStageClick('NOVO')}
                      className={`flex-1 relative h-12 flex items-center justify-center text-sm font-semibold transition-all duration-300 cursor-pointer ${
                        editedStage === 'NOVO' 
                          ? 'bg-[hsl(250,90%,60%)] text-white scale-105 shadow-lg' 
                          : 'bg-[hsl(220,13%,18%)] text-gray-300 hover:brightness-125 hover:scale-102'
                      } ${isUpdatingStage ? 'opacity-50 cursor-wait' : ''}`}
                      style={{
                        clipPath: 'polygon(0 0, calc(100% - 24px) 0, 100% 50%, calc(100% - 24px) 100%, 0 100%)'
                      }}
                    >
                      <span className="relative z-10 pr-6 pl-4">Novo Lead</span>
                    </div>
                    
                    {/* Em Atendimento - Etapa intermediária (esquerda com reentrância para dentro, direita com ponta) */}
                    <div 
                      onClick={() => handleStageClick('EM_ATENDIMENTO')}
                      className={`flex-1 relative h-12 flex items-center justify-center text-sm font-semibold transition-all duration-300 cursor-pointer ${
                        editedStage === 'EM_ATENDIMENTO' 
                          ? 'bg-[hsl(250,90%,60%)] text-white scale-105 shadow-lg' 
                          : 'bg-[hsl(220,13%,18%)] text-gray-300 hover:brightness-125 hover:scale-102'
                      } ${isUpdatingStage ? 'opacity-50 cursor-wait' : ''}`}
                      style={{
                        clipPath: 'polygon(0 0, calc(100% - 24px) 0, 100% 50%, calc(100% - 24px) 100%, 0 100%, 24px 50%)'
                      }}
                    >
                      <span className="relative z-10 pr-6 pl-8">Em Atendimento</span>
                    </div>
                    
                    {/* Fechado - Etapa intermediária (esquerda com reentrância para dentro, direita com ponta) */}
                    <div 
                      onClick={() => handleStageClick('FECHADO')}
                      className={`flex-1 relative h-12 flex items-center justify-center text-sm font-semibold transition-all duration-300 cursor-pointer ${
                        editedStage === 'FECHADO' 
                          ? 'bg-[hsl(250,90%,60%)] text-white scale-105 shadow-lg' 
                          : 'bg-[hsl(220,13%,18%)] text-gray-300 hover:brightness-125 hover:scale-102'
                      } ${isUpdatingStage ? 'opacity-50 cursor-wait' : ''}`}
                      style={{
                        clipPath: 'polygon(0 0, calc(100% - 24px) 0, 100% 50%, calc(100% - 24px) 100%, 0 100%, 24px 50%)'
                      }}
                    >
                      <span className="relative z-10 pr-6 pl-8">Fechado</span>
                    </div>
                    
                    {/* Perdido - Última etapa (esquerda com reentrância para dentro, direita reta) */}
                    <div 
                      onClick={() => handleStageClick('PERDIDO')}
                      className={`flex-1 relative h-12 flex items-center justify-center text-sm font-semibold transition-all duration-300 cursor-pointer ${
                        editedStage === 'PERDIDO' 
                          ? 'bg-[hsl(250,90%,60%)] text-white scale-105 shadow-lg' 
                          : 'bg-[hsl(220,13%,18%)] text-gray-300 hover:brightness-125 hover:scale-102'
                      } ${isUpdatingStage ? 'opacity-50 cursor-wait' : ''}`}
                      style={{
                        clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 24px 50%)'
                      }}
                    >
                      <span className="relative z-10 pl-8 pr-4">Perdido</span>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Tabs de Ações */}
                <Tabs defaultValue="nota" className="w-full" onValueChange={setCurrentTab}>
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
                    <TabsContent value="nota" className="mt-0 space-y-3">
                      <Textarea
                        placeholder="O que foi feito e qual o próximo passo?"
                        className="min-h-[120px] resize-none"
                        value={currentTab === "nota" ? activityContent : ""}
                        onChange={(e) => currentTab === "nota" && setActivityContent(e.target.value)}
                      />
                      {selectedFile && (
                        <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                          <FileText className="h-4 w-4 text-primary" />
                          <span className="text-sm flex-1 truncate">{selectedFile.name}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRemoveFile}
                            className="h-6 w-6 p-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <div>
                          <input
                            type="file"
                            id="nota-file"
                            className="hidden"
                            onChange={handleFileSelect}
                            accept="*/*"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => document.getElementById('nota-file')?.click()}
                            disabled={isUploadingFile}
                          >
                            <Paperclip className="h-4 w-4" />
                            Adicionar anexo
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={handleCancelActivity}>
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSaveActivity}
                            disabled={isUploadingFile}
                            className="bg-primary hover:bg-primary/90"
                          >
                            {isUploadingFile ? "Enviando..." : "Salvar nota"}
                          </Button>
                        </div>
                      </div>
                    </TabsContent>
                    <TabsContent value="email" className="mt-0 space-y-3">
                      <Textarea
                        placeholder="Escreva seu e-mail..."
                        className="min-h-[120px] resize-none"
                        value={currentTab === "email" ? activityContent : ""}
                        onChange={(e) => currentTab === "email" && setActivityContent(e.target.value)}
                      />
                      {selectedFile && (
                        <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                          <FileText className="h-4 w-4 text-primary" />
                          <span className="text-sm flex-1 truncate">{selectedFile.name}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRemoveFile}
                            className="h-6 w-6 p-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <div>
                          <input
                            type="file"
                            id="email-file"
                            className="hidden"
                            onChange={handleFileSelect}
                            accept="*/*"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => document.getElementById('email-file')?.click()}
                            disabled={isUploadingFile}
                          >
                            <Paperclip className="h-4 w-4" />
                            Adicionar anexo
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={handleCancelActivity}>
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSaveActivity}
                            disabled={isUploadingFile}
                            className="bg-primary hover:bg-primary/90"
                          >
                            {isUploadingFile ? "Enviando..." : "Salvar e-mail"}
                          </Button>
                        </div>
                      </div>
                    </TabsContent>
                    <TabsContent value="ligacao" className="mt-0 space-y-3">
                      <Textarea
                        placeholder="Notas sobre a ligação..."
                        className="min-h-[120px] resize-none"
                        value={currentTab === "ligacao" ? activityContent : ""}
                        onChange={(e) => currentTab === "ligacao" && setActivityContent(e.target.value)}
                      />
                      {selectedFile && (
                        <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                          <FileText className="h-4 w-4 text-primary" />
                          <span className="text-sm flex-1 truncate">{selectedFile.name}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRemoveFile}
                            className="h-6 w-6 p-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <div>
                          <input
                            type="file"
                            id="ligacao-file"
                            className="hidden"
                            onChange={handleFileSelect}
                            accept="*/*"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => document.getElementById('ligacao-file')?.click()}
                            disabled={isUploadingFile}
                          >
                            <Paperclip className="h-4 w-4" />
                            Adicionar anexo
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={handleCancelActivity}>
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSaveActivity}
                            disabled={isUploadingFile}
                            className="bg-primary hover:bg-primary/90"
                          >
                            {isUploadingFile ? "Enviando..." : "Salvar ligação"}
                          </Button>
                        </div>
                      </div>
                    </TabsContent>
                    <TabsContent value="whatsapp" className="mt-0 space-y-3">
                      <Textarea
                        placeholder="Escreva sua mensagem..."
                        className="min-h-[120px] resize-none"
                        value={currentTab === "whatsapp" ? activityContent : ""}
                        onChange={(e) => currentTab === "whatsapp" && setActivityContent(e.target.value)}
                      />
                      {selectedFile && (
                        <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                          <FileText className="h-4 w-4 text-primary" />
                          <span className="text-sm flex-1 truncate">{selectedFile.name}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRemoveFile}
                            className="h-6 w-6 p-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <div>
                          <input
                            type="file"
                            id="whatsapp-file"
                            className="hidden"
                            onChange={handleFileSelect}
                            accept="*/*"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => document.getElementById('whatsapp-file')?.click()}
                            disabled={isUploadingFile}
                          >
                            <Paperclip className="h-4 w-4" />
                            Adicionar anexo
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={handleCancelActivity}>
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSaveActivity}
                            disabled={isUploadingFile}
                            className="bg-primary hover:bg-primary/90"
                          >
                            {isUploadingFile ? "Enviando..." : "Salvar WhatsApp"}
                          </Button>
                        </div>
                      </div>
                    </TabsContent>
                    <TabsContent value="proposta" className="mt-0 space-y-3">
                      <Textarea
                        placeholder="Detalhes da proposta..."
                        className="min-h-[120px] resize-none"
                        value={currentTab === "proposta" ? activityContent : ""}
                        onChange={(e) => currentTab === "proposta" && setActivityContent(e.target.value)}
                      />
                      {selectedFile && (
                        <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                          <FileText className="h-4 w-4 text-primary" />
                          <span className="text-sm flex-1 truncate">{selectedFile.name}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRemoveFile}
                            className="h-6 w-6 p-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <div>
                          <input
                            type="file"
                            id="proposta-file"
                            className="hidden"
                            onChange={handleFileSelect}
                            accept="*/*"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => document.getElementById('proposta-file')?.click()}
                            disabled={isUploadingFile}
                          >
                            <Paperclip className="h-4 w-4" />
                            Adicionar anexo
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={handleCancelActivity}>
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSaveActivity}
                            disabled={isUploadingFile}
                            className="bg-primary hover:bg-primary/90"
                          >
                            {isUploadingFile ? "Enviando..." : "Salvar proposta"}
                          </Button>
                        </div>
                      </div>
                    </TabsContent>
                    <TabsContent value="reuniao" className="mt-0 space-y-3">
                      <Textarea
                        placeholder="Notas sobre a reunião..."
                        className="min-h-[120px] resize-none"
                        value={currentTab === "reuniao" ? activityContent : ""}
                        onChange={(e) => currentTab === "reuniao" && setActivityContent(e.target.value)}
                      />
                      {selectedFile && (
                        <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                          <FileText className="h-4 w-4 text-primary" />
                          <span className="text-sm flex-1 truncate">{selectedFile.name}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRemoveFile}
                            className="h-6 w-6 p-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <div>
                          <input
                            type="file"
                            id="reuniao-file"
                            className="hidden"
                            onChange={handleFileSelect}
                            accept="*/*"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => document.getElementById('reuniao-file')?.click()}
                            disabled={isUploadingFile}
                          >
                            <Paperclip className="h-4 w-4" />
                            Adicionar anexo
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={handleCancelActivity}>
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSaveActivity}
                            disabled={isUploadingFile}
                            className="bg-primary hover:bg-primary/90"
                          >
                            {isUploadingFile ? "Enviando..." : "Salvar reunião"}
                          </Button>
                        </div>
                      </div>
                    </TabsContent>
                    <TabsContent value="visita" className="mt-0 space-y-3">
                      <Textarea
                        placeholder="Notas sobre a visita..."
                        className="min-h-[120px] resize-none"
                        value={currentTab === "visita" ? activityContent : ""}
                        onChange={(e) => currentTab === "visita" && setActivityContent(e.target.value)}
                      />
                      {selectedFile && (
                        <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                          <FileText className="h-4 w-4 text-primary" />
                          <span className="text-sm flex-1 truncate">{selectedFile.name}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRemoveFile}
                            className="h-6 w-6 p-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <div>
                          <input
                            type="file"
                            id="visita-file"
                            className="hidden"
                            onChange={handleFileSelect}
                            accept="*/*"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => document.getElementById('visita-file')?.click()}
                            disabled={isUploadingFile}
                          >
                            <Paperclip className="h-4 w-4" />
                            Adicionar anexo
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={handleCancelActivity}>
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSaveActivity}
                            disabled={isUploadingFile}
                            className="bg-primary hover:bg-primary/90"
                          >
                            {isUploadingFile ? "Enviando..." : "Salvar visita"}
                          </Button>
                        </div>
                      </div>
                    </TabsContent>
                  </div>
                </Tabs>

                <Separator />

                {/* Histórico de atividades */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-base">Histórico de atividades</h3>
                  {isLoadingActivities ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-muted-foreground text-sm">Carregando...</div>
                    </div>
                  ) : activities.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="text-muted-foreground text-sm">
                        Nenhuma atividade registrada
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">
                        Que tal agendar uma ligação para evoluir este negócio?
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activities.map((activity) => {
                        const Icon = getActivityIcon(activity.activity_type);
                        const isDeleting = deletingActivityId === activity.id;
                        return (
                          <Card 
                            key={activity.id} 
                            className={`overflow-hidden group transition-all duration-300 ${
                              isDeleting ? 'animate-fade-out' : ''
                            }`}
                          >
                            {/* Cabeçalho com informações do lead */}
                            <div className="bg-muted/30 px-4 py-2 flex items-center gap-2 border-b">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">{lead.nome_lead}</span>
                              {lead.telefone_lead && (
                                <span className="text-xs text-muted-foreground">
                                  / {lead.telefone_lead}
                                </span>
                              )}
                            </div>
                            
                            {/* Conteúdo da atividade */}
                            <div className="p-4 space-y-3">
                              {/* Tipo e data */}
                              <div className="flex items-start gap-3">
                                <div className="flex-shrink-0 rounded-full bg-primary/10 p-2">
                                  <Icon className="h-4 w-4 text-primary" />
                                </div>
                                <div className="flex-1">
                                  <h4 className="font-semibold text-sm">
                                    {activity.activity_type}
                                  </h4>
                                  <span className="text-xs text-primary">
                                    {format(new Date(activity.created_at), "'Criada hoje' HH:mm", { locale: ptBR })}
                                  </span>
                                </div>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 hover:bg-muted/50"
                                    onClick={() => handleEditActivity(activity)}
                                  >
                                    <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 hover:bg-destructive/10"
                                    onClick={() => handleDeleteActivity(activity.id)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                                  </Button>
                                </div>
                              </div>
                              
                              {/* Conteúdo/Mensagem */}
                              <div className="pl-11">
                                {editingActivityId === activity.id ? (
                                  <div className="space-y-3">
                                    <Textarea
                                      value={editingContent}
                                      onChange={(e) => setEditingContent(e.target.value)}
                                      className="min-h-[100px]"
                                    />
                                    
                                    {/* Gerenciamento de anexo durante edição */}
                                    <div className="space-y-2">
                                      {editingCurrentAttachment && editingKeepCurrentAttachment && !editingFile && (
                                        <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-md">
                                          <FileText className="h-4 w-4 text-muted-foreground" />
                                          <span className="text-sm flex-1">{editingCurrentAttachment.name}</span>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => setEditingKeepCurrentAttachment(false)}
                                          >
                                            <X className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      )}
                                      
                                      {editingFile && (
                                        <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-md">
                                          <FileText className="h-4 w-4 text-muted-foreground" />
                                          <span className="text-sm flex-1">{editingFile.name}</span>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={() => setEditingFile(null)}
                                          >
                                            <X className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      )}
                                      
                                      {!editingFile && (
                                        <>
                                          <input
                                            type="file"
                                            id={`edit-file-${activity.id}`}
                                            className="hidden"
                                            onChange={(e) => {
                                              const file = e.target.files?.[0];
                                              if (file) {
                                                if (file.size > 10 * 1024 * 1024) {
                                                  toast.error("Arquivo muito grande. Máximo 10MB");
                                                  return;
                                                }
                                                setEditingFile(file);
                                              }
                                            }}
                                          />
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="gap-2"
                                            onClick={() => document.getElementById(`edit-file-${activity.id}`)?.click()}
                                          >
                                            <Paperclip className="h-4 w-4" />
                                            {editingCurrentAttachment && !editingKeepCurrentAttachment ? "Adicionar novo anexo" : "Alterar anexo"}
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                      <Button
                                        size="sm"
                                        onClick={() => handleSaveEdit(activity.id)}
                                      >
                                        Salvar
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          setEditingActivityId(null);
                                          setEditingContent("");
                                          setEditingFile(null);
                                          setEditingKeepCurrentAttachment(true);
                                          setEditingCurrentAttachment(null);
                                        }}
                                      >
                                        Cancelar
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-sm text-foreground whitespace-pre-wrap">
                                    {activity.content}
                                  </p>
                                )}
                              </div>
                              
                              {/* Anexos (se existirem) */}
                              {activity.attachment_url && (
                                <div className="pl-11 pt-2 border-t">
                                  <Button
                                    variant="link"
                                    size="sm"
                                    className="h-auto p-0 text-primary hover:underline"
                                    onClick={async () => {
                                      try {
                                        const { data, error } = await supabase.storage
                                          .from('activity-attachments')
                                          .download(activity.attachment_url);
                                        
                                        if (error) throw error;
                                        
                                        // Criar URL temporária e fazer download
                                        const url = URL.createObjectURL(data);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = activity.attachment_name || 'anexo';
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                        URL.revokeObjectURL(url);
                                      } catch (error) {
                                        console.error("Erro ao baixar arquivo:", error);
                                        toast.error("Erro ao baixar arquivo");
                                      }
                                    }}
                                  >
                                    <FileText className="h-4 w-4 inline mr-2" />
                                    <span>{activity.attachment_name || 'Anexo'}</span>
                                  </Button>
                                </div>
                              )}
                              
                              {/* Autoria */}
                              <div className="pl-11 pt-2 border-t flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Criada por</span>
                                <div className="flex items-center gap-1.5">
                                  <Avatar className="h-5 w-5">
                                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-semibold">
                                      {lead.nome_lead.substring(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-xs font-medium">{lead.nome_lead}</span>
                                </div>
                              </div>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  )}
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
                    {leadItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nenhum produto ou serviço foi adicionado a este negócio
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {leadItems.map((leadItem: any) => (
                          <div key={leadItem.id} className="flex items-center justify-between gap-2 p-2 bg-background rounded-md">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{leadItem.items?.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {leadItem.quantity}x R$ {leadItem.unit_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleUpdateQuantity(leadItem.id, leadItem.quantity - 1, leadItem.unit_price)}
                              >
                                <span className="text-lg">−</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleUpdateQuantity(leadItem.id, leadItem.quantity + 1, leadItem.unit_price)}
                              >
                                <span className="text-lg">+</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => handleRemoveItem(leadItem.id)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <Button 
                      variant="link" 
                      className="text-primary p-0 h-auto text-sm"
                      onClick={() => setShowItemsDialog(true)}
                    >
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
                  {/* Responsável */}
                  <div className="flex items-start justify-between group">
                    <span className="text-muted-foreground">Responsável</span>
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-medium text-primary">
                          {responsavel?.charAt(0)?.toUpperCase() || '?'}
                        </span>
                      </div>
                      <span className="font-medium" title={responsavel || 'Não definido'}>
                        {responsavel 
                          ? responsavel.length > 8 
                            ? `${responsavel.substring(0, 8)}...` 
                            : responsavel
                          : 'Não definido'
                        }
                      </span>
                      <Popover 
                        open={editingResponsavel} 
                        onOpenChange={(open) => {
                          console.log("🔥 Popover onOpenChange:", open);
                          setEditingResponsavel(open);
                        }}
                        modal={false}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 p-0 hover:bg-accent/50"
                            type="button"
                            onClick={() => {
                              console.log("🔥 Botão de lápis clicado!");
                              console.log("Estado atual editingResponsavel:", editingResponsavel);
                              console.log("Colaboradores disponíveis:", colaboradores);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5 text-primary" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 p-3 pointer-events-auto z-[9999]" align="end" sideOffset={5}>
                          <div className="space-y-3">
                            <div className="text-sm font-medium text-foreground">Responsável</div>
                            
                            {/* Colaborador selecionado */}
                            <div className="flex items-center gap-3 p-3 border rounded-lg bg-background">
                              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                                <span className="text-sm font-semibold text-primary-foreground">
                                  {responsavel?.charAt(0)?.toUpperCase() || '?'}
                                </span>
                              </div>
                              <span className="text-sm font-medium flex-1">{responsavel || 'Não definido'}</span>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setEditingResponsavel(false)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={async () => {
                                    await saveDadosNegocio();
                                    setEditingResponsavel(false);
                                  }}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>

                            {/* Lista de outros colaboradores */}
                            <div className="border-t pt-3">
                              <div className="text-xs font-medium text-muted-foreground mb-2">Trocar responsável</div>
                              <div className="space-y-1 max-h-48 overflow-y-auto">
                                {colaboradores
                                  .filter(colab => (colab.full_name || colab.email) !== responsavel)
                                  .map((colab) => {
                                    const displayName = colab.full_name || colab.email;
                                    return (
                                      <button
                                        key={colab.id}
                                        type="button"
                                        className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-accent cursor-pointer transition-colors"
                                        onClick={async () => {
                                          console.log("Colaborador selecionado:", displayName);
                                          setResponsavel(displayName || '');
                                          
                                          // Salvar imediatamente
                                          try {
                                            const { error } = await supabase
                                              .from('leads')
                                              .update({ responsavel: displayName || '' })
                                              .eq('id', lead.id);

                                            if (error) throw error;

                                            setEditingResponsavel(false);
                                            toast.success(`Responsável alterado para ${displayName}`);
                                            onUpdate();
                                          } catch (error) {
                                            console.error('Erro ao salvar responsável:', error);
                                            toast.error('Erro ao salvar responsável');
                                          }
                                        }}
                                      >
                                        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                          <span className="text-xs font-medium text-primary">
                                            {displayName?.charAt(0).toUpperCase()}
                                          </span>
                                        </div>
                                        <span className="text-sm">{displayName}</span>
                                      </button>
                                    );
                                  })}
                                {colaboradores.length === 0 && (
                                  <div className="text-sm text-muted-foreground text-center py-4">
                                    Nenhum colaborador encontrado
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  {/* Data de início */}
                  <div className="flex items-start justify-between group">
                    <span className="text-muted-foreground">Data de início</span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {dataInicio ? format(dataInicio, "dd/MM/yyyy", { locale: ptBR }) : "Hoje"}
                      </span>
                      <Popover open={editingDataInicio} onOpenChange={setEditingDataInicio} modal={false}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 p-0 hover:bg-accent/50"
                            type="button"
                          >
                            <Pencil className="h-3.5 w-3.5 text-primary" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 pointer-events-auto z-[9999]" align="end" sideOffset={5}>
                          <div className="p-3">
                            <Calendar
                              mode="single"
                              selected={dataInicio}
                              onSelect={async (date) => {
                                setDataInicio(date);
                                
                                // Salvar imediatamente
                                try {
                                  const { error } = await supabase
                                    .from('leads')
                                    .update({ data_inicio: date?.toISOString() })
                                    .eq('id', lead.id);

                                  if (error) throw error;

                                  setEditingDataInicio(false);
                                  toast.success("Data de início atualizada");
                                  onUpdate();
                                } catch (error) {
                                  console.error('Erro ao salvar data de início:', error);
                                  toast.error('Erro ao salvar data');
                                }
                              }}
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                              locale={ptBR}
                            />
                            <div className="flex gap-2 mt-2 border-t pt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={async () => {
                                  const today = new Date();
                                  setDataInicio(today);
                                  
                                  try {
                                    const { error } = await supabase
                                      .from('leads')
                                      .update({ data_inicio: today.toISOString() })
                                      .eq('id', lead.id);

                                    if (error) throw error;

                                    setEditingDataInicio(false);
                                    toast.success("Data definida para hoje");
                                    onUpdate();
                                  } catch (error) {
                                    console.error('Erro ao salvar data:', error);
                                    toast.error('Erro ao salvar data');
                                  }
                                }}
                              >
                                Hoje
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() => {
                                  const tomorrow = new Date();
                                  tomorrow.setDate(tomorrow.getDate() + 1);
                                  setDataInicio(tomorrow);
                                  setEditingDataInicio(false);
                                  toast.success("Data definida para amanhã");
                                }}
                              >
                                Amanhã
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() => {
                                  const nextWeek = new Date();
                                  nextWeek.setDate(nextWeek.getDate() + 7);
                                  setDataInicio(nextWeek);
                                  setEditingDataInicio(false);
                                  toast.success("Data definida para próxima semana");
                                }}
                              >
                                1 semana depois
                              </Button>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  {/* Data de conclusão */}
                  <div className="flex items-start justify-between group">
                    <span className="text-muted-foreground">Data de conclusão</span>
                    <div className="flex items-center gap-2">
                      <span className={cn("font-medium", !dataConclusao && "text-muted-foreground")}>
                        {dataConclusao ? format(dataConclusao, "dd/MM/yyyy", { locale: ptBR }) : "Adicionar"}
                      </span>
                      <Popover open={editingDataConclusao} onOpenChange={setEditingDataConclusao} modal={false}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 p-0 hover:bg-accent/50"
                            type="button"
                          >
                            <Pencil className="h-3.5 w-3.5 text-primary" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 pointer-events-auto z-[9999]" align="end" sideOffset={5}>
                          <div className="p-3">
                            <Calendar
                              mode="single"
                              selected={dataConclusao}
                              onSelect={async (date) => {
                                setDataConclusao(date);
                                
                                // Salvar imediatamente
                                try {
                                  const { error } = await supabase
                                    .from('leads')
                                    .update({ data_conclusao: date?.toISOString() || null })
                                    .eq('id', lead.id);

                                  if (error) throw error;

                                  setEditingDataConclusao(false);
                                  toast.success("Data de conclusão atualizada");
                                  onUpdate();
                                } catch (error) {
                                  console.error('Erro ao salvar data de conclusão:', error);
                                  toast.error('Erro ao salvar data');
                                }
                              }}
                              initialFocus
                              className={cn("p-3 pointer-events-auto")}
                              locale={ptBR}
                            />
                            <div className="flex gap-2 mt-2 border-t pt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={async () => {
                                  const today = new Date();
                                  setDataConclusao(today);
                                  
                                  try {
                                    const { error } = await supabase
                                      .from('leads')
                                      .update({ data_conclusao: today.toISOString() })
                                      .eq('id', lead.id);

                                    if (error) throw error;

                                    setEditingDataConclusao(false);
                                    toast.success("Data definida para hoje");
                                    onUpdate();
                                  } catch (error) {
                                    console.error('Erro ao salvar data:', error);
                                    toast.error('Erro ao salvar data');
                                  }
                                }}
                              >
                                Hoje
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() => {
                                  const tomorrow = new Date();
                                  tomorrow.setDate(tomorrow.getDate() + 1);
                                  setDataConclusao(tomorrow);
                                  setEditingDataConclusao(false);
                                  toast.success("Data definida para amanhã");
                                }}
                              >
                                Amanhã
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1"
                                onClick={() => {
                                  const nextWeek = new Date();
                                  nextWeek.setDate(nextWeek.getDate() + 7);
                                  setDataConclusao(nextWeek);
                                  setEditingDataConclusao(false);
                                  toast.success("Data definida para próxima semana");
                                }}
                              >
                                1 semana depois
                              </Button>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  {/* Descrição */}
                  <div className="flex items-start justify-between group">
                    <span className="text-muted-foreground">Descrição</span>
                    <div className="flex items-center gap-2">
                      <span 
                        className={cn("font-medium", !descricao && "text-muted-foreground")}
                        title={descricao || "Adicionar descrição"}
                      >
                        {descricao 
                          ? descricao.length > 13 
                            ? `${descricao.substring(0, 13)}...` 
                            : descricao
                          : "Adicionar descrição"
                        }
                      </span>
                      <Popover open={editingDescricao} onOpenChange={setEditingDescricao} modal={false}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 p-0 hover:bg-accent/50"
                            type="button"
                          >
                            <Pencil className="h-3.5 w-3.5 text-primary" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80 pointer-events-auto z-[9999]" align="end" sideOffset={5}>
                          <div className="space-y-3">
                            <Label htmlFor="descricao">Descrição</Label>
                            <Textarea
                              id="descricao"
                              placeholder="Adicione uma descrição para este negócio..."
                              value={descricao}
                              onChange={(e) => setDescricao(e.target.value)}
                              className="min-h-[100px] resize-none"
                            />
                            <div className="flex gap-2 justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditingDescricao(false);
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                onClick={async () => {
                                  await saveDadosNegocio();
                                  setEditingDescricao(false);
                                }}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
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

      {/* Dialog de Produtos/Serviços */}
      <Dialog open={showItemsDialog} onOpenChange={setShowItemsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Adicionar Produtos/Serviços</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {isLoadingItems ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : availableItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Nenhum produto/serviço disponível</p>
                <p className="text-sm mt-2">Crie produtos na página de Produção primeiro</p>
              </div>
            ) : (
              <div className="grid gap-3 p-4">
                {availableItems.map((item) => {
                  const isAdded = leadItems.some((li: any) => li.item_id === item.id);
                  const itemIcon = getItemIcon(item.icon);
                  
                  return (
                    <Card 
                      key={item.id} 
                      className={cn(
                        "cursor-pointer transition-all hover:shadow-md",
                        isAdded && "opacity-50 cursor-not-allowed"
                      )}
                      onClick={() => !isAdded && handleAddItem(item)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                              {itemIcon || <FileText className="h-5 w-5 text-primary" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium truncate">{item.name}</h4>
                                <Badge variant="outline" className="text-xs shrink-0">
                                  {item.item_type === 'product' ? 'Produto' : 'Serviço'}
                                </Badge>
                              </div>
                              
                              {item.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                                  {item.description}
                                </p>
                              )}
                              
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-2">
                                <div>
                                  <span className="text-muted-foreground">Preço de venda:</span>
                                  <p className="font-medium text-green-600">R$ {item.sale_price.toFixed(2)}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Preço de custo:</span>
                                  <p className="font-medium">R$ {item.cost_price.toFixed(2)}</p>
                                </div>
                                
                                {item.profit_margin !== null && (
                                  <div>
                                    <span className="text-muted-foreground">Margem:</span>
                                    <p className="font-medium">{item.profit_margin.toFixed(1)}%</p>
                                  </div>
                                )}
                                
                                {item.duration && (
                                  <div>
                                    <span className="text-muted-foreground">Duração:</span>
                                    <p className="font-medium">{item.duration}</p>
                                  </div>
                                )}
                                
                                {item.stock_quantity !== null && (
                                  <div>
                                    <span className="text-muted-foreground">Estoque:</span>
                                    <p className="font-medium">{item.stock_quantity} un.</p>
                                  </div>
                                )}
                                
                                {item.resource && (
                                  <div className="col-span-2">
                                    <span className="text-muted-foreground">Recurso:</span>
                                    <p className="font-medium">{item.resource}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          <div className="shrink-0">
                            {isAdded ? (
                              <Badge variant="secondary" className="gap-1">
                                <Check className="h-3 w-3" />
                                Adicionado
                              </Badge>
                            ) : (
                              <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground">
                                +
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};
