import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X, Clock, MapPin, FileText, Users } from 'lucide-react';
import { format, addHours } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CreateCalendarEventModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate: Date | null;
  onEventCreated: () => void;
}

export function CreateCalendarEventModal({
  open,
  onOpenChange,
  initialDate,
  onEventCreated
}: CreateCalendarEventModalProps) {
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('10:00');
  const [attendees, setAttendees] = useState('');

  useEffect(() => {
    if (open && initialDate) {
      const dateStr = format(initialDate, 'yyyy-MM-dd');
      setStartDate(dateStr);
      setEndDate(dateStr);
      
      const hours = initialDate.getHours();
      if (hours > 0) {
        setStartTime(`${hours.toString().padStart(2, '0')}:00`);
        setEndTime(`${(hours + 1).toString().padStart(2, '0')}:00`);
      }
    }
  }, [open, initialDate]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setLocation('');
    setAttendees('');
    setStartDate('');
    setEndDate('');
    setStartTime('09:00');
    setEndTime('10:00');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      toast.error('Digite o título do evento');
      return;
    }

    setLoading(true);
    try {
      const startDateTime = `${startDate}T${startTime}:00`;
      const endDateTime = `${endDate}T${endTime}:00`;

      const attendeesList = attendees
        .split(',')
        .map(email => email.trim())
        .filter(email => email.length > 0);

      const { error } = await supabase.functions.invoke('create-calendar-event', {
        body: {
          title,
          description,
          location,
          startDateTime,
          endDateTime,
          attendees: attendeesList
        }
      });

      if (error) throw error;

      toast.success('Evento criado!');
      resetForm();
      onEventCreated();
    } catch (err: any) {
      console.error('Erro ao criar evento:', err);
      toast.error('Erro ao criar evento');
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
      <DialogContent className="max-w-md p-0 gap-0 bg-white rounded-lg overflow-hidden border-none">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#dadce0]">
          <h2 className="text-lg text-[#3c4043]">Criar evento</h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-full hover:bg-[#f1f3f4] transition-colors"
          >
            <X className="h-4 w-4 text-[#5f6368]" />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-lg text-[#3c4043] border-b border-[#dadce0] pb-2 focus:outline-none focus:border-[#1a73e8]"
              placeholder="Adicionar título"
              autoFocus
            />
          </div>

          <div className="flex items-center gap-3">
            <Clock className="h-4 w-4 text-[#5f6368]" />
            <div className="flex-1 space-y-2">
              <div className="flex gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (!endDate || e.target.value > endDate) {
                      setEndDate(e.target.value);
                    }
                  }}
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
                  min={startDate}
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
            <Users className="h-4 w-4 text-[#5f6368] mt-2" />
            <input
              type="text"
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
              className="flex-1 px-2 py-1 border border-[#dadce0] rounded text-sm focus:outline-none focus:border-[#1a73e8]"
              placeholder="Adicionar convidados (emails separados por vírgula)"
            />
          </div>

          <div className="flex items-start gap-3">
            <MapPin className="h-4 w-4 text-[#5f6368] mt-2" />
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="flex-1 px-2 py-1 border border-[#dadce0] rounded text-sm focus:outline-none focus:border-[#1a73e8]"
              placeholder="Adicionar local ou videoconferência"
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
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm text-[#5f6368] hover:bg-[#f1f3f4] rounded transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm text-white bg-[#1a73e8] hover:bg-[#1557b0] rounded transition-colors disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateCalendarEventModal;
