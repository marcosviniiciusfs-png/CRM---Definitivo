import { useMemo, useEffect, useState } from 'react';
import { format, isSameDay, parseISO, differenceInMinutes, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarEvent } from './GoogleCalendarModal';

interface CalendarDayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onDateClick: (date: Date) => void;
  isDark?: boolean;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function CalendarDayView({
  currentDate,
  events,
  onEventClick,
  onDateClick,
  isDark = false
}: CalendarDayViewProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const isTodayDate = isToday(currentDate);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const dayEvents = useMemo(() => {
    return events.filter(event => {
      const eventDate = parseISO(event.start);
      return isSameDay(eventDate, currentDate);
    });
  }, [events, currentDate]);

  const allDayEvents = dayEvents.filter(e => e.allDay);
  const timedEvents = dayEvents.filter(e => !e.allDay);

  const getEventPosition = (event: CalendarEvent) => {
    const start = parseISO(event.start);
    const end = parseISO(event.end);
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const duration = differenceInMinutes(end, start);
    
    return {
      top: `${(startMinutes / 60) * 48}px`,
      height: `${Math.max((duration / 60) * 48, 24)}px`
    };
  };

  const handleTimeSlotClick = (hour: number) => {
    const clickedDate = new Date(currentDate);
    clickedDate.setHours(hour, 0, 0, 0);
    onDateClick(clickedDate);
  };

  const getCurrentTimePosition = () => {
    const minutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    return `${(minutes / 60) * 48}px`;
  };

  const weekDays = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

  // Dynamic styles based on theme
  const styles = {
    bg: isDark ? 'bg-[#1e1e1e]' : 'bg-white',
    headerBg: isDark ? 'bg-[#2d2d2d]' : 'bg-white',
    border: isDark ? 'border-[#3c3c3c]' : 'border-[#dadce0]',
    text: isDark ? 'text-[#e8eaed]' : 'text-[#3c4043]',
    textSecondary: isDark ? 'text-[#9aa0a6]' : 'text-[#70757a]',
    hover: isDark ? 'hover:bg-[#3c3c3c]' : 'hover:bg-[#f1f3f4]',
    allDayBg: isDark ? 'bg-[#252525]' : 'bg-[#f8f9fa]',
    todayText: isDark ? 'text-[#8ab4f8]' : 'text-[#1a73e8]',
    todayBg: isDark ? 'bg-[#8ab4f8]' : 'bg-[#1a73e8]',
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header com o dia */}
      <div className={`flex border-b ${styles.border} ${styles.headerBg} sticky top-0 z-10`}>
        {/* Coluna de timezone */}
        <div className={`w-[60px] flex-shrink-0 border-r ${styles.border}`}>
          <div className="h-[72px] flex items-end justify-center pb-2">
            <span className={`text-[10px] ${styles.textSecondary}`}>GMT-03</span>
          </div>
        </div>

        {/* Dia */}
        <div className="flex-1">
          <div className="h-[72px] flex flex-col items-center justify-center">
            <span className={`text-[11px] font-medium ${isTodayDate ? styles.todayText : styles.textSecondary}`}>
              {weekDays[currentDate.getDay()]}
            </span>
            <div
              className={`
                w-[46px] h-[46px] flex items-center justify-center rounded-full text-[26px]
                ${isTodayDate ? `${styles.todayBg} text-white` : styles.text}
              `}
            >
              {format(currentDate, 'd')}
            </div>
          </div>
        </div>
      </div>

      {/* Eventos de dia inteiro */}
      {allDayEvents.length > 0 && (
        <div className={`px-[60px] py-2 border-b ${styles.border} ${styles.allDayBg}`}>
          <div className="space-y-1">
            {allDayEvents.map(event => (
              <div
                key={event.id}
                onClick={() => onEventClick(event)}
                className="bg-[#039be5] text-white text-[12px] px-3 py-1 rounded cursor-pointer hover:bg-[#0288d1] transition-colors"
              >
                {event.title}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid de horas */}
      <div className="flex flex-1 overflow-auto">
        {/* Coluna de horas */}
        <div className="w-[60px] flex-shrink-0">
          {HOURS.map(hour => (
            <div
              key={hour}
              className={`h-[48px] flex items-start justify-end pr-2 border-r ${styles.border}`}
            >
              {hour > 0 && (
                <span className={`text-[10px] ${styles.textSecondary} -mt-[6px]`}>
                  {hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Área do dia */}
        <div className="flex-1 relative">
          {/* Grid de horas */}
          {HOURS.map(hour => (
            <div
              key={hour}
              className={`h-[48px] border-b ${styles.border} ${styles.hover} cursor-pointer transition-colors`}
              onClick={() => handleTimeSlotClick(hour)}
            />
          ))}

          {/* Linha vermelha do horário atual */}
          {isTodayDate && (
            <div
              className="absolute left-0 right-0 z-20 pointer-events-none"
              style={{ top: getCurrentTimePosition() }}
            >
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-[#ea4335] -ml-[6px]" />
                <div className="flex-1 h-[2px] bg-[#ea4335]" />
              </div>
            </div>
          )}

          {/* Eventos */}
          {timedEvents.map(event => {
            const position = getEventPosition(event);
            return (
              <div
                key={event.id}
                className="absolute left-2 right-2 bg-[#039be5] rounded px-3 py-2 cursor-pointer hover:bg-[#0288d1] transition-colors overflow-hidden z-10"
                style={{
                  top: position.top,
                  height: position.height
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onEventClick(event);
                }}
              >
                <div className="text-white text-[12px] font-medium truncate">
                  {event.title}
                </div>
                <div className="text-white/80 text-[11px] truncate">
                  {format(parseISO(event.start), 'HH:mm')} - {format(parseISO(event.end), 'HH:mm')}
                </div>
                {event.location && (
                  <div className="text-white/70 text-[10px] truncate mt-1">
                    📍 {event.location}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default CalendarDayView;
