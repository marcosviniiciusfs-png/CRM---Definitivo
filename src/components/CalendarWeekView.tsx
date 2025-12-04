import { useMemo, useEffect, useState } from 'react';
import { format, startOfWeek, addDays, isSameDay, parseISO, differenceInMinutes, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarEvent } from './GoogleCalendarModal';

interface CalendarWeekViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onDateClick: (date: Date) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function CalendarWeekView({
  currentDate,
  events,
  onEventClick,
  onDateClick
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

  return (
    <div className="flex flex-col h-full">
      {/* Header com dias da semana */}
      <div className="flex border-b border-[#dadce0] bg-white sticky top-0 z-10">
        {/* Coluna de timezone */}
        <div className="w-[60px] flex-shrink-0 border-r border-[#dadce0]">
          <div className="h-[72px] flex items-end justify-center pb-2">
            <span className="text-[10px] text-[#70757a]">GMT-03</span>
          </div>
        </div>

        {/* Dias da semana */}
        {days.map((day, index) => {
          const isTodayDate = isToday(day);
          return (
            <div
              key={index}
              className="flex-1 border-r border-[#dadce0] last:border-r-0"
            >
              <div className="h-[72px] flex flex-col items-center justify-center">
                <span className={`text-[11px] font-medium ${isTodayDate ? 'text-[#1a73e8]' : 'text-[#70757a]'}`}>
                  {weekDays[index]}
                </span>
                <div
                  className={`
                    w-[46px] h-[46px] flex items-center justify-center rounded-full text-[26px]
                    ${isTodayDate ? 'bg-[#1a73e8] text-white' : 'text-[#3c4043] hover:bg-[#f1f3f4]'}
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
              className="h-[48px] flex items-start justify-end pr-2 border-r border-[#dadce0]"
            >
              {hour > 0 && (
                <span className="text-[10px] text-[#70757a] -mt-[6px]">
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
              className="flex-1 border-r border-[#dadce0] last:border-r-0 relative"
            >
              {/* Grid de horas */}
              {HOURS.map(hour => (
                <div
                  key={hour}
                  className="h-[48px] border-b border-[#dadce0] hover:bg-[#f1f3f4] cursor-pointer transition-colors"
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
