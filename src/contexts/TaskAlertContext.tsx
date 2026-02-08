import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { useLocation } from 'react-router-dom';

interface TaskAlertContextType {
  hasPendingTasks: boolean;
  audioPermissionGranted: boolean;
  needsAudioPermission: boolean;
  pendingTaskCount: number;
  markTasksAsViewed: () => Promise<void>;
  requestAudioPermission: () => Promise<void>;
  isOnTasksPage: boolean;
}

const TaskAlertContext = createContext<TaskAlertContextType | undefined>(undefined);

const AUDIO_PERMISSION_KEY = 'task-alert-audio-permission';

export function TaskAlertProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const location = useLocation();
  
  const [hasPendingTasks, setHasPendingTasks] = useState(false);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [audioPermissionGranted, setAudioPermissionGranted] = useState(() => {
    return localStorage.getItem(AUDIO_PERMISSION_KEY) === 'true';
  });
  const [needsAudioPermission, setNeedsAudioPermission] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const viewTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const isOnTasksPage = location.pathname === '/tasks';

  // Verificar se há tarefas pendentes não visualizadas
  const checkPendingTasks = useCallback(async () => {
    if (!user?.id) {
      setHasPendingTasks(false);
      setPendingTaskCount(0);
      return;
    }

    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('type', 'task_assigned')
        .not('card_id', 'is', null)
        .is('viewed_at', null);

      if (error) {
        console.error('Erro ao verificar tarefas pendentes:', error);
        return;
      }

      const hasPending = (count || 0) > 0;
      setHasPendingTasks(hasPending);
      setPendingTaskCount(count || 0);
      
      // Se há tarefas pendentes e ainda não verificou permissão de áudio
      if (hasPending && !audioPermissionGranted) {
        setNeedsAudioPermission(true);
      }
    } catch (error) {
      console.error('Erro ao verificar tarefas pendentes:', error);
    }
  }, [user?.id, audioPermissionGranted]);

  // Marcar tarefas como visualizadas
  const markTasksAsViewed = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ viewed_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('type', 'task_assigned')
        .not('card_id', 'is', null)
        .is('viewed_at', null);

      if (error) {
        console.error('Erro ao marcar tarefas como visualizadas:', error);
        return;
      }

      setHasPendingTasks(false);
      setPendingTaskCount(0);
    } catch (error) {
      console.error('Erro ao marcar tarefas como visualizadas:', error);
    }
  }, [user?.id]);

  // Solicitar permissão de áudio (tocar um som para ativar)
  const requestAudioPermission = useCallback(async () => {
    try {
      const audio = new Audio('/task-notification.mp3');
      audio.volume = 0.5;
      await audio.play();
      
      // Permissão concedida
      setAudioPermissionGranted(true);
      setNeedsAudioPermission(false);
      localStorage.setItem(AUDIO_PERMISSION_KEY, 'true');
    } catch (error) {
      console.error('Erro ao solicitar permissão de áudio:', error);
      setNeedsAudioPermission(true);
    }
  }, []);

  // Verificar permissão de áudio ao carregar
  useEffect(() => {
    const checkAudioPermission = async () => {
      // Se já temos permissão salva, verificar se ainda funciona
      if (audioPermissionGranted) {
        try {
          const audio = new Audio('/task-notification.mp3');
          audio.volume = 0.01;
          await audio.play();
          audio.pause();
          audio.currentTime = 0;
        } catch {
          // Permissão expirou (nova sessão do browser)
          setAudioPermissionGranted(false);
          localStorage.removeItem(AUDIO_PERMISSION_KEY);
        }
      }
    };

    checkAudioPermission();
  }, [audioPermissionGranted]);

  // Buscar tarefas pendentes ao iniciar e configurar realtime
  useEffect(() => {
    if (!user?.id) return;

    checkPendingTasks();

    // Subscription para novas notificações
    const channel = supabase
      .channel('task-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new && (payload.new as any).type === 'task_assigned') {
            checkPendingTasks();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, checkPendingTasks]);

  // Lógica de som a cada 5 segundos
  useEffect(() => {
    // Limpar interval anterior
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Só tocar som se:
    // - Há tarefas pendentes
    // - Tem permissão de áudio
    // - NÃO está na página de tarefas
    if (!hasPendingTasks || !audioPermissionGranted || isOnTasksPage) {
      return;
    }

    // Criar instância de áudio
    if (!audioRef.current) {
      audioRef.current = new Audio('/task-notification.mp3');
      audioRef.current.volume = 0.7;
    }

    // Tocar imediatamente
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {
      // Se falhar, remover permissão
      setAudioPermissionGranted(false);
      localStorage.removeItem(AUDIO_PERMISSION_KEY);
      setNeedsAudioPermission(true);
    });

    // Tocar a cada 5 segundos
    intervalRef.current = setInterval(() => {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
    }, 5000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [hasPendingTasks, audioPermissionGranted, isOnTasksPage]);

  // Timer de 5 segundos na página de tarefas
  useEffect(() => {
    // Limpar timer anterior
    if (viewTimerRef.current) {
      clearTimeout(viewTimerRef.current);
      viewTimerRef.current = null;
    }

    // Se está na página de tarefas e há tarefas pendentes
    if (isOnTasksPage && hasPendingTasks) {
      viewTimerRef.current = setTimeout(() => {
        markTasksAsViewed();
      }, 5000);
    }

    return () => {
      if (viewTimerRef.current) {
        clearTimeout(viewTimerRef.current);
        viewTimerRef.current = null;
      }
    };
  }, [isOnTasksPage, hasPendingTasks, markTasksAsViewed]);

  const value: TaskAlertContextType = {
    hasPendingTasks,
    audioPermissionGranted,
    needsAudioPermission,
    pendingTaskCount,
    markTasksAsViewed,
    requestAudioPermission,
    isOnTasksPage,
  };

  return (
    <TaskAlertContext.Provider value={value}>
      {children}
    </TaskAlertContext.Provider>
  );
}

// Hook que retorna valores padrão seguros quando fora do provider
export function useTaskAlert(): TaskAlertContextType {
  const context = useContext(TaskAlertContext);
  
  // Retornar valores padrão seguros se o contexto não estiver disponível
  // Isso evita erros durante a renderização inicial ou em componentes fora do provider
  if (context === undefined) {
    return {
      hasPendingTasks: false,
      audioPermissionGranted: false,
      needsAudioPermission: false,
      pendingTaskCount: 0,
      markTasksAsViewed: async () => {},
      requestAudioPermission: async () => {},
      isOnTasksPage: false,
    };
  }
  
  return context;
}
