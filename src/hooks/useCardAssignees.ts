import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface AssigneeWithProfile {
  id: string;
  user_id: string;
  is_completed: boolean;
  completed_at: string | null;
  profile: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

export const useCardAssignees = (cardId: string, enabled = true) => {
  return useQuery({
    queryKey: ["card-assignees", cardId],
    queryFn: async () => {
      const { data } = await supabase
        .from("kanban_card_assignees")
        .select(`
          id,
          user_id,
          is_completed,
          completed_at
        `)
        .eq("card_id", cardId);

      if (!data || data.length === 0) return [];

      const userIds = data.map((a) => a.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds);

      return data.map((assignee) => ({
        ...assignee,
        profile: profiles?.find((p) => p.user_id === assignee.user_id) || null,
      })) as AssigneeWithProfile[];
    },
    enabled,
    staleTime: 30000,
  });
};

export const checkAllAssigneesCompleted = async (cardId: string): Promise<{
  allCompleted: boolean;
  completedCount: number;
  totalCount: number;
}> => {
  const { data: assignees } = await supabase
    .from("kanban_card_assignees")
    .select("is_completed")
    .eq("card_id", cardId);

  if (!assignees || assignees.length === 0) {
    return { allCompleted: true, completedCount: 0, totalCount: 0 };
  }

  const completedCount = assignees.filter((a) => a.is_completed).length;
  return {
    allCompleted: completedCount === assignees.length,
    completedCount,
    totalCount: assignees.length,
  };
};
