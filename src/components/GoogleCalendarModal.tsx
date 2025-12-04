import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Menu, Search, Settings, HelpCircle } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, subWeeks, addMonths, subMonths, addDays, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import CalendarSidebar from './CalendarSidebar';
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

type ViewMode = 'day' | 'week' | 'month';

export function GoogleCalendarModal({ open, onOpenChange }: GoogleCalendarModalProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [createEventDate, setCreateEventDate] = useState<Date | null>(null);
  const [viewDropdownOpen, setViewDropdownOpen] = useState(false);

  useEffect(() => {
    if (open) {
      fetchEvents();
    }
  }, [open, currentDate, viewMode]);

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);

    try {
      let timeMin: Date, timeMax: Date;

      if (viewMode === 'month') {
        timeMin = startOfMonth(currentDate);
        timeMax = endOfMonth(currentDate);
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

      const { data, error: fnError } = await supabase.functions.invoke('list-calendar-events', {
        body: {
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString()
        }
      });

      if (fnError) throw fnError;
      setEvents(data?.events || []);
    } catch (err: any) {
      console.error('Erro ao buscar eventos:', err);
      setError('Não foi possível carregar os eventos');
    } finally {
      setLoading(false);
    }
  };

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
    setEventDetailsOpen(true);
  };

  const handleDateClick = (date: Date) => {
    setCreateEventDate(date);
    setCreateEventOpen(true);
  };

  const handleCreateEvent = () => {
    setCreateEventDate(new Date());
    setCreateEventOpen(true);
  };

  const handleEventUpdated = () => {
    fetchEvents();
    setEventDetailsOpen(false);
    setSelectedEvent(null);
  };

  const handleEventCreated = () => {
    fetchEvents();
    setCreateEventOpen(false);
    setCreateEventDate(null);
  };

  const getTitle = () => {
    if (viewMode === 'month') {
      return format(currentDate, 'MMMM yyyy', { locale: ptBR });
    } else if (viewMode === 'week') {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
      const startMonth = format(weekStart, 'MMM', { locale: ptBR });
      const endMonth = format(weekEnd, 'MMM', { locale: ptBR });
      const year = format(currentDate, 'yyyy');
      
      if (startMonth === endMonth) {
        return `${startMonth} ${year}`;
      }
      return `${startMonth} – ${endMonth} ${year}`;
    } else {
      return format(currentDate, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
    }
  };

  const getViewLabel = () => {
    switch (viewMode) {
      case 'day': return 'Dia';
      case 'week': return 'Semana';
      case 'month': return 'Mês';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] p-0 gap-0 bg-white overflow-hidden border-none">
        {/* Header Google Style */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#dadce0] bg-white">
          <div className="flex items-center gap-4">
            {/* Logo e título */}
            <div className="flex items-center gap-3">
              <button className="p-2 rounded-full hover:bg-[#f1f3f4] transition-colors">
                <Menu className="h-5 w-5 text-[#5f6368]" />
              </button>
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 36 36" className="h-10 w-10">
                  <path fill="#4285F4" d="M34 18.5V33H19V18.5z"/>
                  <path fill="#EA4335" d="M2 3h15v15.5H2z"/>
                  <path fill="#34A853" d="M17 18.5V33H2V18.5z"/>
                  <path fill="#FBBC05" d="M34 3v15.5H19V3z"/>
                  <rect fill="white" x="8" y="9" width="20" height="18" rx="2"/>
                  <text x="18" y="22" textAnchor="middle" fontSize="12" fontWeight="500" fill="#70757a">
                    {format(new Date(), 'd')}
                  </text>
                </svg>
                <span className="text-[22px] text-[#3c4043]">Agenda</span>
              </div>
            </div>

            {/* Navegação */}
            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={goToToday}
                className="px-4 py-2 text-sm font-medium text-[#3c4043] border border-[#dadce0] rounded hover:bg-[#f1f3f4] transition-colors"
              >
                Hoje
              </button>
              <button
                onClick={navigatePrev}
                className="p-2 rounded-full hover:bg-[#f1f3f4] transition-colors"
              >
                <ChevronLeft className="h-5 w-5 text-[#5f6368]" />
              </button>
              <button
                onClick={navigateNext}
                className="p-2 rounded-full hover:bg-[#f1f3f4] transition-colors"
              >
                <ChevronRight className="h-5 w-5 text-[#5f6368]" />
              </button>
              <span className="text-[22px] text-[#3c4043] ml-2 capitalize">
                {getTitle()}
              </span>
            </div>
          </div>

          {/* Lado direito do header */}
          <div className="flex items-center gap-2">
            <button className="p-2 rounded-full hover:bg-[#f1f3f4] transition-colors">
              <Search className="h-5 w-5 text-[#5f6368]" />
            </button>
            <button className="p-2 rounded-full hover:bg-[#f1f3f4] transition-colors">
              <HelpCircle className="h-5 w-5 text-[#5f6368]" />
            </button>
            <button className="p-2 rounded-full hover:bg-[#f1f3f4] transition-colors">
              <Settings className="h-5 w-5 text-[#5f6368]" />
            </button>
            
            {/* Seletor de visualização */}
            <div className="relative ml-2">
              <button
                onClick={() => setViewDropdownOpen(!viewDropdownOpen)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#3c4043] border border-[#dadce0] rounded hover:bg-[#f1f3f4] transition-colors"
              >
                {getViewLabel()}
                <ChevronLeft className="h-4 w-4 rotate-[-90deg]" />
              </button>
              
              {viewDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-[#dadce0] rounded-lg shadow-lg py-2 z-50 min-w-[120px]">
                  <button
                    onClick={() => { setViewMode('day'); setViewDropdownOpen(false); }}
                    className={`w-full px-4 py-2 text-sm text-left hover:bg-[#f1f3f4] ${viewMode === 'day' ? 'bg-[#e8f0fe] text-[#1a73e8]' : 'text-[#3c4043]'}`}
                  >
                    Dia
                  </button>
                  <button
                    onClick={() => { setViewMode('week'); setViewDropdownOpen(false); }}
                    className={`w-full px-4 py-2 text-sm text-left hover:bg-[#f1f3f4] ${viewMode === 'week' ? 'bg-[#e8f0fe] text-[#1a73e8]' : 'text-[#3c4043]'}`}
                  >
                    Semana
                  </button>
                  <button
                    onClick={() => { setViewMode('month'); setViewDropdownOpen(false); }}
                    className={`w-full px-4 py-2 text-sm text-left hover:bg-[#f1f3f4] ${viewMode === 'month' ? 'bg-[#e8f0fe] text-[#1a73e8]' : 'text-[#3c4043]'}`}
                  >
                    Mês
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Corpo principal */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <CalendarSidebar
            currentDate={currentDate}
            onDateSelect={(date) => {
              setCurrentDate(date);
              setViewMode('day');
            }}
            onCreateEvent={handleCreateEvent}
          />

          {/* Área do calendário */}
          <div className="flex-1 overflow-auto bg-white">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1a73e8]"></div>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full text-[#d93025]">
                {error}
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
        </div>

        {/* Modais */}
        {selectedEvent && (
          <EventDetailsModal
            event={selectedEvent}
            open={eventDetailsOpen}
            onOpenChange={setEventDetailsOpen}
            onEventUpdated={handleEventUpdated}
          />
        )}

        <CreateCalendarEventModal
          open={createEventOpen}
          onOpenChange={setCreateEventOpen}
          initialDate={createEventDate}
          onEventCreated={handleEventCreated}
        />
      </DialogContent>
    </Dialog>
  );
}

export default GoogleCalendarModal;
