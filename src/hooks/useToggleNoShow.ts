import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type StatusReuniao = 'realizada' | 'no_show' | null;

interface ToggleNoShowInput {
  leadId: string;
  currentStatus: StatusReuniao;
}

export function useToggleNoShow() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ leadId, currentStatus }: ToggleNoShowInput) => {
      const nextStatus: StatusReuniao =
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
    onError: (err: any) => {
      toast({
        title: 'Erro ao atualizar status',
        description: err?.message ?? 'Tente novamente.',
        variant: 'destructive',
      });
    },
  });
}
