import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Card {
  id: string;
  content: string;
  description?: string;
  due_date?: string;
  estimated_time?: number;
}

interface CreateTaskEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: Card;
  onEventCreated: (cardId: string, eventId: string, eventLink: string) => void;
}

export const CreateTaskEventModal = ({ 
  open, 
  onOpenChange, 
  card, 
  onEventCreated 
}: CreateTaskEventModalProps) => {
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    date: "",
    time: "09:00",
    duration: "60",
  });

  useEffect(() => {
    if (open && card) {
      setFormData({
        title: card.content,
        description: card.description || "",
        date: card.due_date || "",
        time: "09:00",
        duration: card.estimated_time?.toString() || "60",
      });
    }
  }, [open, card]);

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
    try {
      const startDateTime = new Date(`${formData.date}T${formData.time}:00`);
      const endDateTime = new Date(startDateTime);
      endDateTime.setMinutes(endDateTime.getMinutes() + parseInt(formData.duration));

      const { data, error } = await supabase.functions.invoke("create-calendar-event", {
        body: {
          title: formData.title,
          description: formData.description,
          startDateTime: startDateTime.toISOString(),
          endDateTime: endDateTime.toISOString(),
          taskId: card.id,
        },
      });

      if (error) throw error;

      if (data?.success && data?.eventId) {
        // Atualizar o card com o ID do evento
        const { error: updateError } = await supabase
          .from("kanban_cards")
          .update({ 
            calendar_event_id: data.eventId,
            calendar_event_link: data.eventLink 
          })
          .eq("id", card.id);

        if (updateError) throw updateError;

        toast({
          title: "Evento criado!",
          description: "Tarefa sincronizada com Google Calendar",
        });

        onEventCreated(card.id, data.eventId, data.eventLink);
        onOpenChange(false);
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
            Sincronizar com Google Calendar
          </DialogTitle>
          <DialogDescription>
            Criar evento no calendário para a tarefa "{card?.content}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Título do Evento</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Título da tarefa"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição (opcional)</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Detalhes da tarefa..."
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
