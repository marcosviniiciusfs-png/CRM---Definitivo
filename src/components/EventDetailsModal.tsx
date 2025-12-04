import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X, Edit2, Trash2, MapPin, Clock, Users, FileText, ExternalLink } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CalendarEvent } from './GoogleCalendarModal';

interface EventDetailsModalProps {
  event: CalendarEvent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEventUpdated: () => void;
}

export function EventDetailsModal({
  event,
  open,
  onOpenChange,
  onEventUpdated
}: EventDetailsModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');

  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setDescription(event.description || '');
      setLocation(event.location || '');
      const start = parseISO(event.start);
      const end = parseISO(event.end);
      setStartDate(format(start, 'yyyy-MM-dd'));
      setStartTime(format(start, 'HH:mm'));
      setEndDate(format(end, 'yyyy-MM-dd'));
      setEndTime(format(end, 'HH:mm'));
    }
  }, [event]);

  const handleUpdate = async () => {
    setLoading(true);
    try {
      const startDateTime = `${startDate}T${startTime}:00`;
      const endDateTime = `${endDate}T${endTime}:00`;

      const { error } = await supabase.functions.invoke('update-calendar-event', {
        body: {
          eventId: event.id,
          title,
          description,
          location,
          startDateTime,
          endDateTime
        }
      });

      if (error) throw error;

      toast.success('Evento atualizado!');
      setIsEditing(false);
      onEventUpdated();
    } catch (err: any) {
      console.error('Erro ao atualizar evento:', err);
      toast.error('Erro ao atualizar evento');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Tem certeza que deseja excluir este evento?')) return;

    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('delete-calendar-event', {
        body: { eventId: event.id }
      });

      if (error) throw error;

      toast.success('Evento excluído!');
      onEventUpdated();
    } catch (err: any) {
      console.error('Erro ao excluir evento:', err);
      toast.error('Erro ao excluir evento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 bg-white rounded-lg overflow-hidden border-none">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#039be5]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="p-2 rounded-full hover:bg-white/20 transition-colors"
            >
              <Edit2 className="h-4 w-4 text-white" />
            </button>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="p-2 rounded-full hover:bg-white/20 transition-colors"
            >
              <Trash2 className="h-4 w-4 text-white" />
            </button>
            {event.htmlLink && (
              <button
                onClick={() => window.open(event.htmlLink, '_blank')}
                className="p-2 rounded-full hover:bg-white/20 transition-colors"
              >
                <ExternalLink className="h-4 w-4 text-white" />
              </button>
            )}
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-2 rounded-full hover:bg-white/20 transition-colors"
          >
            <X className="h-4 w-4 text-white" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-4 space-y-4">
          {isEditing ? (
            <>
              {/* Modo edição */}
              <div>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full text-lg font-medium text-[#3c4043] border-b border-[#dadce0] pb-2 focus:outline-none focus:border-[#1a73e8]"
                  placeholder="Título do evento"
                />
              </div>

              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 text-[#5f6368]" />
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="flex-1 px-2 py-1 border border-[#dadce0] rounded text-sm focus:outline-none focus:border-[#1a73e8]"
                    />
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-24 px-2 py-1 border border-[#dadce0] rounded text-sm focus:outline-none focus:border-[#1a73e8]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="flex-1 px-2 py-1 border border-[#dadce0] rounded text-sm focus:outline-none focus:border-[#1a73e8]"
                    />
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-24 px-2 py-1 border border-[#dadce0] rounded text-sm focus:outline-none focus:border-[#1a73e8]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-[#5f6368] mt-2" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="flex-1 px-2 py-1 border border-[#dadce0] rounded text-sm focus:outline-none focus:border-[#1a73e8]"
                  placeholder="Adicionar local"
                />
              </div>

              <div className="flex items-start gap-3">
                <FileText className="h-4 w-4 text-[#5f6368] mt-2" />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="flex-1 px-2 py-1 border border-[#dadce0] rounded text-sm focus:outline-none focus:border-[#1a73e8] resize-none"
                  rows={3}
                  placeholder="Adicionar descrição"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-sm text-[#5f6368] hover:bg-[#f1f3f4] rounded transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpdate}
                  disabled={loading}
                  className="px-4 py-2 text-sm text-white bg-[#1a73e8] hover:bg-[#1557b0] rounded transition-colors disabled:opacity-50"
                >
                  {loading ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Modo visualização */}
              <div className="flex items-start gap-3">
                <div className="w-4 h-4 rounded bg-[#039be5] mt-1" />
                <div>
                  <h3 className="text-xl text-[#3c4043]">{event.title}</h3>
                </div>
              </div>

              <div className="flex items-center gap-3 text-[#5f6368]">
                <Clock className="h-4 w-4" />
                <div className="text-sm">
                  <div>
                    {event.allDay 
                      ? 'Dia inteiro' 
                      : format(parseISO(event.start), "EEEE, d 'de' MMMM", { locale: ptBR })}
                  </div>
                  {!event.allDay && (
                    <div>
                      {format(parseISO(event.start), 'HH:mm')} – {format(parseISO(event.end), 'HH:mm')}
                    </div>
                  )}
                </div>
              </div>

              {event.location && (
                <div className="flex items-center gap-3 text-[#5f6368]">
                  <MapPin className="h-4 w-4" />
                  <span className="text-sm">{event.location}</span>
                </div>
              )}

              {event.attendees && event.attendees.length > 0 && (
                <div className="flex items-start gap-3 text-[#5f6368]">
                  <Users className="h-4 w-4 mt-0.5" />
                  <div className="text-sm">
                    {event.attendees.map((attendee, index) => (
                      <div key={index}>{attendee.displayName || attendee.email}</div>
                    ))}
                  </div>
                </div>
              )}

              {event.description && (
                <div className="flex items-start gap-3 text-[#5f6368]">
                  <FileText className="h-4 w-4 mt-0.5" />
                  <p className="text-sm whitespace-pre-wrap">{event.description}</p>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default EventDetailsModal;
