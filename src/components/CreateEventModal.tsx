import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CreateEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName: string;
  leadEmail?: string;
}

export const CreateEventModal = ({ open, onOpenChange, leadId, leadName, leadEmail }: CreateEventModalProps) => {
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    title: `Reunião com ${leadName}`,
    description: "",
    date: "",
    time: "",
    duration: "60", // minutos
  });

  const handleCreate = async () => {
    if (!formData.date || !formData.time) {
      toast({
        title: "Campos obrigatórios",
        description: "Data e horário são obrigatórios",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    
    // Fechar modal imediatamente para melhor UX
    onOpenChange(false);
    
    // Toast de feedback imediato
    toast({
      title: "Criando evento...",
      description: "Aguarde enquanto o evento é criado no Google Calendar",
    });

    try {
      // Construir data/hora de início
      const startDateTime = new Date(`${formData.date}T${formData.time}:00`);
      
      // Calcular data/hora de término
      const endDateTime = new Date(startDateTime);
      endDateTime.setMinutes(endDateTime.getMinutes() + parseInt(formData.duration));

      const { data, error } = await supabase.functions.invoke("create-calendar-event", {
        body: {
          title: formData.title,
          description: formData.description,
          startDateTime: startDateTime.toISOString(),
          endDateTime: endDateTime.toISOString(),
          attendeeEmail: leadEmail,
          leadId,
        },
      });

      if (error) {
        // Try to get the actual error message from the response
        let errorMessage = "Não foi possível criar o evento";
        try {
          const errorData = await error.context?.json?.();
          if (errorData?.error) {
            errorMessage = errorData.error;
          }
        } catch {
          // Fallback to generic message
        }
        
        // Check if it's a "not connected" error
        if (errorMessage.includes("não conectado") || errorMessage.includes("not connected")) {
          toast({
            title: "Google Calendar não conectado",
            description: "Vá em Configurações → Integrações → Mais Integrações para conectar seu Google Calendar",
            variant: "destructive",
          });
          return;
        }
        
        throw new Error(errorMessage);
      }

      if (data?.success) {
        toast({
          title: "Evento criado!",
          description: "O evento foi adicionado ao seu Google Calendar",
        });

        // Abrir link do evento imediatamente
        if (data.eventLink) {
          window.open(data.eventLink, '_blank');
        }
      }
    } catch (error: any) {
      console.error("Erro ao criar evento:", error);
      toast({
        title: "Erro",
        description: error.message || "Não foi possível criar o evento",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Agendar Evento
          </DialogTitle>
          <DialogDescription>
            Criar evento no Google Calendar para {leadName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Título do Evento</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Ex: Reunião de Apresentação"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição (opcional)</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Detalhes sobre a reunião..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Data</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="time">Horário</Label>
              <Input
                id="time"
                type="time"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration">Duração (minutos)</Label>
            <Input
              id="duration"
              type="number"
              value={formData.duration}
              onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
              min="15"
              step="15"
            />
          </div>

          {leadEmail && (
            <p className="text-xs text-muted-foreground">
              Convite será enviado para: <span className="font-medium">{leadEmail}</span>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Criando...
              </>
            ) : (
              <>
                <Calendar className="h-4 w-4 mr-2" />
                Criar Evento
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};