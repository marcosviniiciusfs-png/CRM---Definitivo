import { useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, startOfWeek, endOfWeek, parseISO, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarEvent } from './GoogleCalendarModal';

interface CalendarMonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onDateClick: (date: Date) => void;
  isDark?: boolean;
}

export function CalendarMonthView({
  currentDate,
  events,
  onEventClick,
  onDateClick,
  isDark = false
}: CalendarMonthViewProps) {
  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach(event => {
      const dateKey = format(parseISO(event.start), 'yyyy-MM-dd');
      if (!map[dateKey]) {
        map[dateKey] = [];
      }
      map[dateKey].push(event);
    });
    return map;
  }, [events]);

  const weekDays = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  }, [days]);

  // Dynamic styles based on theme
  const styles = {
    bg: isDark ? 'bg-[#1e1e1e]' : 'bg-white',
    headerBg: isDark ? 'bg-[#2d2d2d]' : 'bg-white',
    border: isDark ? 'border-[#3c3c3c]' : 'border-[#dadce0]',
    text: isDark ? 'text-[#e8eaed]' : 'text-[#3c4043]',
    textSecondary: isDark ? 'text-[#9aa0a6]' : 'text-[#70757a]',
    hover: isDark ? 'hover:bg-[#3c3c3c]' : 'hover:bg-[#f1f3f4]',
    otherMonthBg: isDark ? 'bg-[#252525]' : 'bg-[#f8f9fa]',
    todayText: isDark ? 'text-[#8ab4f8]' : 'text-[#1a73e8]',
    moreLink: isDark ? 'text-[#8ab4f8]' : 'text-[#1a73e8]',
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header com dias da semana */}
      <div className={`grid grid-cols-7 border-b ${styles.border} ${styles.headerBg} sticky top-0 z-10`}>
        {weekDays.map((day, index) => (
          <div
            key={index}
            className={`h-[20px] flex items-center justify-center text-[11px] font-medium ${styles.textSecondary} border-r ${styles.border} last:border-r-0`}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Grid de dias */}
      <div className="flex-1 flex flex-col">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="flex-1 grid grid-cols-7 min-h-[100px]">
            {week.map((day, dayIndex) => {
              const isCurrentMonth = isSameMonth(day, currentDate);
              const isTodayDate = isToday(day);
              const dateKey = format(day, 'yyyy-MM-dd');
              const dayEvents = eventsByDay[dateKey] || [];

              return (
                <div
                  key={dayIndex}
                  className={`
                    border-r border-b ${styles.border} last:border-r-0 p-1
                    ${!isCurrentMonth ? styles.otherMonthBg : styles.bg}
                    ${styles.hover} cursor-pointer transition-colors
                  `}
                  onClick={() => onDateClick(day)}
                >
                  <div className="flex justify-center mb-1">
                    <span
                      className={`
                        w-[24px] h-[24px] flex items-center justify-center rounded-full text-[12px]
                        ${isTodayDate ? 'bg-[#1a73e8] text-white' : ''}
                        ${!isCurrentMonth && !isTodayDate ? styles.textSecondary : styles.text}
                      `}
                    >
                      {format(day, 'd')}
                    </span>
                  </div>

                  {/* Eventos do dia */}
                  <div className="space-y-[2px]">
                    {dayEvents.slice(0, 3).map(event => (
                      <div
                        key={event.id}
                        className="bg-[#039be5] text-white text-[11px] px-2 py-[2px] rounded truncate cursor-pointer hover:bg-[#0288d1] transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventClick(event);
                        }}
                      >
                        {event.allDay ? event.title : `${format(parseISO(event.start), 'HH:mm')} ${event.title}`}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className={`text-[11px] ${styles.moreLink} font-medium px-2 cursor-pointer hover:underline`}>
                        +{dayEvents.length - 3} mais
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default CalendarMonthView;
