import { useMemo } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isToday, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { CalendarEvent } from './GoogleCalendarModal';

interface CalendarMonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onDateClick: (date: Date) => void;
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

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

export function CalendarMonthView({ currentDate, events, onEventClick, onDateClick }: CalendarMonthViewProps) {
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    
    events.forEach(event => {
      const eventDate = parseISO(event.start);
      const key = format(eventDate, 'yyyy-MM-dd');
      
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(event);
    });
    
    return map;
  }, [events]);

  const getEventColor = (event: CalendarEvent) => {
    return EVENT_COLORS[event.colorId || 'default'] || EVENT_COLORS.default;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header with weekday names */}
      <div className="grid grid-cols-7 border-b">
        {WEEKDAYS.map(day => (
          <div key={day} className="py-2 text-center text-xs font-medium text-muted-foreground">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 grid grid-cols-7 auto-rows-fr">
        {days.map((day, index) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayEvents = eventsByDay.get(dateKey) || [];
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isCurrentDay = isToday(day);

          return (
            <div
              key={index}
              onClick={() => onDateClick(day)}
              className={cn(
                'min-h-[80px] border-b border-r p-1 cursor-pointer transition-colors hover:bg-muted/50',
                !isCurrentMonth && 'bg-muted/30'
              )}
            >
              <div className="flex items-center justify-center mb-1">
                <span
                  className={cn(
                    'text-sm w-7 h-7 flex items-center justify-center rounded-full',
                    !isCurrentMonth && 'text-muted-foreground',
                    isCurrentDay && 'bg-primary text-primary-foreground font-semibold'
                  )}
                >
                  {format(day, 'd')}
                </span>
              </div>
              <div className="space-y-0.5 overflow-hidden">
                {dayEvents.slice(0, 3).map(event => (
                  <div
                    key={event.id}
                    onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded truncate text-white cursor-pointer hover:opacity-80 transition-opacity',
                      getEventColor(event)
                    )}
                    title={event.title}
                  >
                    {event.allDay ? event.title : `${format(parseISO(event.start), 'HH:mm')} ${event.title}`}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-muted-foreground px-1.5">
                    +{dayEvents.length - 3} mais
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
