import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useRankingFeed } from "@/hooks/useGamification";
import { useMembersMap } from "@/hooks/useRanking";
import { feedText } from "@/components/ranking/GamificationPanels";
import { isDemoRoute } from "@/lib/demoMode";

const STORAGE_KEY = "kairoz-celebration-last-seen";

/**
 * Aviso no app quando alguém da equipe vende, bate meta ou ganha medalha.
 * Lê o feed a cada 2 minutos; na primeira leitura só marca o que já existia.
 */
export function CelebrationWatcher() {
  const demo = isDemoRoute();
  const { data: feed } = useRankingFeed(10);
  const { data: members = {} } = useMembersMap();
  const lastSeen = useRef<string | null>(null);

  useEffect(() => {
    if (demo || !feed || feed.length === 0) return;
    const newest = feed[0].occurred_at;
    if (lastSeen.current === null) {
      try {
        lastSeen.current = sessionStorage.getItem(STORAGE_KEY) ?? newest;
      } catch {
        lastSeen.current = newest;
      }
    }
    const fresh = feed.filter((item) => item.occurred_at > (lastSeen.current as string)).slice(0, 3).reverse();
    for (const item of fresh) {
      toast.success(feedText(item.kind, members[item.user_id]?.name ?? "Alguém da equipe", item.amount));
    }
    lastSeen.current = newest > (lastSeen.current as string) ? newest : lastSeen.current;
    try {
      sessionStorage.setItem(STORAGE_KEY, lastSeen.current as string);
    } catch {
      // Sem armazenamento: só não lembra entre recarregamentos.
    }
  }, [demo, feed, members]);

  return null;
}
