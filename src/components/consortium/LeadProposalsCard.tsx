import { Link } from "react-router-dom";
import { Calculator, Copy, MessageCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatRelativeShort } from "@/lib/money";
import { parseProposalPayload, proposalPlansSummary } from "@/lib/consortiumProposal";
import { useLeadConsortiumProposals } from "@/hooks/useConsortiumPlans";
import { copyProposalLink, copyProposalMessage } from "@/lib/proposalShare";

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "America/Sao_Paulo" });

function viewsLabel(count: number, lastViewedAt: string | null) {
  if (count === 0) return "Ainda não aberta";
  const times = count === 1 ? "Aberta 1 vez" : `Aberta ${count} vezes`;
  return lastViewedAt ? `${times}, a última ${formatRelativeShort(lastViewedAt)}` : times;
}

/** Propostas enviadas ao lead (modo consórcio). */
export function LeadProposalsCard({ leadId, leadName }: { leadId: string; leadName?: string | null }) {
  const { data: proposals = [], isLoading } = useLeadConsortiumProposals(leadId);
  const now = Date.now();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold">Propostas</CardTitle>
        <Button variant="outline" size="sm" className="h-8" asChild>
          <Link to={`/simulador?lead=${leadId}`}>
            <Calculator className="h-4 w-4" />
            Nova simulação
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando propostas...</p>
        ) : proposals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma proposta enviada ainda. Monte uma no simulador.</p>
        ) : (
          proposals.map((proposal) => {
            const payload = parseProposalPayload(proposal.payload);
            const expired = new Date(proposal.expires_at).getTime() <= now;
            const opened = proposal.view_count > 0;
            return (
              <div key={proposal.id} className="space-y-1.5 rounded-md border p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold tabular-nums">{formatDate(proposal.created_at)}</span>
                  <span
                    className={
                      expired
                        ? "rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
                        : opened
                          ? "rounded-full bg-success-tint px-2 py-0.5 text-[11px] font-semibold text-success"
                          : "rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
                    }
                  >
                    {expired ? "Vencida" : opened ? "Aberta" : "Não aberta"}
                  </span>
                </div>
                {payload && <p className="truncate text-xs text-muted-foreground" title={proposalPlansSummary(payload)}>{proposalPlansSummary(payload)}</p>}
                <p className="text-xs text-muted-foreground">{viewsLabel(proposal.view_count, proposal.last_viewed_at)}</p>
                {!expired && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={() => copyProposalLink(proposal.token)}>
                      <Copy className="h-3.5 w-3.5" />
                      Copiar link
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 text-xs"
                      title="Copiar mensagem para o WhatsApp"
                      onClick={() => copyProposalMessage(proposal.token, payload?.client.name ?? leadName, payload?.plans.length ?? 1)}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      Copiar mensagem
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
