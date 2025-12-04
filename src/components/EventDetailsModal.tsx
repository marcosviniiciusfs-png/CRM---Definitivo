import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { CalendarIcon, Clock, MapPin, Users, Trash2, ExternalLink, Loader2, Pencil } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CalendarEvent } from './GoogleCalendarModal';

interface EventDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: CalendarEvent;
  onEventUpdated: () => void;
}

export function EventDetailsModal({ open, onOpenChange, event, onEventUpdated }: EventDetailsModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description);
  const [startDate, setStartDate] = useState(event.allDay ? event.start : format(parseISO(event.start), "yyyy-MM-dd'T'HH:mm"));
  const [endDate, setEndDate] = useState(event.allDay ? event.end : format(parseISO(event.end), "yyyy-MM-dd'T'HH:mm"));

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error('Título é obrigatório');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('update-calendar-event', {
        body: {
          eventId: event.id,
          title,
          description,
          startDateTime: new Date(startDate).toISOString(),
          endDateTime: new Date(endDate).toISOString(),
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success('Evento atualizado com sucesso');
      onEventUpdated();
    } catch (err) {
      console.error('Erro ao atualizar evento:', err);
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar evento');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-calendar-event', {
        body: { eventId: event.id },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast.success('Evento excluído com sucesso');
      onEventUpdated();
    } catch (err) {
      console.error('Erro ao excluir evento:', err);
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir evento');
    } finally {
      setDeleting(false);
    }
  };

  const formatEventTime = (dateStr: string, allDay: boolean) => {
    if (allDay) return 'Dia inteiro';
    const date = parseISO(dateStr);
    return format(date, "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between pr-8">
            <span>{isEditing ? 'Editar Evento' : 'Detalhes do Evento'}</span>
            {!isEditing && (
              <Button variant="ghostIcon" size="icon" onClick={() => setIsEditing(true)}>
                <Pencil className="h-4 w-4" />
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        {isEditing ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título do evento"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrição do evento"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start">Início</Label>
                <Input
                  id="start"
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end">Fim</Label>
                <Input
                  id="end"
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">{event.title}</h3>

            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <CalendarIcon className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <div>{formatEventTime(event.start, event.allDay)}</div>
                  {!event.allDay && (
                    <div className="text-muted-foreground">
                      até {format(parseISO(event.end), "HH:mm", { locale: ptBR })}
                    </div>
                  )}
                </div>
              </div>

              {event.location && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <span>{event.location}</span>
                </div>
              )}

              {event.description && (
                <div className="flex items-start gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <span className="text-muted-foreground whitespace-pre-wrap">{event.description}</span>
                </div>
              )}

              {event.attendees.length > 0 && (
                <div className="flex items-start gap-3">
                  <Users className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="space-y-1">
                    {event.attendees.map((attendee, index) => (
                      <div key={index} className="text-muted-foreground">
                        {attendee.displayName || attendee.email}
                        {attendee.responseStatus && (
                          <span className="ml-2 text-xs">
                            ({attendee.responseStatus === 'accepted' ? '✓' : 
                              attendee.responseStatus === 'declined' ? '✗' : '?'})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {event.htmlLink && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => window.open(event.htmlLink, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Abrir no Google Calendar
              </Button>
            )}
          </div>
        )}

        <DialogFooter className="flex gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)} disabled={loading}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </>
          ) : (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={deleting}>
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir evento?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação não pode ser desfeita. O evento será removido permanentemente do seu Google Calendar.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
