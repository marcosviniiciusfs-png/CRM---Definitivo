import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trophy, Loader2, Eye, Clock, PartyPopper } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

interface RankingCompetition {
  id: string;
  organization_id: string;
  title: string;
  is_active: boolean;
  reveal_at: string | null;
  revealed_at: string | null;
}

interface RankingCompetitionSettingsProps {
  organizationId: string;
  competition: RankingCompetition | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
}

export function RankingCompetitionSettings({
  organizationId,
  competition,
  isOpen,
  onOpenChange,
  isAdmin,
}: RankingCompetitionSettingsProps) {
  const queryClient = useQueryClient();
  const [isActive, setIsActive] = useState(false);
  const [title, setTitle] = useState("Competição de Ranking");
  const [revealAt, setRevealAt] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsActive(competition?.is_active ?? false);
      setTitle(competition?.title ?? "Competição de Ranking");
      if (competition?.reveal_at) {
        const d = new Date(competition.reveal_at);
        // Format to datetime-local input: YYYY-MM-DDTHH:mm
        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
        setRevealAt(local.toISOString().slice(0, 16));
      } else {
        setRevealAt("");
      }
    }
  }, [isOpen, competition]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const revealAtValue = revealAt ? new Date(revealAt).toISOString() : null;

      if (competition?.id) {
        // Update existing
        const { error } = await supabase
          .from('ranking_competitions')
          .update({
            title,
            is_active: isActive,
            reveal_at: revealAtValue,
            updated_at: new Date().toISOString(),
          })
          .eq('id', competition.id);

        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from('ranking_competitions')
          .insert({
            organization_id: organizationId,
            title,
            is_active: isActive,
            reveal_at: revealAtValue,
          });

        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ['ranking-competition', organizationId] });
      toast.success(isActive ? "Competição ativada!" : "Competição desativada");
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevealNow = async () => {
    if (!competition?.id) return;
    setIsRevealing(true);
    try {
      const { error } = await supabase
        .from('ranking_competitions')
        .update({
          revealed_at: new Date().toISOString(),
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', competition.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['ranking-competition', organizationId] });
      toast.success("Ranking revelado para todos!");
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    } finally {
      setIsRevealing(false);
    }
  };

  const isRevealed = !!competition?.revealed_at;
  const competitionActive = competition?.is_active === true;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Competição de Ranking
          </DialogTitle>
          <DialogDescription>
            Configure a competição e a data de revelação dos resultados.
            Membros só verão o próprio progresso até a revelação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Status indicator */}
          {competition && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
              isRevealed
                ? 'bg-green-500/10 text-green-600'
                : competitionActive
                  ? 'bg-yellow-500/10 text-yellow-600'
                  : 'bg-muted text-muted-foreground'
            }`}>
              {isRevealed ? (
                <>
                  <PartyPopper className="h-4 w-4" />
                  Competição revelada em {competition.revealed_at ? format(new Date(competition.revealed_at), "dd/MM/yyyy 'às' HH:mm") : ''}
                </>
              ) : competitionActive ? (
                <>
                  <Eye className="h-4 w-4" />
                  Competição ativa — membros veem apenas próprio progresso
                </>
              ) : (
                <>
                  <Clock className="h-4 w-4" />
                  Competição inativa
                </>
              )}
            </div>
          )}

          {/* Active toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Ativar competição</Label>
              <p className="text-xs text-muted-foreground">
                Membros verão apenas o próprio progresso
              </p>
            </div>
            <Switch
              checked={isActive}
              onCheckedChange={setIsActive}
              disabled={isRevealed}
            />
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="comp-title">Título da Competição</Label>
            <Input
              id="comp-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Competição Mensal"
            />
          </div>

          {/* Reveal date */}
          <div className="space-y-2">
            <Label htmlFor="comp-reveal">Data de Revelação</Label>
            <Input
              id="comp-reveal"
              type="datetime-local"
              value={revealAt}
              onChange={(e) => setRevealAt(e.target.value)}
              disabled={isRevealed}
            />
            <p className="text-xs text-muted-foreground">
              Quando esta data chegar, o ranking será revelado automaticamente para todos.
            </p>
          </div>

          {/* Reveal now button */}
          {competitionActive && !isRevealed && (
            <Button
              variant="outline"
              className="w-full gap-2 border-yellow-500/50 text-yellow-600 hover:bg-yellow-500/10"
              onClick={handleRevealNow}
              disabled={isRevealing}
            >
              {isRevealing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PartyPopper className="h-4 w-4" />}
              Revelar Agora
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isRevealed}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
