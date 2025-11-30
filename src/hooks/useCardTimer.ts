import { useState, useEffect } from "react";

interface UseCardTimerProps {
  timerStartedAt?: string;
  estimatedTime?: number;
  isActive: boolean;
}

export const useCardTimer = ({ timerStartedAt, estimatedTime, isActive }: UseCardTimerProps) => {
  const [elapsedMinutes, setElapsedMinutes] = useState(0);

  useEffect(() => {
    if (!isActive || !timerStartedAt) return;

    const calculateElapsed = () => {
      const now = new Date();
      const started = new Date(timerStartedAt);
      const diffMs = now.getTime() - started.getTime();
      const diffMinutes = Math.floor(diffMs / 60000);
      setElapsedMinutes(diffMinutes);
    };

    calculateElapsed();
    const interval = setInterval(calculateElapsed, 60000); // Atualiza a cada minuto

    return () => clearInterval(interval);
  }, [timerStartedAt, isActive]);

  const formatTimerDisplay = () => {
    if (!estimatedTime) {
      // Sem tempo estimado, apenas mostra tempo decorrido
      const hours = Math.floor(elapsedMinutes / 60);
      const mins = elapsedMinutes % 60;
      if (hours > 0) {
        return `${hours}h${mins > 0 ? ` ${mins}m` : ""}`;
      }
      return `${mins}m`;
    }

    // Com tempo estimado, mostra restante ou excedido
    const remaining = estimatedTime - elapsedMinutes;
    
    if (remaining > 0) {
      const hours = Math.floor(remaining / 60);
      const mins = remaining % 60;
      if (hours > 0) {
        return `${hours}h${mins > 0 ? ` ${mins}m` : ""} restante`;
      }
      return `${mins}m restante`;
    } else {
      const exceeded = Math.abs(remaining);
      const hours = Math.floor(exceeded / 60);
      const mins = exceeded % 60;
      if (hours > 0) {
        return `+${hours}h${mins > 0 ? ` ${mins}m` : ""}`;
      }
      return `+${mins}m`;
    }
  };

  const isOvertime = estimatedTime ? elapsedMinutes > estimatedTime : false;

  return {
    elapsedMinutes,
    formatTimerDisplay,
    isOvertime,
  };
};
