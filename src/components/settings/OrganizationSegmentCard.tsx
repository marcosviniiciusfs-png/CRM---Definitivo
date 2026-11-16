import { Building2, Check } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useOrganizationSegment, useSetOrganizationSegment } from "@/hooks/useOrganizationSegment";
import type { OrganizationSegment } from "@/lib/segmentTerms";

const OPTIONS: Array<{ value: OrganizationSegment; title: string; description: string }> = [
  {
    value: "consorcio",
    title: "Consórcio",
    description: "Termos de consórcio (crédito, cota vendida, produção), funil-modelo de consórcio e sem catálogo de produtos com estoque.",
  },
  {
    value: "generico",
    title: "Outro segmento",
    description: "Termos gerais de vendas (valor, venda, receita) e catálogo de produtos e serviços.",
  },
];

/** Escolha do segmento da organização. Só owner e admin veem este cartão. */
export function OrganizationSegmentCard() {
  const { segment, loading } = useOrganizationSegment();
  const setSegment = useSetOrganizationSegment();

  const choose = (value: OrganizationSegment) => {
    if (value === segment || setSegment.isPending) return;
    setSegment.mutate(value, {
      onSuccess: () =>
        toast.success(value === "consorcio" ? "Modo consórcio ligado." : "Modo consórcio desligado."),
      onError: (error) => {
        console.error("Erro ao mudar o segmento:", error);
        toast.error("Não foi possível mudar o segmento. Tente de novo.");
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          Segmento da organização
        </CardTitle>
        <CardDescription>
          Ajusta os termos e os recursos do CRM ao tipo de venda da equipe. Vale para todos da organização.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Segmento da organização">
          {OPTIONS.map((option) => {
            const selected = segment === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={loading || setSegment.isPending}
                onClick={() => choose(option.value)}
                className={cn(
                  "flex flex-col gap-1 rounded-lg border p-4 text-left transition-colors disabled:opacity-60",
                  selected ? "border-foreground bg-accent/40" : "border-border hover:bg-accent/40",
                )}
              >
                <span className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
                  {option.title}
                  {selected && <Check className="h-4 w-4" aria-hidden="true" />}
                </span>
                <span className="text-[13px] text-muted-foreground">{option.description}</span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
