import { useState } from "react";
import { toast } from "sonner";
import { Check, Plus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ADMINISTRATOR_SUGGESTIONS, SALE_RULES, type SaleCountsOn } from "@/lib/consortium";
import { useOrganizationSegment, useSetConsortiumSaleRule } from "@/hooks/useOrganizationSegment";
import { useConsortiumAdministrators, useSaveConsortiumAdministrator } from "@/hooks/useConsortium";

/** Quando uma cota vendida entra na produção, no ranking e na comissão. */
export function ConsortiumSaleRuleCard() {
  const { saleRule, loading } = useOrganizationSegment();
  const setRule = useSetConsortiumSaleRule();

  const choose = (rule: SaleCountsOn) => {
    if (rule === saleRule || setRule.isPending) return;
    setRule.mutate(rule, {
      onSuccess: () => toast.success("Regra da venda atualizada."),
      onError: (error) => {
        console.error("Erro ao mudar a regra da venda:", error);
        toast.error("Não foi possível mudar a regra. Tente de novo.");
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quando a venda conta</CardTitle>
        <CardDescription>Vale para a produção, o ranking e, depois, para as comissões.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Quando a venda conta">
          {SALE_RULES.map((option) => {
            const selected = saleRule === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={loading || setRule.isPending}
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

/** Cadastro das administradoras com que a corretora trabalha. */
export function ConsortiumAdministratorsCard() {
  const { data: administrators = [], isLoading } = useConsortiumAdministrators();
  const saveAdministrator = useSaveConsortiumAdministrator();
  const [name, setName] = useState("");

  const existing = new Set(administrators.map((admin) => admin.name.trim().toLowerCase()));
  const suggestions = ADMINISTRATOR_SUGGESTIONS.filter((suggestion) => !existing.has(suggestion.toLowerCase()));

  const add = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (existing.has(trimmed.toLowerCase())) {
      toast.error(`${trimmed} já está na lista.`);
      return;
    }
    saveAdministrator.mutate(
      { name: trimmed },
      {
        onSuccess: () => {
          setName("");
          toast.success(`${trimmed} adicionada.`);
        },
        onError: (error) => {
          console.error("Erro ao adicionar administradora:", error);
          toast.error("Não foi possível adicionar a administradora. Tente de novo.");
        },
      },
    );
  };

  const toggle = (id: string, isActive: boolean) => {
    saveAdministrator.mutate(
      { id, is_active: isActive },
      {
        onError: (error) => {
          console.error("Erro ao atualizar administradora:", error);
          toast.error("Não foi possível atualizar a administradora. Tente de novo.");
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Administradoras</CardTitle>
        <CardDescription>
          Aparecem no registro das cotas. Desligar uma administradora tira ela das opções sem apagar as cotas antigas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            add(name);
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder="Nome da administradora" className="h-9" />
          <Button type="submit" variant="outline" size="sm" className="h-9" disabled={!name.trim() || saveAdministrator.isPending}>
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        </form>

        {suggestions.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Atalhos</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => add(suggestion)}
                  disabled={saveAdministrator.isPending}
                  className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border-strong px-2.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-accent disabled:opacity-60"
                >
                  <Plus className="h-3 w-3" aria-hidden="true" />
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : administrators.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma administradora cadastrada.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {administrators.map((admin) => (
              <li key={admin.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className={cn("text-sm", !admin.is_active && "text-muted-foreground line-through")}>{admin.name}</span>
                <Switch
                  checked={admin.is_active}
                  onCheckedChange={(checked) => toggle(admin.id, checked)}
                  aria-label={admin.is_active ? `Desligar ${admin.name}` : `Ligar ${admin.name}`}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
