import { ArrowRightLeft } from "lucide-react";

interface Props {
  transferredAt: string;
  transferredByName: string | null;
  fromChannelName: string;
}

export function TransferDivider({ transferredAt, transferredByName, fromChannelName }: Props) {
  const date = new Date(transferredAt);
  const dateStr =
    date.toLocaleDateString("pt-BR") +
    " " +
    date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="my-4 flex items-center gap-3 px-4">
      <div className="flex-1 h-px bg-border" />
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
        <ArrowRightLeft className="h-3 w-3" />
        <span>
          Conversa transferida de <strong>{fromChannelName}</strong>
          {transferredByName ? ` por ${transferredByName}` : ""} em {dateStr}
        </span>
      </div>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
