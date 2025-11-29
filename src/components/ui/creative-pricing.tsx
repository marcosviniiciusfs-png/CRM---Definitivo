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
        <div className="font-handwritten text-xl text-primary rotate-[-1deg]">
          {tag}
        </div>
        <div className="relative">
          <h2 className="text-4xl md:text-5xl font-bold font-handwritten text-foreground rotate-[-1deg]">
            {title}
            <div className="absolute -right-12 top-0 text-amber-500 rotate-12">
              ✨
            </div>
            <div className="absolute -left-8 bottom-0 text-primary -rotate-12">
              ⭐️
            </div>
          </h2>
          <div
            className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-44 h-3 bg-primary/20 
            rotate-[-1deg] rounded-full blur-sm"
          />
        </div>
        <p className="font-handwritten text-xl text-muted-foreground rotate-[-1deg]">
          {description}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {tiers.map((tier, index) => (
          <div
            key={tier.name}
            className={cn(
              "relative group",
              "transition-all duration-300",
              index === 0 && "rotate-[-1deg]",
              index === 1 && "rotate-[1deg]",
              index === 2 && "rotate-[-2deg]"
            )}
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
                <div
                  className="absolute -top-2 -right-2 bg-amber-400 text-zinc-900 
                  font-handwritten px-3 py-1 rounded-full rotate-12 text-sm border-2 border-border"
                >
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
                <h3 className="font-handwritten text-2xl text-foreground">
                  {tier.name}
                </h3>
                <p className="font-handwritten text-muted-foreground">
                  {tier.description}
                </p>
              </div>

              <div className="mb-6 font-handwritten">
                <span className="text-4xl font-bold text-foreground">
                  R$ {tier.price}
                </span>
                <span className="text-muted-foreground">/mês</span>
              </div>

              <div className="space-y-3 mb-6">
                {tier.features.map((feature) => (
                  <div key={feature} className="flex items-center gap-3">
                    <div
                      className="w-5 h-5 rounded-full border-2 border-border 
                      flex items-center justify-center"
                    >
                      <Check className="w-3 h-3" />
                    </div>
                    <span className="font-handwritten text-lg text-foreground">
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
                      className="w-full p-3 text-center font-handwritten text-sm text-primary hover:text-primary/80 hover:bg-muted/50 rounded-lg border-2 border-dashed border-border transition-colors"
                    >
                      + Mais colaboradores
                    </button>
                  ) : (
                    <div className="p-4 bg-muted/50 rounded-lg space-y-3 border-2 border-border">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-handwritten text-muted-foreground">
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
                          <span className="w-8 text-center font-handwritten font-semibold">
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
                        <div className="text-xs font-handwritten text-muted-foreground text-right">
                          {extraCollaborators[tier.name]} × R${" "}
                          {extraCollaboratorPrice} = R${" "}
                          {extraCollaborators[tier.name] * extraCollaboratorPrice}
                        </div>
                      )}
                      {extraCollaborators[tier.name] > 0 && (
                        <div className="text-sm font-handwritten font-semibold text-right pt-2 border-t">
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
                        const quantity = extraCollaborators[tier.name] || 1;
                        onAddCollaborators(quantity);
                      }}
                      variant="default"
                      className="w-full font-handwritten"
                    >
                      {extraCollaborators[tier.name] && extraCollaborators[tier.name] > 0
                        ? `Adicionar ${extraCollaborators[tier.name]} Colaborador${extraCollaborators[tier.name] > 1 ? 'es' : ''}`
                        : 'Adicionar 1 Colaborador'}
                    </Button>
                  )}
                  {onManageSubscription && (
                    <Button
                      onClick={onManageSubscription}
                      variant="outline"
                      className="w-full font-handwritten"
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
                    "w-full h-12 font-handwritten text-lg relative",
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
                  className="w-full font-handwritten"
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
                    "w-full h-12 font-handwritten text-lg relative",
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
      <div className="absolute -z-10 inset-0 overflow-hidden">
        <div className="absolute top-40 left-20 text-4xl rotate-12">✎</div>
        <div className="absolute bottom-40 right-20 text-4xl -rotate-12">
          ✏️
        </div>
      </div>
    </div>
  );
}
