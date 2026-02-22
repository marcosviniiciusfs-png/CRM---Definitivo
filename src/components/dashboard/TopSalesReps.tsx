import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { toast } from "sonner";

interface SalesRep {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  won_leads: number;
  total_revenue: number;
  target: number;
}

interface TopSalesRepsProps {
  reps: SalesRep[];
  isLoading?: boolean;
}

export function TopSalesReps({ reps, isLoading }: TopSalesRepsProps) {
  const { organizationId, permissions } = useOrganization();
  const isAdmin = !permissions.loading && (permissions.role === 'owner' || permissions.role === 'admin');
  const [editingRep, setEditingRep] = useState<SalesRep | null>(null);
  const [targetValue, setTargetValue] = useState("");
  const [saving, setSaving] = useState(false);

  const getInitials = (name: string | null) => {
    if (!name) return "??";
    return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  };

  const getPercentageColor = (percentage: number) => {
    if (percentage >= 100) return "text-emerald-600 dark:text-emerald-400";
    if (percentage >= 80) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 100) return "bg-emerald-500";
    if (percentage >= 80) return "bg-amber-500";
    return "bg-red-500";
  };

  const handleEditGoal = (rep: SalesRep) => {
    setEditingRep(rep);
    setTargetValue(rep.target.toString());
  };

  const handleSaveGoal = async () => {
    if (!editingRep || !organizationId) return;
    setSaving(true);
    try {
      const value = parseFloat(targetValue);
      if (isNaN(value) || value <= 0) {
        toast.error("Insira um valor válido");
        return;
      }

      // Check if goal exists
      const { data: existing } = await supabase
        .from("goals")
        .select("id")
        .eq("user_id", editingRep.user_id)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (existing) {
        await supabase.from("goals").update({ target_value: value }).eq("id", existing.id);
      } else {
        await supabase.from("goals").insert({
          user_id: editingRep.user_id,
          organization_id: organizationId,
          target_value: value,
        });
      }

      toast.success("Meta atualizada com sucesso!");
      setEditingRep(null);
    } catch (error: any) {
      toast.error("Erro ao salvar meta");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Top Vendedores</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="h-10 w-10 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-24 bg-muted rounded" />
                <div className="h-2 w-full bg-muted rounded" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Top Vendedores</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {reps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum dado disponível</p>
          ) : (
            reps.slice(0, 5).map((rep, index) => {
              const percentage = rep.target > 0 ? Math.round((rep.total_revenue / rep.target) * 100) : 0;
              return (
                <div key={rep.user_id} className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-5 text-xs font-bold text-muted-foreground">
                    {index + 1}
                  </div>
                  <Avatar className="h-9 w-9 border-2 border-background shadow-sm">
                    <AvatarImage src={rep.avatar_url || undefined} />
                    <AvatarFallback className="text-xs bg-muted text-muted-foreground">
                      {getInitials(rep.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium truncate">{rep.full_name || "Sem nome"}</span>
                      <div className="flex items-center gap-1">
                        <span className={cn("text-sm font-bold", getPercentageColor(percentage))}>
                          {percentage}%
                        </span>
                        {isAdmin && (
                          <button
                            onClick={() => handleEditGoal(rep)}
                            className="p-0.5 rounded hover:bg-muted transition-colors"
                            title="Definir meta"
                          >
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={cn("h-full rounded-full transition-all", getProgressColor(percentage))}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingRep} onOpenChange={(open) => !open && setEditingRep(null)}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Definir Meta - {editingRep?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Meta de Faturamento (R$)</Label>
              <Input
                type="number"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                placeholder="Ex: 50000"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRep(null)}>Cancelar</Button>
            <Button onClick={handleSaveGoal} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
