import { Trophy, PartyPopper, Clock, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface RankingCompetitionBannerProps {
  title: string;
  isActive: boolean;
  isRevealed: boolean;
  revealAt: string | null;
  isAdmin: boolean;
  onRevealNow?: () => void;
}

export function RankingCompetitionBanner({
  title,
  isActive,
  isRevealed,
  revealAt,
  isAdmin,
  onRevealNow,
}: RankingCompetitionBannerProps) {
  if (!isActive && !isRevealed) return null;

  // Revealed state — celebration banner
  if (isRevealed) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/20 mb-4">
        <PartyPopper className="h-5 w-5 text-green-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-green-700 dark:text-green-400">
            Resultados revelados!
          </p>
          <p className="text-xs text-green-600/70">
            A competição "{title}" foi revelada. Agora todos podem ver o ranking completo.
          </p>
        </div>
      </div>
    );
  }

  // Active hidden mode
  const revealDate = revealAt ? format(new Date(revealAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : null;

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 mb-4">
      <div className="flex-shrink-0">
        <div className="relative">
          <Trophy className="h-5 w-5 text-yellow-500" />
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
          </span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
          {isAdmin ? (
            <>Competição ativa — Modo oculto para membros</>
          ) : (
            <>Competição ativa! Você só pode ver seus próprios dados</>
          )}
        </p>
        {revealDate && (
          <p className="text-xs text-yellow-600/70 flex items-center gap-1 mt-0.5">
            <Clock className="h-3 w-3" />
            Revelação em: {revealDate}
          </p>
        )}
      </div>
      {isAdmin && onRevealNow && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 border-yellow-500/50 text-yellow-600 hover:bg-yellow-500/10 flex-shrink-0"
          onClick={onRevealNow}
        >
          <Eye className="h-3.5 w-3.5" />
          Revelar Agora
        </Button>
      )}
    </div>
  );
}
