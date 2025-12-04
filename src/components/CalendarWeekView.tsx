import { useMemo, useEffect, useState } from 'react';
import { format, startOfWeek, addDays, isSameDay, parseISO, differenceInMinutes, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarEvent } from './GoogleCalendarModal';

interface CalendarWeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onDateClick: (date: Date) => void;
  isDark?: boolean;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function CalendarWeekView({
  currentDate,
  events,
  onEventClick,
  onDateClick,
  isDark = false
}: CalendarWeekViewProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const today = new Date();

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const days = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [currentDate]);

  const getEventsForDay = (day: Date) => {
    return events.filter(event => {
      const eventDate = parseISO(event.start);
      return isSameDay(eventDate, day);
    });
  };

  const getEventPosition = (event: CalendarEvent) => {
    const start = parseISO(event.start);
    const end = parseISO(event.end);
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const duration = differenceInMinutes(end, start);
    
    return {
      top: `${(startMinutes / 60) * 48}px`,
      height: `${Math.max((duration / 60) * 48, 20)}px`
    };
  };

  const handleTimeSlotClick = (day: Date, hour: number) => {
    const clickedDate = new Date(day);
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
    todayText: isDark ? 'text-[#8ab4f8]' : 'text-[#1a73e8]',
    todayBg: isDark ? 'bg-[#8ab4f8]' : 'bg-[#1a73e8]',
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header com dias da semana */}
      <div className={`flex border-b ${styles.border} ${styles.headerBg} sticky top-0 z-10`}>
        {/* Coluna de timezone */}
        <div className={`w-[60px] flex-shrink-0 border-r ${styles.border}`}>
          <div className="h-[72px] flex items-end justify-center pb-2">
            <span className={`text-[10px] ${styles.textSecondary}`}>GMT-03</span>
          </div>
        </div>

        {/* Dias da semana */}
        {days.map((day, index) => {
          const isTodayDate = isToday(day);
          return (
            <div
              key={index}
              className={`flex-1 border-r ${styles.border} last:border-r-0`}
            >
              <div className="h-[72px] flex flex-col items-center justify-center">
                <span className={`text-[11px] font-medium ${isTodayDate ? styles.todayText : styles.textSecondary}`}>
                  {weekDays[index]}
                </span>
                <div
                  className={`
                    w-[46px] h-[46px] flex items-center justify-center rounded-full text-[26px]
                    ${isTodayDate ? `${styles.todayBg} text-white` : `${styles.text} ${styles.hover}`}
                    cursor-pointer transition-colors
                  `}
                  onClick={() => handleTimeSlotClick(day, 9)}
                >
                  {format(day, 'd')}
                </div>
              </div>
            </div>
          );
        })}
      </div>

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

        {/* Colunas dos dias */}
        {days.map((day, dayIndex) => {
          const dayEvents = getEventsForDay(day).filter(e => !e.allDay);
          const isTodayDate = isToday(day);

          return (
            <div
              key={dayIndex}
              className={`flex-1 border-r ${styles.border} last:border-r-0 relative`}
            >
              {/* Grid de horas */}
              {HOURS.map(hour => (
                <div
                  key={hour}
                  className={`h-[48px] border-b ${styles.border} ${styles.hover} cursor-pointer transition-colors`}
                  onClick={() => handleTimeSlotClick(day, hour)}
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
              {dayEvents.map(event => {
                const position = getEventPosition(event);
                return (
                  <div
                    key={event.id}
                    className="absolute left-1 right-1 bg-[#039be5] rounded px-2 py-1 cursor-pointer hover:bg-[#0288d1] transition-colors overflow-hidden z-10"
                    style={{
                      top: position.top,
                      height: position.height,
                      minHeight: '20px'
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(event);
                    }}
                  >
                    <div className="text-white text-[11px] font-medium truncate">
                      {event.title}
                    </div>
                    <div className="text-white/80 text-[10px] truncate">
                      {format(parseISO(event.start), 'HH:mm')} - {format(parseISO(event.end), 'HH:mm')}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CalendarWeekView;
