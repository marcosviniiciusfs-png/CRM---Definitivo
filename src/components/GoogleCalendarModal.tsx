import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, Menu, Search, Settings, HelpCircle } from 'lucide-react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addWeeks, subWeeks, addMonths, subMonths, addDays, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useTheme } from '@/contexts/ThemeContext';
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
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  
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

  // Dynamic styles based on theme
  const styles = {
    bg: isDark ? 'bg-[#1e1e1e]' : 'bg-white',
    headerBg: isDark ? 'bg-[#2d2d2d]' : 'bg-white',
    border: isDark ? 'border-[#3c3c3c]' : 'border-[#dadce0]',
    text: isDark ? 'text-[#e8eaed]' : 'text-[#3c4043]',
    textSecondary: isDark ? 'text-[#9aa0a6]' : 'text-[#5f6368]',
    hover: isDark ? 'hover:bg-[#3c3c3c]' : 'hover:bg-[#f1f3f4]',
    buttonBorder: isDark ? 'border-[#5f6368]' : 'border-[#dadce0]',
    dropdownBg: isDark ? 'bg-[#2d2d2d]' : 'bg-white',
    activeItem: isDark ? 'bg-[#394457] text-[#8ab4f8]' : 'bg-[#e8f0fe] text-[#1a73e8]',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-w-[95vw] w-[95vw] h-[90vh] p-0 gap-0 ${styles.bg} overflow-hidden border-none`}>
        {/* Header Google Style */}
        <div className={`flex items-center justify-between px-4 py-2 border-b ${styles.border} ${styles.headerBg}`}>
          <div className="flex items-center gap-4">
            {/* Logo e título */}
            <div className="flex items-center gap-3">
              <button className={`p-2 rounded-full ${styles.hover} transition-colors`}>
                <Menu className={`h-5 w-5 ${styles.textSecondary}`} />
              </button>
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 36 36" className="h-10 w-10">
                  <path fill="#4285F4" d="M34 18.5V33H19V18.5z"/>
                  <path fill="#EA4335" d="M2 3h15v15.5H2z"/>
                  <path fill="#34A853" d="M17 18.5V33H2V18.5z"/>
                  <path fill="#FBBC05" d="M34 3v15.5H19V3z"/>
                  <rect fill={isDark ? "#2d2d2d" : "white"} x="8" y="9" width="20" height="18" rx="2"/>
                  <text x="18" y="22" textAnchor="middle" fontSize="12" fontWeight="500" fill={isDark ? "#9aa0a6" : "#70757a"}>
                    {format(new Date(), 'd')}
                  </text>
                </svg>
                <span className={`text-[22px] ${styles.text}`}>Agenda</span>
              </div>
            </div>

            {/* Navegação */}
            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={goToToday}
                className={`px-4 py-2 text-sm font-medium ${styles.text} border ${styles.buttonBorder} rounded ${styles.hover} transition-colors`}
              >
                Hoje
              </button>
              <button
                onClick={navigatePrev}
                className={`p-2 rounded-full ${styles.hover} transition-colors`}
              >
                <ChevronLeft className={`h-5 w-5 ${styles.textSecondary}`} />
              </button>
              <button
                onClick={navigateNext}
                className={`p-2 rounded-full ${styles.hover} transition-colors`}
              >
                <ChevronRight className={`h-5 w-5 ${styles.textSecondary}`} />
              </button>
              <span className={`text-[22px] ${styles.text} ml-2 capitalize`}>
                {getTitle()}
              </span>
            </div>
          </div>

          {/* Lado direito do header */}
          <div className="flex items-center gap-2">
            <button className={`p-2 rounded-full ${styles.hover} transition-colors`}>
              <Search className={`h-5 w-5 ${styles.textSecondary}`} />
            </button>
            <button className={`p-2 rounded-full ${styles.hover} transition-colors`}>
              <HelpCircle className={`h-5 w-5 ${styles.textSecondary}`} />
            </button>
            <button className={`p-2 rounded-full ${styles.hover} transition-colors`}>
              <Settings className={`h-5 w-5 ${styles.textSecondary}`} />
            </button>
            
            {/* Seletor de visualização */}
            <div className="relative ml-2">
              <button
                onClick={() => setViewDropdownOpen(!viewDropdownOpen)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium ${styles.text} border ${styles.buttonBorder} rounded ${styles.hover} transition-colors`}
              >
                {getViewLabel()}
                <ChevronLeft className="h-4 w-4 rotate-[-90deg]" />
              </button>
              
              {viewDropdownOpen && (
                <div className={`absolute right-0 top-full mt-1 ${styles.dropdownBg} border ${styles.border} rounded-lg shadow-lg py-2 z-50 min-w-[120px]`}>
                  <button
                    onClick={() => { setViewMode('day'); setViewDropdownOpen(false); }}
                    className={`w-full px-4 py-2 text-sm text-left ${styles.hover} ${viewMode === 'day' ? styles.activeItem : styles.text}`}
                  >
                    Dia
                  </button>
                  <button
                    onClick={() => { setViewMode('week'); setViewDropdownOpen(false); }}
                    className={`w-full px-4 py-2 text-sm text-left ${styles.hover} ${viewMode === 'week' ? styles.activeItem : styles.text}`}
                  >
                    Semana
                  </button>
                  <button
                    onClick={() => { setViewMode('month'); setViewDropdownOpen(false); }}
                    className={`w-full px-4 py-2 text-sm text-left ${styles.hover} ${viewMode === 'month' ? styles.activeItem : styles.text}`}
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
            isDark={isDark}
          />

          {/* Área do calendário */}
          <div className={`flex-1 overflow-auto ${styles.bg}`}>
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
                    isDark={isDark}
                  />
                )}
                {viewMode === 'week' && (
                  <CalendarWeekView
                    currentDate={currentDate}
                    events={events}
                    onEventClick={handleEventClick}
                    onDateClick={handleDateClick}
                    isDark={isDark}
                  />
                )}
                {viewMode === 'day' && (
                  <CalendarDayView
                    currentDate={currentDate}
                    events={events}
                    onEventClick={handleEventClick}
                    onDateClick={handleDateClick}
                    isDark={isDark}
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
