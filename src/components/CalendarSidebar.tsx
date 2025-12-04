import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface CalendarSidebarProps {
  currentDate: Date;
  onDateSelect: (date: Date) => void;
  onCreateEvent: () => void;
  isDark?: boolean;
}

const CalendarSidebar: React.FC<CalendarSidebarProps> = ({
  currentDate,
  onDateSelect,
  onCreateEvent,
  isDark = false
}) => {
  const [miniCalendarDate, setMiniCalendarDate] = useState(new Date());
  const today = new Date();

  const monthStart = startOfMonth(miniCalendarDate);
  const monthEnd = endOfMonth(miniCalendarDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const weekDays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  // Dynamic styles based on theme
  const styles = {
    bg: isDark ? 'bg-[#1e1e1e]' : 'bg-white',
    border: isDark ? 'border-[#3c3c3c]' : 'border-[#dadce0]',
    text: isDark ? 'text-[#e8eaed]' : 'text-[#3c4043]',
    textSecondary: isDark ? 'text-[#9aa0a6]' : 'text-[#70757a]',
    hover: isDark ? 'hover:bg-[#3c3c3c]' : 'hover:bg-[#f1f3f4]',
    buttonBg: isDark ? 'bg-[#2d2d2d]' : 'bg-white',
    selectedBg: isDark ? 'bg-[#394457]' : 'bg-[#e8f0fe]',
    selectedText: isDark ? 'text-[#8ab4f8]' : 'text-[#1a73e8]',
  };

  return (
    <div className={`w-[256px] border-r ${styles.border} ${styles.bg} flex flex-col`}>
      {/* Botão Criar */}
      <div className="p-4">
        <button
          onClick={onCreateEvent}
          className={`flex items-center gap-3 px-6 py-3 rounded-full shadow-md hover:shadow-lg transition-shadow ${styles.buttonBg} border ${styles.border} ${styles.text} font-medium`}
        >
          <Plus className="h-6 w-6 text-[#1a73e8]" strokeWidth={2.5} />
          <span className="text-sm">Criar</span>
        </button>
      </div>

      {/* Mini Calendário */}
      <div className="px-4 pb-4">
        {/* Header do mini calendário */}
        <div className="flex items-center justify-between mb-2">
          <span className={`text-sm font-medium ${styles.text} capitalize`}>
            {format(miniCalendarDate, 'MMMM yyyy', { locale: ptBR })}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMiniCalendarDate(subMonths(miniCalendarDate, 1))}
              className={`p-1 rounded-full ${styles.hover} transition-colors`}
            >
              <ChevronLeft className={`h-4 w-4 ${styles.textSecondary}`} />
            </button>
            <button
              onClick={() => setMiniCalendarDate(addMonths(miniCalendarDate, 1))}
              className={`p-1 rounded-full ${styles.hover} transition-colors`}
            >
              <ChevronRight className={`h-4 w-4 ${styles.textSecondary}`} />
            </button>
          </div>
        </div>

        {/* Dias da semana */}
        <div className="grid grid-cols-7 mb-1">
          {weekDays.map((day, index) => (
            <div
              key={index}
              className={`h-7 flex items-center justify-center text-[10px] font-medium ${styles.textSecondary}`}
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
                  ${!isCurrentMonth ? styles.textSecondary : styles.text}
                  ${isToday && !isSelected ? 'bg-[#1a73e8] text-white' : ''}
                  ${isSelected && !isToday ? `${styles.selectedBg} ${styles.selectedText}` : ''}
                  ${isSelected && isToday ? 'bg-[#1a73e8] text-white' : ''}
                  ${!isToday && !isSelected ? styles.hover : ''}
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
