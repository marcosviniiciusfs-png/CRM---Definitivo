import { useMemo } from 'react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isToday, parseISO, differenceInMinutes, startOfDay, setHours, setMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { CalendarEvent } from './GoogleCalendarModal';

interface CalendarWeekViewProps {
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

export function CalendarWeekView({ currentDate, events, onEventClick, onDateClick }: CalendarWeekViewProps) {
  const days = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [currentDate]);

  const getEventColor = (event: CalendarEvent) => {
    return EVENT_COLORS[event.colorId || 'default'] || EVENT_COLORS.default;
  };

  const getEventsForDay = (day: Date) => {
    return events.filter(event => {
      const eventDate = parseISO(event.start);
      return isSameDay(eventDate, day);
    });
  };

  const getEventPosition = (event: CalendarEvent) => {
    const start = parseISO(event.start);
    const end = parseISO(event.end);
    const dayStart = startOfDay(start);
    
    const topMinutes = differenceInMinutes(start, dayStart);
    const durationMinutes = differenceInMinutes(end, start);
    
    const top = (topMinutes / 60) * 48; // 48px per hour
    const height = Math.max((durationMinutes / 60) * 48, 20); // minimum 20px
    
    return { top, height };
  };

  const handleTimeSlotClick = (day: Date, hour: number) => {
    const clickedDate = setMinutes(setHours(day, hour), 0);
    onDateClick(clickedDate);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header with day names */}
      <div className="flex border-b flex-shrink-0">
        <div className="w-16 flex-shrink-0" /> {/* Time column spacer */}
        {days.map((day, index) => (
          <div
            key={index}
            className={cn(
              'flex-1 py-2 text-center border-l',
              isToday(day) && 'bg-primary/5'
            )}
          >
            <div className="text-xs text-muted-foreground">
              {format(day, 'EEE', { locale: ptBR })}
            </div>
            <div
              className={cn(
                'text-lg font-semibold mt-0.5',
                isToday(day) && 'text-primary'
              )}
            >
              {format(day, 'd')}
            </div>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-auto">
        <div className="relative min-h-[1152px]"> {/* 24 hours * 48px */}
          {/* Time labels and grid lines */}
          {HOURS.map(hour => (
            <div key={hour} className="flex h-12 border-b">
              <div className="w-16 flex-shrink-0 pr-2 text-right">
                <span className="text-xs text-muted-foreground -mt-2 inline-block">
                  {format(setHours(new Date(), hour), 'HH:00')}
                </span>
              </div>
              {days.map((day, dayIndex) => (
                <div
                  key={dayIndex}
                  onClick={() => handleTimeSlotClick(day, hour)}
                  className={cn(
                    'flex-1 border-l cursor-pointer hover:bg-muted/30 transition-colors',
                    isToday(day) && 'bg-primary/5'
                  )}
                />
              ))}
            </div>
          ))}

          {/* Events overlay */}
          <div className="absolute inset-0 flex pointer-events-none">
            <div className="w-16 flex-shrink-0" />
            {days.map((day, dayIndex) => {
              const dayEvents = getEventsForDay(day);
              return (
                <div key={dayIndex} className="flex-1 relative border-l">
                  {dayEvents.filter(e => !e.allDay).map(event => {
                    const { top, height } = getEventPosition(event);
                    return (
                      <div
                        key={event.id}
                        onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                        style={{ top: `${top}px`, height: `${height}px` }}
                        className={cn(
                          'absolute left-0.5 right-0.5 px-1 py-0.5 rounded text-[10px] text-white overflow-hidden cursor-pointer hover:opacity-80 transition-opacity pointer-events-auto',
                          getEventColor(event)
                        )}
                      >
                        <div className="font-medium truncate">{event.title}</div>
                        {height > 30 && (
                          <div className="text-white/80 truncate">
                            {format(parseISO(event.start), 'HH:mm')} - {format(parseISO(event.end), 'HH:mm')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
