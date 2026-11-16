import { Copy, ExternalLink, MessageCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { proposalUrl } from "@/lib/consortiumProposal";
import { copyProposalLink, copyProposalMessage } from "@/lib/proposalShare";

interface ProposalCreatedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string | null;
  clientName: string | null;
  planCount: number;
  leadAdvanced: boolean;
}

/** Depois de criar a proposta: link, mensagem pronta e aviso do avanço do lead. */
export function ProposalCreatedDialog({ open, onOpenChange, token, clientName, planCount, leadAdvanced }: ProposalCreatedDialogProps) {
  const url = token ? proposalUrl(window.location.origin, token) : "";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Proposta criada</DialogTitle>
          <DialogDescription>
            {leadAdvanced ? "O lead foi para a etapa Proposta enviada. " : ""}
            O link vale 30 dias e mostra quando o cliente abrir.
          </DialogDescription>
        </DialogHeader>
        <Input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Link da proposta" className="font-mono text-xs" />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => token && copyProposalLink(token)}>
            <Copy />
            Copiar link
          </Button>
          <Button variant="outline" onClick={() => token && copyProposalMessage(token, clientName, planCount)}>
            <MessageCircle />
            Copiar mensagem
          </Button>
          <Button variant="ghost" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink />
              Abrir proposta
            </a>
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
