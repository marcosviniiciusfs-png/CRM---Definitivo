import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { StatusReuniao } from '@/types/chat';

interface ToggleNoShowInput {
  leadId: string;
  currentStatus: StatusReuniao | null;
}

export function useToggleNoShow() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ leadId, currentStatus }: ToggleNoShowInput) => {
      const nextStatus: StatusReuniao | null =
        currentStatus === 'no_show' ? null : 'no_show';

      const { error } = await supabase
        .from('leads')
        .update({ status_reuniao: nextStatus })
        .eq('id', leadId);

      if (error) throw error;
      return { leadId, nextStatus };
    },
    onSuccess: ({ nextStatus }) => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-leads'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-realized'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-no-show'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-today-realized'] });
      toast({
        title: nextStatus === 'no_show' ? 'Lead marcado como no-show' : 'No-show desfeito',
      });
    },
    onError: (err: Error) => {
      toast({
        title: 'Erro ao atualizar status',
        description: err?.message ?? 'Tente novamente.',
        variant: 'destructive',
      });
    },
  });
}
