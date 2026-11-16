import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SCORE_KINDS, type ScoreKind } from "@/lib/scoring";
import { useOrganizationSegment, useSetRankingShowValues } from "@/hooks/useOrganizationSegment";
import { useSaveScoreRule, useScoreRules } from "@/hooks/useRanking";
import { useSetTvToken, useTvToken } from "@/hooks/useGamification";

interface Draft {
  points: string;
  cap: string;
  enabled: boolean;
}

/** Visibilidade do R$ e tabela de pontos do ranking (owner/admin). */
export function RankingSettingsCard() {
  const { rankingShowValues, loading } = useOrganizationSegment();
  const setShow = useSetRankingShowValues();
  const { data: rules = [] } = useScoreRules();
  const saveRule = useSaveScoreRule();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  useEffect(() => {
    const next: Record<string, Draft> = {};
    for (const kind of SCORE_KINDS) {
      const rule = rules.find((r) => r.event_kind === kind.kind);
      next[kind.kind] = {
        points: String(rule?.points ?? kind.points),
        cap: rule ? (rule.daily_cap ? String(rule.daily_cap) : "") : kind.dailyCap ? String(kind.dailyCap) : "",
        enabled: rule?.enabled ?? true,
      };
    }
    setDrafts(next);
  }, [rules]);

  const update = (kind: string, patch: Partial<Draft>) => setDrafts((current) => ({ ...current, [kind]: { ...current[kind], ...patch } }));

  const save = async () => {
    try {
      for (const kind of SCORE_KINDS) {
        const draft = drafts[kind.kind];
        if (!draft) continue;
        const points = Number(draft.points);
        const cap = draft.cap.trim() ? Number(draft.cap) : null;
        if (!Number.isInteger(points) || points < 0 || points > 10000) {
          toast.error(`Pontos de "${kind.label}" vão de 0 a 10.000.`);
          return;
        }
        if (cap !== null && (!Number.isInteger(cap) || cap <= 0)) {
          toast.error(`O limite diário de "${kind.label}" precisa ser um número inteiro maior que zero.`);
          return;
        }
        await saveRule.mutateAsync({ event_kind: kind.kind as ScoreKind, points, daily_cap: cap, enabled: draft.enabled });
      }
      toast.success("Pontuação salva. Vale para os próximos eventos.");
    } catch (error) {
      console.error("Erro ao salvar a pontuação:", error);
      toast.error("Não foi possível salvar a pontuação. Tente de novo.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ranking</CardTitle>
        <CardDescription>Quanto vale cada conquista e o que os vendedores veem dos colegas.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-foreground">Mostrar o R$ dos colegas</p>
            <p className="text-[13px] text-muted-foreground">Desligado, cada vendedor vê o próprio valor e a posição de todos. Dono e administradores sempre veem tudo.</p>
          </div>
          <Switch
            checked={rankingShowValues}
            disabled={loading || setShow.isPending}
            onCheckedChange={(checked) =>
              setShow.mutate(checked, {
                onSuccess: () => toast.success(checked ? "Valores visíveis no ranking." : "Valores dos colegas escondidos."),
                onError: () => toast.error("Não foi possível mudar a visibilidade. Tente de novo."),
              })
            }
            aria-label="Mostrar o R$ dos colegas"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Conquista</th>
                <th className="w-24 pb-2 font-medium">Pontos</th>
                <th className="w-28 pb-2 font-medium">Limite por dia</th>
                <th className="w-16 pb-2 text-right font-medium">Ligado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {SCORE_KINDS.map((kind) => {
                const draft = drafts[kind.kind];
                if (!draft) return null;
                return (
                  <tr key={kind.kind}>
                    <td className="py-2 pr-3">
                      <p className="font-medium text-foreground">{kind.label}</p>
                      <p className="text-xs text-muted-foreground">{kind.hint}</p>
                    </td>
                    <td className="py-2 pr-2">
                      <Input className="h-8" inputMode="numeric" value={draft.points} onChange={(e) => update(kind.kind, { points: e.target.value.replace(/\D/g, "").slice(0, 5) })} aria-label={`Pontos de ${kind.label}`} />
                    </td>
                    <td className="py-2 pr-2">
                      <Input className="h-8" inputMode="numeric" placeholder="Sem limite" value={draft.cap} onChange={(e) => update(kind.kind, { cap: e.target.value.replace(/\D/g, "").slice(0, 5) })} aria-label={`Limite diário de ${kind.label}`} />
                    </td>
                    <td className="py-2 text-right">
                      <Switch checked={draft.enabled} onCheckedChange={(checked) => update(kind.kind, { enabled: checked })} aria-label={`Ligar ${kind.label}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={save} disabled={saveRule.isPending}>
            {saveRule.isPending ? "Salvando..." : "Salvar pontuação"}
          </Button>
        </div>

        <TvLinkSection />
      </CardContent>
    </Card>
  );
}

/** Link de só leitura para deixar o ranking numa TV, sem login. */
function TvLinkSection() {
  const { data: token, isLoading } = useTvToken(true);
  const setToken = useSetTvToken();
  const url = token ? `${window.location.origin}/tv/${token}` : null;

  const change = (enable: boolean) =>
    setToken.mutate(enable, {
      onSuccess: () => toast.success(enable ? "Link da TV criado. O link antigo deixou de funcionar." : "Link da TV desligado."),
      onError: () => toast.error("Não foi possível mudar o link da TV. Tente de novo."),
    });

  return (
    <div className="space-y-2 rounded-md border px-3 py-3">
      <p className="text-sm font-medium text-foreground">Modo TV</p>
      <p className="text-[13px] text-muted-foreground">
        Abra o link numa TV do escritório para mostrar o ranking, a meta, a campanha e as vendas do dia, trocando de tela sozinho. Não precisa de login: trate o link como uma senha.
      </p>
      {isLoading ? null : url ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input readOnly value={url} className="h-8 min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="Link da TV" />
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Link copiado."))}
          >
            Copiar
          </Button>
          <Button variant="outline" size="sm" onClick={() => change(true)} disabled={setToken.isPending}>Gerar outro</Button>
          <Button variant="ghost" size="sm" onClick={() => change(false)} disabled={setToken.isPending}>Desligar</Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => change(true)} disabled={setToken.isPending}>Criar link da TV</Button>
      )}
    </div>
  );
}
