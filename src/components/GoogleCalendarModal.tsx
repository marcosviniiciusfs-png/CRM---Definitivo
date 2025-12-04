import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronLeft, ChevronRight, Plus, Calendar, Loader2, AlertCircle } from 'lucide-react';
import { format, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CalendarMonthView } from './CalendarMonthView';
import { CalendarWeekView } from './CalendarWeekView';
import { CalendarDayView } from './CalendarDayView';
import { EventDetailsModal } from './EventDetailsModal';
import { CreateCalendarEventModal } from './CreateCalendarEventModal';

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  attendees: { email: string; displayName?: string; responseStatus?: string }[];
  htmlLink: string;
  colorId?: string;
}

interface GoogleCalendarModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ViewMode = 'month' | 'week' | 'day';

export function GoogleCalendarModal({ open, onOpenChange }: GoogleCalendarModalProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createDate, setCreateDate] = useState<Date | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      let timeMin: Date;
      let timeMax: Date;

      if (viewMode === 'month') {
        timeMin = startOfMonth(currentDate);
        timeMax = endOfMonth(currentDate);
        // Extend to include days from adjacent months visible in calendar
        timeMin = startOfWeek(timeMin, { weekStartsOn: 0 });
        timeMax = endOfWeek(timeMax, { weekStartsOn: 0 });
      } else if (viewMode === 'week') {
        timeMin = startOfWeek(currentDate, { weekStartsOn: 0 });
        timeMax = endOfWeek(currentDate, { weekStartsOn: 0 });
      } else {
        timeMin = new Date(currentDate);
        timeMin.setHours(0, 0, 0, 0);
        timeMax = new Date(currentDate);
        timeMax.setHours(23, 59, 59, 999);
      }

      const { data, error: funcError } = await supabase.functions.invoke('list-calendar-events', {
        body: {
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
        },
      });

      if (funcError) throw funcError;
      if (data.error) throw new Error(data.error);

      setEvents(data.events || []);
    } catch (err) {
      console.error('Erro ao buscar eventos:', err);
      const message = err instanceof Error ? err.message : 'Erro ao carregar eventos';
      setError(message);
      if (message !== 'Google Calendar não conectado') {
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  }, [currentDate, viewMode]);

  useEffect(() => {
    if (open) {
      fetchEvents();
    }
  }, [open, fetchEvents]);

  const navigatePrev = () => {
    if (viewMode === 'month') {
      setCurrentDate(subMonths(currentDate, 1));
    } else if (viewMode === 'week') {
      setCurrentDate(subWeeks(currentDate, 1));
    } else {
      setCurrentDate(subDays(currentDate, 1));
    }
  };

  const navigateNext = () => {
    if (viewMode === 'month') {
      setCurrentDate(addMonths(currentDate, 1));
    } else if (viewMode === 'week') {
      setCurrentDate(addWeeks(currentDate, 1));
    } else {
      setCurrentDate(addDays(currentDate, 1));
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setEventModalOpen(true);
  };

  const handleDateClick = (date: Date) => {
    setCreateDate(date);
    setCreateModalOpen(true);
  };

  const handleEventUpdated = () => {
    fetchEvents();
    setEventModalOpen(false);
    setSelectedEvent(null);
  };

  const handleEventCreated = () => {
    fetchEvents();
    setCreateModalOpen(false);
    setCreateDate(null);
  };

  const getTitle = () => {
    if (viewMode === 'month') {
      return format(currentDate, "MMMM 'de' yyyy", { locale: ptBR });
    } else if (viewMode === 'week') {
      const start = startOfWeek(currentDate, { weekStartsOn: 0 });
      const end = endOfWeek(currentDate, { weekStartsOn: 0 });
      return `${format(start, 'd MMM', { locale: ptBR })} - ${format(end, 'd MMM yyyy', { locale: ptBR })}`;
    } else {
      return format(currentDate, "EEEE, d 'de' MMMM", { locale: ptBR });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0">
          <DialogHeader className="p-4 pb-0 flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Calendar className="h-5 w-5 text-primary" />
                Meu Calendário
              </DialogTitle>
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                <TabsList className="h-8">
                  <TabsTrigger value="month" className="text-xs px-3">Mês</TabsTrigger>
                  <TabsTrigger value="week" className="text-xs px-3">Semana</TabsTrigger>
                  <TabsTrigger value="day" className="text-xs px-3">Dia</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </DialogHeader>

          <div className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goToToday}>
                Hoje
              </Button>
              <div className="flex items-center">
                <Button variant="ghostIcon" size="icon" onClick={navigatePrev} className="h-8 w-8">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghostIcon" size="icon" onClick={navigateNext} className="h-8 w-8">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <h2 className="text-base font-semibold capitalize ml-2">
                {getTitle()}
              </h2>
            </div>
            <Button size="sm" onClick={() => { setCreateDate(new Date()); setCreateModalOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" />
              Novo Evento
            </Button>
          </div>

          <div className="flex-1 overflow-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : error === 'Google Calendar não conectado' ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
                <AlertCircle className="h-12 w-12" />
                <p>Google Calendar não conectado</p>
                <p className="text-sm">Conecte sua conta em Configurações &gt; Integrações</p>
              </div>
            ) : (
              <>
                {viewMode === 'month' && (
                  <CalendarMonthView
                    currentDate={currentDate}
                    events={events}
                    onEventClick={handleEventClick}
                    onDateClick={handleDateClick}
                  />
                )}
                {viewMode === 'week' && (
                  <CalendarWeekView
                    currentDate={currentDate}
                    events={events}
                    onEventClick={handleEventClick}
                    onDateClick={handleDateClick}
                  />
                )}
                {viewMode === 'day' && (
                  <CalendarDayView
                    currentDate={currentDate}
                    events={events}
                    onEventClick={handleEventClick}
                    onDateClick={handleDateClick}
                  />
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {selectedEvent && (
        <EventDetailsModal
          open={eventModalOpen}
          onOpenChange={setEventModalOpen}
          event={selectedEvent}
          onEventUpdated={handleEventUpdated}
        />
      )}

      <CreateCalendarEventModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        initialDate={createDate}
        onEventCreated={handleEventCreated}
      />
    </>
  );
}
