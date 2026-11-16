import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL, formatRelativeShort } from "@/lib/money";
import { goalMetricLabel, isMoneyMetric } from "@/lib/gamification";
import { cn } from "@/lib/utils";

interface TvBoard {
  organization: string | null;
  show_values: boolean;
  month: string;
  ranking: Array<{ name: string; avatar_url: string | null; production: number | null; sales: number; points: number }>;
  goal: { metric: string; target: number | null; achieved: number | null; percent: number | null } | null;
  campaign: { name: string; metric: string; prize: string | null; ends_on: string; standings: Array<{ name: string; value: number | null }> } | null;
  feed: Array<{ name: string; kind: string; amount: number | null; at: string }>;
}

const nf = new Intl.NumberFormat("pt-BR");
const ROTATE_MS = 15_000;

function feedLine(item: TvBoard["feed"][number]) {
  if (item.kind === "venda") return item.amount !== null ? `${item.name} fechou ${formatBRL(item.amount)}` : `${item.name} fechou uma venda`;
  if (item.kind === "meta_batida") return `${item.name} bateu a meta do mês`;
  return `${item.name} bateu o próprio recorde`;
}

/** Ranking em tela cheia para a TV da equipe. Abre por link com token, sem login. */
export default function TvRanking() {
  const { token = "" } = useParams();
  const [slide, setSlide] = useState(0);
  const [clock, setClock] = useState(() => new Date());

  const { data, isLoading } = useQuery({
    queryKey: ["tv-board", token],
    queryFn: async () => {
      const { data: board, error } = await supabase.rpc("tv_board", { p_token: token });
      if (error) throw error;
      return board as unknown as TvBoard | null;
    },
    refetchInterval: 60_000,
    retry: 1,
  });

  const slides = data ? ["ranking", ...(data.goal ? ["goal"] : []), ...(data.campaign ? ["campaign"] : [])] : [];

  useEffect(() => {
    const id = window.setInterval(() => {
      setSlide((s) => s + 1);
      setClock(new Date());
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    document.title = data?.organization ? `Ranking · ${data.organization}` : "Ranking";
  }, [data?.organization]);

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#0B0B0D] text-lg text-[#A1A1AA]">Carregando o ranking...</div>;
  }
  if (!data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[#0B0B0D] px-6 text-center">
        <p className="text-2xl font-semibold text-[#F4F4F5]">Link da TV inválido ou desligado</p>
        <p className="text-[#A1A1AA]">Peça um link novo ao administrador em Configurações › Organização › Ranking.</p>
      </div>
    );
  }

  const current = slides[slide % Math.max(slides.length, 1)];
  const top = data.ranking.slice(0, 10);
  const [first, second, third] = top;

  return (
    <div className="flex min-h-screen flex-col bg-[#0B0B0D] font-sans text-[#F4F4F5]">
      <header className="flex items-center justify-between px-10 pb-4 pt-8">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#8B8B94]">{data.organization}</p>
          <h1 className="text-4xl font-semibold tracking-[-0.02em]">
            {current === "goal" ? "Meta do mês" : current === "campaign" ? data.campaign?.name : "Ranking do mês"}
          </h1>
        </div>
        <p className="text-3xl font-semibold tabular-nums text-[#A1A1AA]">{clock.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
      </header>

      <main className="grid flex-1 grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6 px-10 pb-10">
        <section className="min-w-0 rounded-2xl bg-[#141417] p-8">
          {current === "ranking" && (
            top.length === 0 ? (
              <p className="text-2xl text-[#A1A1AA]">Ninguém vendeu ainda este mês. O primeiro lugar está livre.</p>
            ) : (
              <>
                <div className="grid grid-cols-3 items-end gap-4">
                  {[second, first, third].map((p, i) => p ? (
                    <div key={p.name + i} className={cn("flex flex-col items-center gap-2 rounded-xl bg-[#1B1B1F] px-4 text-center", p === first ? "pb-8 pt-10" : "pb-6 pt-6")}>
                      <span className={cn("flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold", p === first ? "bg-[#E5383F] text-white" : "bg-[#26262C]")}>
                        {p === first ? 1 : p === second ? 2 : 3}
                      </span>
                      <p className={cn("w-full truncate font-semibold", p === first ? "text-3xl" : "text-2xl")}>{p.name}</p>
                      <p className={cn("font-semibold tabular-nums", p === first ? "text-4xl" : "text-2xl")}>
                        {p.production !== null ? formatBRL(p.production) : `${nf.format(p.sales)} vendas`}
                      </p>
                    </div>
                  ) : <div key={`vazio-${i}`} />)}
                </div>
                <ol className="mt-6 divide-y divide-[#26262C]">
                  {top.slice(3).map((p, i) => (
                    <li key={p.name + i} className="flex items-center gap-4 py-3 text-2xl">
                      <span className="w-10 font-semibold tabular-nums text-[#8B8B94]">{i + 4}</span>
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      <span className="font-semibold tabular-nums">{p.production !== null ? formatBRL(p.production) : `${nf.format(p.sales)} vendas`}</span>
                    </li>
                  ))}
                </ol>
              </>
            )
          )}
          {current === "goal" && data.goal && (
            <div className="flex h-full flex-col justify-center gap-6">
              <p className="text-2xl text-[#A1A1AA]">{goalMetricLabel(data.goal.metric)} da equipe</p>
              <p className="text-8xl font-semibold tabular-nums">{data.goal.percent ?? 0}%</p>
              <div className="h-6 overflow-hidden rounded-full bg-[#26262C]">
                <div className="h-full rounded-full bg-[#F4F4F5]" style={{ width: `${Math.min(100, data.goal.percent ?? 0)}%` }} />
              </div>
              {data.goal.achieved !== null && data.goal.target !== null && (
                <p className="text-3xl tabular-nums text-[#D4D4D8]">
                  {isMoneyMetric(data.goal.metric) ? formatBRL(data.goal.achieved) : nf.format(data.goal.achieved)} de{" "}
                  {isMoneyMetric(data.goal.metric) ? formatBRL(data.goal.target) : nf.format(data.goal.target)}
                </p>
              )}
            </div>
          )}
          {current === "campaign" && data.campaign && (
            <div className="flex h-full flex-col gap-6">
              {data.campaign.prize && <p className="text-3xl text-[#D4D4D8]">Prêmio: <span className="font-semibold text-[#F4F4F5]">{data.campaign.prize}</span></p>}
              <ol className="divide-y divide-[#26262C]">
                {data.campaign.standings.map((s, i) => (
                  <li key={s.name + i} className="flex items-center gap-4 py-4 text-3xl">
                    <span className="w-10 font-semibold tabular-nums text-[#8B8B94]">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    <span className="font-semibold tabular-nums">
                      {s.value === null ? "—" : isMoneyMetric(data.campaign!.metric) ? formatBRL(s.value) : nf.format(s.value)}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-auto text-xl text-[#A1A1AA]">Termina em {new Date(`${data.campaign.ends_on}T12:00:00`).toLocaleDateString("pt-BR")}</p>
            </div>
          )}
        </section>

        <aside className="min-w-0 rounded-2xl bg-[#141417] p-8">
          <h2 className="text-2xl font-semibold">Acontecendo agora</h2>
          {data.feed.length === 0 ? (
            <p className="mt-4 text-xl text-[#A1A1AA]">As vendas do dia aparecem aqui.</p>
          ) : (
            <ul className="mt-4 space-y-5">
              {data.feed.map((item, i) => (
                <li key={i}>
                  <p className="text-xl leading-snug">{feedLine(item)}</p>
                  <p className="text-base text-[#8B8B94]">{formatRelativeShort(item.at)}</p>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </main>
    </div>
  );
}
