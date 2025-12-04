import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { format, addHours } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CreateCalendarEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate: Date | null;
  onEventCreated: () => void;
}

export function CreateCalendarEventModal({ open, onOpenChange, initialDate, onEventCreated }: CreateCalendarEventModalProps) {
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [attendeeEmail, setAttendeeEmail] = useState('');

  useEffect(() => {
    if (open && initialDate) {
      const start = initialDate;
      const end = addHours(initialDate, 1);
      setStartDate(format(start, "yyyy-MM-dd'T'HH:mm"));
      setEndDate(format(end, "yyyy-MM-dd'T'HH:mm"));
    }
  }, [open, initialDate]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setStartDate('');
    setEndDate('');
    setAttendeeEmail('');
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error('Título é obrigatório');
      return;
    }

    if (!startDate || !endDate) {
      toast.error('Data e hora são obrigatórios');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-calendar-event', {
        body: {
          title,
          description,
          startDateTime: new Date(startDate).toISOString(),
          endDateTime: new Date(endDate).toISOString(),
          attendeeEmail: attendeeEmail || undefined,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success('Evento criado com sucesso');
      resetForm();
      onEventCreated();
    } catch (err) {
      console.error('Erro ao criar evento:', err);
      toast.error(err instanceof Error ? err.message : 'Erro ao criar evento');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Evento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-title">Título *</Label>
            <Input
              id="new-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título do evento"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-description">Descrição</Label>
            <Textarea
              id="new-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição do evento"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="new-start">Início *</Label>
              <Input
                id="new-start"
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-end">Fim *</Label>
              <Input
                id="new-end"
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-attendee">Convidar (email)</Label>
            <Input
              id="new-attendee"
              type="email"
              value={attendeeEmail}
              onChange={(e) => setAttendeeEmail(e.target.value)}
              placeholder="email@exemplo.com"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Criar Evento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
