import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Target, Plus, Edit2, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface TeamGoal {
  id: string;
  team_id: string;
  goal_type: string;
  target_value: number;
  current_value: number;
  period_type: string;
  start_date: string;
  end_date: string;
}

interface TeamGoalsCardProps {
  teamId: string;
  teamName: string;
  teamColor: string;
  organizationId: string;
}

const GOAL_TYPES = [
  { value: "sales_count", label: "Quantidade de Vendas" },
  { value: "revenue", label: "Receita (R$)" },
  { value: "leads_converted", label: "Leads Convertidos" },
];

const PERIOD_TYPES = [
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensal" },
  { value: "quarterly", label: "Trimestral" },
];

export function TeamGoalsCard({ teamId, teamName, teamColor, organizationId }: TeamGoalsCardProps) {
  const queryClient = useQueryClient();
  const [goals, setGoals] = useState<TeamGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<TeamGoal | null>(null);
  const [formData, setFormData] = useState({
    goal_type: "sales_count",
    target_value: 0,
    period_type: "monthly",
  });

  useEffect(() => {
    loadGoals();
  }, [teamId]);

  const loadGoals = async () => {
    try {
      const { data, error } = await supabase
        .from('team_goals')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setGoals(data || []);
    } catch (error) {
      console.error('Error loading goals:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDateRange = (periodType: string) => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (periodType) {
      case 'weekly':
        const dayOfWeek = now.getDay();
        startDate = new Date(now);
        startDate.setDate(now.getDate() - dayOfWeek);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        break;
      case 'quarterly':
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        endDate = new Date(now.getFullYear(), (quarter + 1) * 3, 0);
        break;
      case 'monthly':
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
    }

    return {
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
    };
  };

  const handleSave = async () => {
    if (formData.target_value <= 0) {
      toast.error("Meta deve ser maior que zero");
      return;
    }

    try {
      const dateRange = getDateRange(formData.period_type);

      if (editingGoal) {
        const { error } = await supabase
          .from('team_goals')
          .update({
            goal_type: formData.goal_type,
            target_value: formData.target_value,
            period_type: formData.period_type,
            ...dateRange,
          })
          .eq('id', editingGoal.id);

        if (error) throw error;
        toast.success("Meta atualizada!");
      } else {
        const { error } = await supabase
          .from('team_goals')
          .insert({
            team_id: teamId,
            organization_id: organizationId,
            goal_type: formData.goal_type,
            target_value: formData.target_value,
            current_value: 0,
            period_type: formData.period_type,
            ...dateRange,
          });

        if (error) throw error;
        toast.success("Meta criada!");
      }

      loadGoals();
      setModalOpen(false);
      setEditingGoal(null);
      setFormData({ goal_type: "sales_count", target_value: 0, period_type: "monthly" });
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    }
  };

  const handleDelete = async (goalId: string) => {
    try {
      const { error } = await supabase
        .from('team_goals')
        .delete()
        .eq('id', goalId);

      if (error) throw error;
      toast.success("Meta excluída!");
      loadGoals();
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    }
  };

  const openEdit = (goal: TeamGoal) => {
    setEditingGoal(goal);
    setFormData({
      goal_type: goal.goal_type,
      target_value: goal.target_value,
      period_type: goal.period_type,
    });
    setModalOpen(true);
  };

  const getGoalTypeLabel = (type: string) => 
    GOAL_TYPES.find(t => t.value === type)?.label || type;

  const getPeriodLabel = (type: string) =>
    PERIOD_TYPES.find(t => t.value === type)?.label || type;

  const formatValue = (type: string, value: number) => {
    if (type === 'revenue') {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    }
    return value.toString();
  };

  if (loading) {
    return (
      <Card className="mt-4">
        <CardContent className="p-4">
          <div className="animate-pulse h-16 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="mt-4">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4" style={{ color: teamColor }} />
              Metas da Equipe
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditingGoal(null);
                setFormData({ goal_type: "sales_count", target_value: 0, period_type: "monthly" });
                setModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {goals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-2">
              Nenhuma meta definida
            </p>
          ) : (
            <div className="space-y-3">
              {goals.map((goal) => {
                const progress = goal.target_value > 0 
                  ? Math.min((goal.current_value / goal.target_value) * 100, 100) 
                  : 0;

                return (
                  <div key={goal.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{getGoalTypeLabel(goal.goal_type)}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(goal)}
                          className="p-1 hover:bg-muted rounded"
                        >
                          <Edit2 className="h-3 w-3 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => handleDelete(goal.id)}
                          className="p-1 hover:bg-muted rounded"
                        >
                          <Trash2 className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </div>
                    </div>
                    <Progress value={progress} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{formatValue(goal.goal_type, goal.current_value)} / {formatValue(goal.goal_type, goal.target_value)}</span>
                      <span>{getPeriodLabel(goal.period_type)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingGoal ? "Editar Meta" : "Nova Meta"}</DialogTitle>
            <DialogDescription>
              Configure a meta para {teamName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Tipo de Meta</Label>
              <Select
                value={formData.goal_type}
                onValueChange={(value) => setFormData({ ...formData, goal_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GOAL_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Valor da Meta</Label>
              <Input
                type="number"
                min="0"
                value={formData.target_value}
                onChange={(e) => setFormData({ ...formData, target_value: parseFloat(e.target.value) || 0 })}
                placeholder={formData.goal_type === 'revenue' ? "Ex: 50000" : "Ex: 100"}
              />
            </div>

            <div className="space-y-2">
              <Label>Período</Label>
              <Select
                value={formData.period_type}
                onValueChange={(value) => setFormData({ ...formData, period_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>
              {editingGoal ? "Salvar" : "Criar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
