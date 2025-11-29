import * as React from "react";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PricingTier {
  name: string;
  icon: React.ReactNode;
  price: number;
  description: string;
  features: string[];
  popular?: boolean;
  color: string;
  maxCollaborators?: number;
}

interface SubscriptionInfo {
  subscribed: boolean;
  product_id: string | null;
  subscription_end: string | null;
}

interface CreativePricingProps {
  tag?: string;
  title?: string;
  description?: string;
  tiers: PricingTier[];
  onSubscribe?: (planName: string, extraCollaborators?: number) => void;
  loading?: string | null;
  subscription?: SubscriptionInfo | null;
  onManageSubscription?: () => void;
  onAddCollaborators?: (quantity: number) => Promise<void>;
  onUpgradePlan?: (newPriceId: string) => Promise<void>;
  extraCollaboratorPrice?: number;
  stripePlans?: {
    [key: string]: {
      priceId: string;
      productId: string;
    };
  };
}

export function CreativePricing({
  tag = "Planos Simples",
  title = "Escolha o Plano Ideal",
  description = "Gerencie seus leads com eficiência",
  tiers,
  onSubscribe,
  loading,
  subscription,
  onManageSubscription,
  onAddCollaborators,
  onUpgradePlan,
  extraCollaboratorPrice = 30,
  stripePlans = {},
}: CreativePricingProps) {
  const [extraCollaborators, setExtraCollaborators] = React.useState<{
    [key: string]: number;
  }>({});
  const [showExtraCollaborators, setShowExtraCollaborators] = React.useState<{
    [key: string]: boolean;
  }>({});
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [modalQuantity, setModalQuantity] = React.useState(1);
  const [currentTier, setCurrentTier] = React.useState<PricingTier | null>(null);

  const isCurrentPlan = (tier: PricingTier) => {
    if (!subscription?.subscribed || !subscription.product_id) return false;

    const tierName = tier.name.toLowerCase();
    if (tierName === "básico")
      return subscription.product_id === "prod_TVqqdFt1DYCcCI";
    if (tierName === "profissional")
      return subscription.product_id === "prod_TVqr72myTFqI39";
    if (tierName === "enterprise")
      return subscription.product_id === "prod_TVqrhrzuIdUDcS";

    return false;
  };

  const canUpgrade = (tier: PricingTier) => {
    if (!subscription?.subscribed) return false;
    
    const planOrder = ["Básico", "Profissional", "Enterprise"];
    const currentPlanIndex = planOrder.findIndex((plan) => {
      const tierName = plan.toLowerCase();
      if (tierName === "básico")
        return subscription.product_id === "prod_TVqqdFt1DYCcCI";
      if (tierName === "profissional")
        return subscription.product_id === "prod_TVqr72myTFqI39";
      if (tierName === "enterprise")
        return subscription.product_id === "prod_TVqrhrzuIdUDcS";
      return false;
    });
    
    const tierIndex = planOrder.indexOf(tier.name);
    return tierIndex > currentPlanIndex && currentPlanIndex !== -1;
  };

  const handleExtraColabChange = (tierName: string, value: number) => {
    setExtraCollaborators((prev) => ({
      ...prev,
      [tierName]: Math.max(0, value),
    }));
  };

  const getTotalPrice = (tier: PricingTier) => {
    const extras = extraCollaborators[tier.name] || 0;
    return tier.price + extras * extraCollaboratorPrice;
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4">
      <div className="text-center space-y-6 mb-16">
        <div className="text-sm font-medium text-primary">
          {tag}
        </div>
        <div className="relative">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground">
            {title}
          </h2>
        </div>
        <p className="text-lg text-muted-foreground">
          {description}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {tiers.map((tier, index) => (
          <div
            key={tier.name}
            className="relative group transition-all duration-300"
          >
            <div
              className={cn(
                "absolute inset-0 bg-card",
                "border-2 border-border",
                "rounded-lg shadow-[4px_4px_0px_0px] shadow-border",
                "transition-all duration-300",
                "group-hover:shadow-[8px_8px_0px_0px]",
                "group-hover:translate-x-[-4px]",
                "group-hover:translate-y-[-4px]"
              )}
            />

            <div className="relative p-6">
              {tier.popular && (
                <div className="absolute -top-2 -right-2 bg-amber-400 text-zinc-900 font-medium px-3 py-1 rounded-full text-sm border-2 border-border">
                  Popular!
                </div>
              )}

              <div className="mb-6">
                <div
                  className={cn(
                    "w-12 h-12 rounded-full mb-4",
                    "flex items-center justify-center",
                    "border-2 border-border",
                    "text-primary"
                  )}
                >
                  {tier.icon}
                </div>
                <h3 className="text-2xl font-semibold text-foreground">
                  {tier.name}
                </h3>
                <p className="text-muted-foreground">
                  {tier.description}
                </p>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-bold text-foreground">
                  R$ {tier.price}
                </span>
                <span className="text-muted-foreground">/mês</span>
              </div>

              <div className="space-y-3 mb-6">
                {tier.features.map((feature) => (
                  <div key={feature} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full border-2 border-border flex items-center justify-center">
                      <Check className="w-3 h-3" />
                    </div>
                    <span className="text-base text-foreground">
                      {feature}
                    </span>
                  </div>
                ))}
              </div>

              {/* Extra Collaborators Selector */}
              {tier.maxCollaborators && (
                <div className="mb-6">
                  {!showExtraCollaborators[tier.name] ? (
                    <button
                      type="button"
                      onClick={() =>
                        setShowExtraCollaborators((prev) => ({
                          ...prev,
                          [tier.name]: true,
                        }))
                      }
                      className="w-full p-3 text-center text-sm text-primary hover:text-primary/80 hover:bg-muted/50 rounded-lg border-2 border-dashed border-border transition-colors"
                    >
                      + Mais colaboradores
                    </button>
                  ) : (
                    <div className="p-4 bg-muted/50 rounded-lg space-y-3 border-2 border-border">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          Colaboradores extras:
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              handleExtraColabChange(
                                tier.name,
                                (extraCollaborators[tier.name] || 0) - 1
                              )
                            }
                            disabled={
                              !extraCollaborators[tier.name] ||
                              extraCollaborators[tier.name] === 0
                            }
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="w-8 text-center font-semibold">
                            {extraCollaborators[tier.name] || 0}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() =>
                              handleExtraColabChange(
                                tier.name,
                                (extraCollaborators[tier.name] || 0) + 1
                              )
                            }
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {extraCollaborators[tier.name] > 0 && (
                        <div className="text-xs text-muted-foreground text-right">
                          {extraCollaborators[tier.name]} × R${" "}
                          {extraCollaboratorPrice} = R${" "}
                          {extraCollaborators[tier.name] * extraCollaboratorPrice}
                        </div>
                      )}
                      {extraCollaborators[tier.name] > 0 && (
                        <div className="text-sm font-semibold text-right pt-2 border-t">
                          Total: R$ {getTotalPrice(tier)}/mês
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {isCurrentPlan(tier) ? (
                <div className="space-y-2">
                  {onAddCollaborators && (
                    <Button
                      onClick={() => {
                        setCurrentTier(tier);
                        setModalQuantity(1);
                        setShowAddModal(true);
                      }}
                      className={cn(
                        "w-full h-12 text-base font-medium",
                        "bg-amber-400 text-zinc-900 hover:bg-amber-300",
                        "border-2 border-border",
                        "shadow-[4px_4px_0px_0px] shadow-border",
                        "hover:shadow-[6px_6px_0px_0px]",
                        "hover:translate-x-[-2px] hover:translate-y-[-2px]"
                      )}
                    >
                      Colaboradores Extra
                    </Button>
                  )}
                  {onManageSubscription && (
                    <Button
                      onClick={onManageSubscription}
                      variant="outline"
                      className="w-full"
                    >
                      Gerenciar Assinatura
                    </Button>
                  )}
                </div>
              ) : canUpgrade(tier) && onUpgradePlan ? (
                <Button
                  onClick={() => {
                    const planKey = tier.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    const priceId = stripePlans[planKey]?.priceId;
                    if (priceId) {
                      onUpgradePlan(priceId);
                    }
                  }}
                  disabled={loading === tier.name}
                  className={cn(
                    "w-full h-12 text-base relative",
                    "border-2 border-border",
                    "transition-all duration-300",
                    "shadow-[4px_4px_0px_0px] shadow-border",
                    "hover:shadow-[6px_6px_0px_0px]",
                    "hover:translate-x-[-2px] hover:translate-y-[-2px]",
                    "bg-primary text-primary-foreground hover:bg-primary/90"
                  )}
                >
                  {loading === tier.name ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    "Fazer Upgrade"
                  )}
                </Button>
              ) : subscription?.subscribed ? (
                <Button
                  disabled
                  variant="outline"
                  className="w-full"
                >
                  Plano Atual ou Inferior
                </Button>
              ) : (
                <Button
                  onClick={() =>
                    onSubscribe?.(tier.name, extraCollaborators[tier.name] || 0)
                  }
                  disabled={loading === tier.name}
                  className={cn(
                    "w-full h-12 text-base relative",
                    "border-2 border-border",
                    "transition-all duration-300",
                    "shadow-[4px_4px_0px_0px] shadow-border",
                    "hover:shadow-[6px_6px_0px_0px]",
                    "hover:translate-x-[-2px] hover:translate-y-[-2px]",
                    tier.popular
                      ? "bg-amber-400 text-zinc-900 hover:bg-amber-300"
                      : "bg-card hover:bg-accent"
                  )}
                >
                  {loading === tier.name ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    "Começar Agora"
                  )}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      {/* Modal para adicionar colaboradores */}
      {showAddModal && currentTier && onAddCollaborators && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border-2 border-border rounded-lg shadow-[8px_8px_0px_0px] shadow-border max-w-md w-full p-6 space-y-4">
            <div>
              <h3 className="text-2xl font-semibold text-foreground mb-2">
                Adicionar Colaboradores
              </h3>
              <p className="text-muted-foreground">
                Plano {currentTier.name} - R$ {extraCollaboratorPrice}/mês por colaborador
              </p>
            </div>

            <div className="space-y-3">
              <label className="text-sm text-foreground font-medium">
                Quantidade de colaboradores extras:
              </label>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                  onClick={() => setModalQuantity(Math.max(1, modalQuantity - 1))}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <input
                  type="number"
                  min="1"
                  value={modalQuantity}
                  onChange={(e) => setModalQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 text-center text-xl font-bold border-2 border-border rounded-md px-3 py-2 bg-background text-primary"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                  onClick={() => setModalQuantity(modalQuantity + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <div className="p-4 bg-muted/50 border-2 border-border rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-foreground">
                    {modalQuantity} colaborador{modalQuantity > 1 ? 'es' : ''} × R$ {extraCollaboratorPrice}
                  </span>
                  <span className="text-xl font-bold text-foreground">
                    R$ {modalQuantity * extraCollaboratorPrice}/mês
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Será cobrado proporcionalmente ao período atual
                </p>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => {
                  onAddCollaborators(modalQuantity);
                  setShowAddModal(false);
                  setCurrentTier(null);
                }}
                className={cn(
                  "flex-1 h-12 text-base",
                  "border-2 border-border",
                  "shadow-[4px_4px_0px_0px] shadow-border",
                  "hover:shadow-[6px_6px_0px_0px]",
                  "hover:translate-x-[-2px] hover:translate-y-[-2px]"
                )}
              >
                Confirmar
              </Button>
              <Button
                onClick={() => {
                  setShowAddModal(false);
                  setCurrentTier(null);
                }}
                variant="outline"
                className={cn(
                  "flex-1 h-12 text-base",
                  "border-2 border-border"
                )}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
