import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Check, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/image-utils";
import { motion } from "framer-motion";

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

interface AssigneeAvatarGroupProps {
  cardId: string;
  isCollaborative?: boolean;
  showProgress?: boolean;
  size?: "sm" | "md";
  onAssigneeClick?: (assigneeId: string) => void;
}

export const AssigneeAvatarGroup = ({
  cardId,
  isCollaborative = false,
  showProgress = true,
  size = "sm",
  onAssigneeClick,
}: AssigneeAvatarGroupProps) => {
  const { data: assignees = [] } = useQuery({
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

      // Buscar profiles separadamente
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
    staleTime: 30000,
  });

  if (assignees.length === 0) return null;

  const completedCount = assignees.filter((a) => a.is_completed).length;
  const allCompleted = completedCount === assignees.length;

  const avatarSize = size === "sm" ? "h-6 w-6" : "h-8 w-8";
  const ringSize = size === "sm" ? "ring-2" : "ring-[3px]";
  const overlap = size === "sm" ? "-ml-2" : "-ml-3";
  const fontSize = size === "sm" ? "text-[8px]" : "text-[10px]";

  return (
    <div className="flex flex-col gap-1.5">
      {isCollaborative && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />
          <span>Colaborativa</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center">
            {assignees.map((assignee, index) => (
              <Tooltip key={assignee.id}>
                <TooltipTrigger asChild>
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className={cn(
                      "relative cursor-pointer",
                      index > 0 && overlap
                    )}
                    style={{ zIndex: assignees.length - index }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAssigneeClick?.(assignee.user_id);
                    }}
                  >
                    <Avatar
                      className={cn(
                        avatarSize,
                        ringSize,
                        "ring-background transition-all duration-200 hover:scale-110 hover:z-10",
                        isCollaborative &&
                          (assignee.is_completed
                            ? "ring-green-500"
                            : "ring-muted-foreground/40")
                      )}
                    >
                      <AvatarImage src={assignee.profile?.avatar_url || undefined} />
                      <AvatarFallback className={cn(fontSize, "bg-muted text-muted-foreground")}>
                        {getInitials(assignee.profile?.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    {isCollaborative && assignee.is_completed && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-green-500 flex items-center justify-center ring-2 ring-background"
                      >
                        <Check className="h-2 w-2 text-white" />
                      </motion.div>
                    )}
                  </motion.div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[200px]">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {assignee.profile?.full_name || "Sem nome"}
                    </span>
                    {isCollaborative && (
                      <Badge
                        variant={assignee.is_completed ? "default" : "outline"}
                        className={cn(
                          "text-[10px] px-1.5 py-0",
                          assignee.is_completed && "bg-green-500 hover:bg-green-600"
                        )}
                      >
                        {assignee.is_completed ? "Concluído" : "Pendente"}
                      </Badge>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>

        {isCollaborative && showProgress && assignees.length > 0 && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className={cn(
              "text-xs font-medium",
              allCompleted ? "text-green-500" : "text-muted-foreground"
            )}
          >
            {completedCount}/{assignees.length}
          </motion.div>
        )}
      </div>
    </div>
  );
};
