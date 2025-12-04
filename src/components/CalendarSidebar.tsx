import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CalendarSidebarProps {
  currentDate: Date;
  onDateSelect: (date: Date) => void;
  onCreateEvent: () => void;
}

const CalendarSidebar: React.FC<CalendarSidebarProps> = ({
  currentDate,
  onDateSelect,
  onCreateEvent
}) => {
  const [miniCalendarDate, setMiniCalendarDate] = useState(new Date());
  const today = new Date();

  const monthStart = startOfMonth(miniCalendarDate);
  const monthEnd = endOfMonth(miniCalendarDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const weekDays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  return (
    <div className="w-[256px] border-r border-[#dadce0] bg-white flex flex-col">
      {/* Botão Criar */}
      <div className="p-4">
        <button
          onClick={onCreateEvent}
          className="flex items-center gap-3 px-6 py-3 rounded-full shadow-md hover:shadow-lg transition-shadow bg-white border border-[#dadce0] text-[#3c4043] font-medium"
        >
          <Plus className="h-6 w-6 text-[#1a73e8]" strokeWidth={2.5} />
          <span className="text-sm">Criar</span>
        </button>
      </div>

      {/* Mini Calendário */}
      <div className="px-4 pb-4">
        {/* Header do mini calendário */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-[#3c4043] capitalize">
            {format(miniCalendarDate, 'MMMM yyyy', { locale: ptBR })}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMiniCalendarDate(subMonths(miniCalendarDate, 1))}
              className="p-1 rounded-full hover:bg-[#f1f3f4] transition-colors"
            >
              <ChevronLeft className="h-4 w-4 text-[#5f6368]" />
            </button>
            <button
              onClick={() => setMiniCalendarDate(addMonths(miniCalendarDate, 1))}
              className="p-1 rounded-full hover:bg-[#f1f3f4] transition-colors"
            >
              <ChevronRight className="h-4 w-4 text-[#5f6368]" />
            </button>
          </div>
        </div>

        {/* Dias da semana */}
        <div className="grid grid-cols-7 mb-1">
          {weekDays.map((day, index) => (
            <div
              key={index}
              className="h-7 flex items-center justify-center text-[10px] font-medium text-[#70757a]"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Grid de dias */}
        <div className="grid grid-cols-7">
          {days.map((day, index) => {
            const isCurrentMonth = isSameMonth(day, miniCalendarDate);
            const isToday = isSameDay(day, today);
            const isSelected = isSameDay(day, currentDate);

            return (
              <button
                key={index}
                onClick={() => onDateSelect(day)}
                className={`
                  h-7 w-7 flex items-center justify-center text-xs rounded-full
                  transition-colors
                  ${!isCurrentMonth ? 'text-[#70757a]' : 'text-[#3c4043]'}
                  ${isToday && !isSelected ? 'bg-[#1a73e8] text-white' : ''}
                  ${isSelected && !isToday ? 'bg-[#e8f0fe] text-[#1a73e8]' : ''}
                  ${isSelected && isToday ? 'bg-[#1a73e8] text-white' : ''}
                  ${!isToday && !isSelected ? 'hover:bg-[#f1f3f4]' : ''}
                `}
              >
                {format(day, 'd')}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CalendarSidebar;
