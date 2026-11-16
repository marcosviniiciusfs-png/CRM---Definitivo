import { toast } from "sonner";
import { copyText } from "@/lib/clipboard";
import { proposalUrl, proposalWhatsAppMessage } from "@/lib/consortiumProposal";

/** Copia o link público da proposta e avisa. */
export async function copyProposalLink(token: string) {
  const ok = await copyText(proposalUrl(window.location.origin, token));
  if (ok) toast.success("Link copiado.");
  else toast.error("Não foi possível copiar. Selecione o link e copie à mão.");
}

/** Copia a mensagem pronta para o WhatsApp do lead, com o link. */
export async function copyProposalMessage(token: string, clientName: string | null | undefined, planCount: number) {
  const message = proposalWhatsAppMessage(clientName, proposalUrl(window.location.origin, token), planCount);
  const ok = await copyText(message);
  if (ok) toast.success("Mensagem copiada. Cole no WhatsApp do lead.");
  else toast.error("Não foi possível copiar a mensagem. Tente novamente.");
}
