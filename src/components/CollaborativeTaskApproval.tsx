import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Check, Clock, Users, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/image-utils";
import { motion, AnimatePresence } from "framer-motion";

interface CollaborativeTaskApprovalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cardId: string;
  cardTitle: string;
}

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

export const CollaborativeTaskApproval = ({
  open,
  onOpenChange,
  cardId,
  cardTitle,
}: CollaborativeTaskApprovalProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmChecked, setConfirmChecked] = useState(false);

  const { data: assignees = [], isLoading } = useQuery({
    queryKey: ["card-assignees-approval", cardId],
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
    enabled: open,
  });

  const currentUserAssignee = assignees.find((a) => a.user_id === user?.id);
  const completedCount = assignees.filter((a) => a.is_completed).length;
  const progressPercent = assignees.length > 0 ? (completedCount / assignees.length) * 100 : 0;
  const allCompleted = completedCount === assignees.length;

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!currentUserAssignee) throw new Error("Você não está atribuído a esta tarefa");

      const { error } = await supabase
        .from("kanban_card_assignees")
        .update({
          is_completed: true,
          completed_at: new Date().toISOString(),
        })
        .eq("id", currentUserAssignee.id);

      if (error) throw error;

      // Notificar outros membros
      const otherAssignees = assignees.filter((a) => a.user_id !== user?.id);
      if (otherAssignees.length > 0) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", user?.id)
          .single();

        for (const assignee of otherAssignees) {
          await supabase.from("notifications").insert({
            user_id: assignee.user_id,
            type: "task_approval",
            title: "Parte da tarefa concluída",
            message: `${profile?.full_name || "Um colaborador"} concluiu sua parte em "${cardTitle}"`,
            card_id: cardId,
          });
        }
      }

      // Se todos concluíram, notificar que tarefa está pronta
      if (completedCount + 1 === assignees.length) {
        for (const assignee of assignees) {
          await supabase.from("notifications").insert({
            user_id: assignee.user_id,
            type: "task_ready",
            title: "Tarefa pronta para avançar",
            message: `A tarefa colaborativa "${cardTitle}" está pronta para ser movida!`,
            card_id: cardId,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["card-assignees-approval", cardId] });
      queryClient.invalidateQueries({ queryKey: ["card-assignees", cardId] });
      toast({
        title: "Concluído!",
        description: "Sua parte na tarefa foi marcada como concluída.",
      });
      setConfirmChecked(false);
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: "Não foi possível confirmar a conclusão.",
        variant: "destructive",
      });
      console.error(error);
    },
  });

  const handleConfirm = () => {
    if (!confirmChecked) return;
    confirmMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Tarefa Colaborativa
          </DialogTitle>
          <DialogDescription className="text-base font-medium text-foreground">
            {cardTitle}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Status dos Colaboradores</span>
              <Badge variant={allCompleted ? "default" : "secondary"} className={cn(allCompleted && "bg-green-500")}>
                {completedCount}/{assignees.length} concluído
              </Badge>
            </div>

            <Progress value={progressPercent} className="h-2" />

            <div className="space-y-2">
              <AnimatePresence>
                {assignees.map((assignee, index) => (
                  <motion.div
                    key={assignee.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border transition-colors",
                      assignee.is_completed
                        ? "bg-green-500/5 border-green-500/30"
                        : "bg-muted/30 border-border"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={assignee.profile?.avatar_url || undefined} />
                          <AvatarFallback className="text-xs bg-muted">
                            {getInitials(assignee.profile?.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        {assignee.is_completed && (
                          <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-green-500 flex items-center justify-center ring-2 ring-background">
                            <Check className="h-2.5 w-2.5 text-white" />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {assignee.profile?.full_name || "Sem nome"}
                          {assignee.user_id === user?.id && (
                            <span className="text-primary ml-1">(você)</span>
                          )}
                        </p>
                        {assignee.is_completed && assignee.completed_at && (
                          <p className="text-xs text-muted-foreground">
                            Concluído em{" "}
                            {format(new Date(assignee.completed_at), "dd/MM 'às' HH:mm", {
                              locale: ptBR,
                            })}
                          </p>
                        )}
                      </div>
                    </div>

                    {assignee.is_completed ? (
                      <Badge variant="outline" className="border-green-500 text-green-500">
                        <Check className="h-3 w-3 mr-1" />
                        Concluído
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        <Clock className="h-3 w-3 mr-1" />
                        Aguardando
                      </Badge>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Confirmation Section */}
          {currentUserAssignee && !currentUserAssignee.is_completed && (
            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-start gap-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                <AlertCircle className="h-5 w-5 text-primary mt-0.5" />
                <p className="text-sm text-muted-foreground">
                  Você ainda não confirmou a conclusão da sua parte nesta tarefa colaborativa.
                </p>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="confirm"
                  checked={confirmChecked}
                  onCheckedChange={(checked) => setConfirmChecked(checked === true)}
                />
                <label
                  htmlFor="confirm"
                  className="text-sm font-medium cursor-pointer select-none"
                >
                  Confirmo que concluí minha parte desta tarefa
                </label>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={!confirmChecked || confirmMutation.isPending}
                  className="bg-green-500 hover:bg-green-600"
                >
                  <Check className="h-4 w-4 mr-2" />
                  Confirmar Conclusão
                </Button>
              </div>
            </div>
          )}

          {/* Already completed message */}
          {currentUserAssignee?.is_completed && (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded-lg text-green-600 dark:text-green-400">
              <Check className="h-5 w-5" />
              <span className="text-sm font-medium">Você já confirmou sua parte nesta tarefa!</span>
            </div>
          )}

          {/* Not assigned message */}
          {!currentUserAssignee && !isLoading && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg text-muted-foreground">
              <AlertCircle className="h-5 w-5" />
              <span className="text-sm">Você não está atribuído a esta tarefa.</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
