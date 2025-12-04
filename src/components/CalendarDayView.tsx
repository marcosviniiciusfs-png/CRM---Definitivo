import { useMemo } from 'react';
import { format, isSameDay, parseISO, differenceInMinutes, startOfDay, setHours, setMinutes, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { CalendarEvent } from './GoogleCalendarModal';

interface CalendarDayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onDateClick: (date: Date) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

const EVENT_COLORS: Record<string, string> = {
  '1': 'bg-blue-500',
  '2': 'bg-green-500',
  '3': 'bg-purple-500',
  '4': 'bg-red-500',
  '5': 'bg-yellow-500',
  '6': 'bg-orange-500',
  '7': 'bg-cyan-500',
  '8': 'bg-gray-500',
  '9': 'bg-indigo-500',
  '10': 'bg-emerald-500',
  '11': 'bg-rose-500',
  default: 'bg-primary',
};

export function CalendarDayView({ currentDate, events, onEventClick, onDateClick }: CalendarDayViewProps) {
  const dayEvents = useMemo(() => {
    return events.filter(event => {
      const eventDate = parseISO(event.start);
      return isSameDay(eventDate, currentDate);
    });
  }, [events, currentDate]);

  const allDayEvents = dayEvents.filter(e => e.allDay);
  const timedEvents = dayEvents.filter(e => !e.allDay);

  const getEventColor = (event: CalendarEvent) => {
    return EVENT_COLORS[event.colorId || 'default'] || EVENT_COLORS.default;
  };

  const getEventPosition = (event: CalendarEvent) => {
    const start = parseISO(event.start);
    const end = parseISO(event.end);
    const dayStart = startOfDay(start);
    
    const topMinutes = differenceInMinutes(start, dayStart);
    const durationMinutes = differenceInMinutes(end, start);
    
    const top = (topMinutes / 60) * 60; // 60px per hour
    const height = Math.max((durationMinutes / 60) * 60, 30); // minimum 30px
    
    return { top, height };
  };

  const handleTimeSlotClick = (hour: number) => {
    const clickedDate = setMinutes(setHours(currentDate, hour), 0);
    onDateClick(clickedDate);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="text-center py-3 border-b flex-shrink-0">
        <div className="text-sm text-muted-foreground">
          {format(currentDate, 'EEEE', { locale: ptBR })}
        </div>
        <div className={cn(
          'text-3xl font-bold mt-1',
          isToday(currentDate) && 'text-primary'
        )}>
          {format(currentDate, 'd')}
        </div>
        <div className="text-sm text-muted-foreground">
          {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
        </div>
      </div>

      {/* All-day events */}
      {allDayEvents.length > 0 && (
        <div className="p-2 border-b bg-muted/30 flex-shrink-0">
          <div className="text-xs text-muted-foreground mb-1">Dia inteiro</div>
          <div className="space-y-1">
            {allDayEvents.map(event => (
              <div
                key={event.id}
                onClick={() => onEventClick(event)}
                className={cn(
                  'px-2 py-1 rounded text-sm text-white cursor-pointer hover:opacity-80 transition-opacity',
                  getEventColor(event)
                )}
              >
                {event.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Time grid */}
      <div className="flex-1 overflow-auto">
        <div className="relative min-h-[1440px]"> {/* 24 hours * 60px */}
          {/* Time slots */}
          {HOURS.map(hour => (
            <div key={hour} className="flex h-[60px] border-b">
              <div className="w-20 flex-shrink-0 pr-3 text-right pt-0">
                <span className="text-xs text-muted-foreground">
                  {format(setHours(new Date(), hour), 'HH:00')}
                </span>
              </div>
              <div
                onClick={() => handleTimeSlotClick(hour)}
                className="flex-1 cursor-pointer hover:bg-muted/30 transition-colors"
              />
            </div>
          ))}

          {/* Events overlay */}
          <div className="absolute inset-0 flex pointer-events-none">
            <div className="w-20 flex-shrink-0" />
            <div className="flex-1 relative">
              {timedEvents.map(event => {
                const { top, height } = getEventPosition(event);
                return (
                  <div
                    key={event.id}
                    onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                    style={{ top: `${top}px`, height: `${height}px` }}
                    className={cn(
                      'absolute left-1 right-4 px-3 py-1.5 rounded text-white overflow-hidden cursor-pointer hover:opacity-80 transition-opacity pointer-events-auto shadow-sm',
                      getEventColor(event)
                    )}
                  >
                    <div className="font-medium text-sm truncate">{event.title}</div>
                    <div className="text-xs text-white/80">
                      {format(parseISO(event.start), 'HH:mm')} - {format(parseISO(event.end), 'HH:mm')}
                    </div>
                    {height > 60 && event.location && (
                      <div className="text-xs text-white/70 truncate mt-0.5">
                        📍 {event.location}
                      </div>
                    )}
                    {height > 80 && event.description && (
                      <div className="text-xs text-white/70 mt-1 line-clamp-2">
                        {event.description}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
