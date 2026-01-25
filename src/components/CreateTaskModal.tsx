import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClipboardList, User, Search, Calendar, Clock, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MentionInput } from "./MentionInput";
import { MultiSelectUsers, UserOption } from "./MultiSelectUsers";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Lead {
  id: string;
  nome_lead: string;
  telefone_lead: string;
  email?: string;
}

interface CreateTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columnId: string;
  onTaskCreated: (task: {
    content: string;
    description?: string;
    due_date?: string;
    estimated_time?: number;
    lead_id?: string;
    lead?: Lead;
    assignees?: string[];
  }) => void;
}

type TaskType = "normal" | "lead";

export const CreateTaskModal = ({
  open,
  onOpenChange,
  columnId,
  onTaskCreated,
}: CreateTaskModalProps) => {
  const [taskType, setTaskType] = useState<TaskType>("normal");
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [estimatedTime, setEstimatedTime] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadSearchOpen, setLeadSearchOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [orgMembers, setOrgMembers] = useState<UserOption[]>([]);
  useEffect(() => {
    if (open) {
      loadOrgMembers();
      if (taskType === "lead") {
        loadLeads();
      }
    }
  }, [open, taskType]);

  const loadOrgMembers = async () => {
    const { data: orgMember } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", (await supabase.auth.getUser()).data.user?.id)
      .single();

    if (orgMember) {
      const { data: members } = await supabase.rpc('get_organization_members_masked');
      
      if (members) {
        const userIds = members.filter((m: any) => m.user_id).map((m: any) => m.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, avatar_url")
          .in("user_id", userIds);

        const memberOptions: UserOption[] = members
          .filter((m: any) => m.user_id)
          .map((m: any) => {
            const profile = profiles?.find(p => p.user_id === m.user_id);
            return {
              user_id: m.user_id,
              full_name: profile?.full_name || null,
              avatar_url: profile?.avatar_url || null,
            };
          });

        setOrgMembers(memberOptions);
      }
    }
  };

  useEffect(() => {
    if (!open) {
      // Reset form when closing
      setTaskType("normal");
      setContent("");
      setDescription("");
      setDueDate("");
      setEstimatedTime("");
      setSelectedLead(null);
      setAssignees([]);
    }
  }, [open]);

  const loadLeads = async () => {
    const { data: orgMember } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", (await supabase.auth.getUser()).data.user?.id)
      .single();

    if (orgMember) {
      const { data } = await supabase
        .from("leads")
        .select("id, nome_lead, telefone_lead, email")
        .eq("organization_id", orgMember.organization_id)
        .order("nome_lead");

      setLeads(data || []);
    }
  };

  const handleCreate = async () => {
    if (!content.trim()) return;
    if (taskType === "lead" && !selectedLead) return;

    setLoading(true);

    onTaskCreated({
      content: content.trim(),
      description: description.trim() || undefined,
      due_date: dueDate || undefined,
      estimated_time: estimatedTime ? parseInt(estimatedTime) : undefined,
      lead_id: selectedLead?.id,
      lead: selectedLead || undefined,
      assignees: assignees.length > 0 ? assignees : undefined,
    });

    setLoading(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Tarefa</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tipo de Tarefa */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                setTaskType("normal");
                setSelectedLead(null);
              }}
              className={cn(
                "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all",
                taskType === "normal"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/50"
              )}
            >
              <ClipboardList className={cn(
                "h-6 w-6",
                taskType === "normal" ? "text-primary" : "text-muted-foreground"
              )} />
              <span className={cn(
                "text-sm font-medium",
                taskType === "normal" ? "text-primary" : "text-muted-foreground"
              )}>
                Tarefa Normal
              </span>
            </button>

            <button
              onClick={() => setTaskType("lead")}
              className={cn(
                "flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all",
                taskType === "lead"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/50"
              )}
            >
              <User className={cn(
                "h-6 w-6",
                taskType === "lead" ? "text-primary" : "text-muted-foreground"
              )} />
              <span className={cn(
                "text-sm font-medium",
                taskType === "lead" ? "text-primary" : "text-muted-foreground"
              )}>
                Tarefa de Lead
              </span>
            </button>
          </div>

          {/* Seletor de Lead */}
          {taskType === "lead" && (
            <div className="space-y-2">
              <Label>Selecionar Lead</Label>
              <Popover open={leadSearchOpen} onOpenChange={setLeadSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between"
                  >
                    {selectedLead ? (
                      <span className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        {selectedLead.nome_lead}
                      </span>
                    ) : (
                      <span className="text-muted-foreground flex items-center gap-2">
                        <Search className="h-4 w-4" />
                        Buscar lead...
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar lead por nome..." />
                    <CommandList>
                      <CommandEmpty>Nenhum lead encontrado.</CommandEmpty>
                      <CommandGroup>
                        {leads.map((lead) => (
                          <CommandItem
                            key={lead.id}
                            value={lead.nome_lead}
                            onSelect={() => {
                              setSelectedLead(lead);
                              setLeadSearchOpen(false);
                            }}
                          >
                            <User className="h-4 w-4 mr-2" />
                            <div className="flex flex-col">
                              <span>{lead.nome_lead}</span>
                              <span className="text-xs text-muted-foreground">
                                {lead.telefone_lead}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Título */}
          <div className="space-y-2">
            <Label>Título da Tarefa</Label>
            <Input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                taskType === "lead" && selectedLead
                  ? `Tarefa para ${selectedLead.nome_lead}`
                  : "Ex: Revisar proposta"
              }
            />
          </div>

          {/* Descrição */}
          <div className="space-y-2">
            <Label>Descrição (opcional)</Label>
            <MentionInput
              value={description}
              onChange={setDescription}
              placeholder="Adicione detalhes... Use @ para mencionar usuários"
            />
          </div>

          {/* Responsáveis */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              Responsáveis (opcional)
            </Label>
            <MultiSelectUsers
              value={assignees}
              onChange={setAssignees}
              users={orgMembers}
              placeholder="Atribuir responsáveis..."
            />
          </div>

          {/* Data e Tempo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Prazo
              </Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Tempo (min)
              </Label>
              <Input
                type="number"
                value={estimatedTime}
                onChange={(e) => setEstimatedTime(e.target.value)}
                placeholder="60"
                min="0"
              />
            </div>
          </div>

          {/* Botões */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                loading ||
                !content.trim() ||
                (taskType === "lead" && !selectedLead)
              }
            >
              Criar Tarefa
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};