import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, FileSpreadsheet, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { formatBRLCompact } from "@/lib/money";
import { assetTypeLabel } from "@/lib/consortium";
import { adjustmentIndexLabel, formatPercent } from "@/lib/consortiumSimulator";
import { usePermissions } from "@/hooks/usePermissions";
import { useOrganizationSegment } from "@/hooks/useOrganizationSegment";
import { useConsortiumAdministrators } from "@/hooks/useConsortium";
import { useConsortiumPlans, useDeleteConsortiumPlan, useSaveConsortiumPlan, type ConsortiumPlan } from "@/hooks/useConsortiumPlans";
import { ConsortiumOnlyNotice } from "@/components/consortium/ConsortiumOnlyNotice";
import { PlanFormDialog } from "@/components/consortium/PlanFormDialog";
import { PlanImportDialog } from "@/components/consortium/PlanImportDialog";

/** Planos das administradoras (/simulador/planos). Owner e admin cadastram; o resto da equipe consulta. */
export default function SimuladorPlanos() {
  const { isConsorcio, loading } = useOrganizationSegment();
  const permissions = usePermissions();
  const canManage = permissions.role === "owner" || permissions.role === "admin";
  const { data: plans = [], isLoading } = useConsortiumPlans(isConsorcio);
  const { data: administrators = [] } = useConsortiumAdministrators(isConsorcio);
  const savePlan = useSaveConsortiumPlan();
  const deletePlan = useDeleteConsortiumPlan();

  const [editing, setEditing] = useState<ConsortiumPlan | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [deleting, setDeleting] = useState<ConsortiumPlan | null>(null);

  const groups = useMemo(() => {
    const byAdmin = new Map<string, ConsortiumPlan[]>();
    for (const plan of plans) {
      byAdmin.set(plan.administrator_id, [...(byAdmin.get(plan.administrator_id) ?? []), plan]);
    }
    return [...byAdmin.entries()]
      .map(([id, items]) => ({ id, name: administrators.find((admin) => admin.id === id)?.name ?? "Administradora", items }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [plans, administrators]);

  if (loading) return <p className="p-4 text-sm text-muted-foreground">Carregando...</p>;
  if (!isConsorcio) return <ConsortiumOnlyNotice />;

  const activeCount = plans.filter((plan) => plan.is_active).length;

  const toggle = (plan: ConsortiumPlan, isActive: boolean) =>
    savePlan.mutate(
      { id: plan.id, values: { is_active: isActive } },
      {
        onError: (error) => {
          console.error("Erro ao atualizar o plano:", error);
          toast.error("Não foi possível atualizar o plano. Tente novamente.");
        },
      },
    );

  const confirmDelete = () => {
    if (!deleting) return;
    deletePlan.mutate(deleting.id, {
      onSuccess: () => {
        toast.success("Plano excluído.");
        setDeleting(null);
      },
      onError: (error) => {
        console.error("Erro ao excluir o plano:", error);
        toast.error("Não foi possível excluir o plano. Tente novamente.");
      },
    });
  };

  return (
    <div className="mx-auto w-full max-w-[1280px] px-1 pb-6 pt-2 sm:px-2 sm:pt-4">
      <Link to="/simulador" className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Simulador
      </Link>
      <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-[-0.01em] text-foreground sm:text-2xl">Planos</h1>
          <p className="text-[13px] text-muted-foreground">
            {plans.length === 0
              ? "As condições de cada administradora, usadas no simulador e nas propostas."
              : `${activeCount} de ${plans.length} ${plans.length === 1 ? "plano ativo" : "planos ativos"} · ${groups.length} ${groups.length === 1 ? "administradora" : "administradoras"}`}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileSpreadsheet />
              Importar planilha
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus />
              Adicionar plano
            </Button>
          </div>
        )}
      </div>

      <div className="mt-5 space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando planos...</p>
        ) : plans.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 text-center">
            <FileSpreadsheet className="mx-auto h-8 w-8 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            <p className="mt-2 text-sm text-muted-foreground">
              {canManage
                ? "Nenhum plano cadastrado ainda. Adicione um plano ou importe a planilha das administradoras."
                : "Nenhum plano cadastrado ainda. Peça ao dono ou a um administrador para cadastrar."}
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.id} className="rounded-lg border bg-card">
              <h2 className="border-b px-4 py-3 text-base font-semibold">{group.name}</h2>
              <ul className="divide-y">
                {group.items.map((plan) => (
                  <li key={plan.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className={cn("min-w-0 space-y-0.5", !plan.is_active && "opacity-60")}>
                      <p className="text-sm font-medium">
                        {plan.name}
                        <span className="font-normal text-muted-foreground"> · {assetTypeLabel(plan.asset_type)}</span>
                      </p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {formatBRLCompact(Number(plan.credit_min))} a {formatBRLCompact(Number(plan.credit_max))} · {plan.terms.join(", ")} meses
                      </p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {[
                          `Taxa ${formatPercent(Number(plan.admin_fee_percent))}`,
                          `fundo ${formatPercent(Number(plan.reserve_fund_percent))}`,
                          `seguro ${formatPercent(Number(plan.insurance_monthly_percent))} ao mês`,
                          adjustmentIndexLabel(plan.adjustment_index),
                          Number(plan.reduced_installment_percent) > 0 && `redutor ${formatPercent(Number(plan.reduced_installment_percent))}`,
                          Number(plan.max_embedded_bid_percent) > 0 && `embutido até ${formatPercent(Number(plan.max_embedded_bid_percent))}`,
                          plan.fixed_bid_percent != null && `lance fixo ${formatPercent(Number(plan.fixed_bid_percent))}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1">
                        <Switch
                          checked={plan.is_active}
                          onCheckedChange={(checked) => toggle(plan, checked)}
                          aria-label={plan.is_active ? `Tirar ${plan.name} do simulador` : `Mostrar ${plan.name} no simulador`}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Editar ${plan.name}`}
                          onClick={() => {
                            setEditing(plan);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`Excluir ${plan.name}`} onClick={() => setDeleting(plan)}>
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      {canManage && (
        <>
          <PlanFormDialog open={formOpen} onOpenChange={setFormOpen} plan={editing} />
          <PlanImportDialog open={importOpen} onOpenChange={setImportOpen} />
        </>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir o plano {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Ele sai do simulador. Propostas já enviadas continuam com os valores da época. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDelete}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
