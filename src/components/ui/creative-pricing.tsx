import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface PricingTier {
  name: string;
  icon: React.ReactNode;
  price: number;
  description: string;
  features: string[];
  popular?: boolean;
  color: string;
}

function CreativePricing({
  tag = "Planos Simples",
  title = "Escolha o Plano Ideal",
  description = "Gerencie seus leads com eficiência",
  tiers,
}: {
  tag?: string;
  title?: string;
  description?: string;
  tiers: PricingTier[];
}) {
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

              <Button
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
                Começar Agora
              </Button>
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

export { CreativePricing };
export type { PricingTier };
