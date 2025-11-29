import { CreativePricing, PricingTier } from "@/components/ui/creative-pricing";
import { Zap, TrendingUp, Crown } from "lucide-react";

const pricingTiers: PricingTier[] = [
  {
    name: "Básico",
    icon: <Zap className="w-6 h-6" />,
    price: 200,
    description: "Ideal para começar",
    color: "blue",
    features: [
      "Até 500 leads",
      "WhatsApp integrado",
      "Funil básico",
      "Suporte por email",
    ],
  },
  {
    name: "Profissional",
    icon: <TrendingUp className="w-6 h-6" />,
    price: 500,
    description: "Para equipes em crescimento",
    color: "amber",
    features: [
      "Leads ilimitados",
      "Automações avançadas",
      "Múltiplos funis",
      "Facebook Leads integrado",
      "Relatórios completos",
      "Suporte prioritário",
    ],
    popular: true,
  },
  {
    name: "Enterprise",
    icon: <Crown className="w-6 h-6" />,
    price: 2000,
    description: "Solução completa",
    color: "purple",
    features: [
      "Tudo do Profissional",
      "API dedicada",
      "Múltiplas organizações",
      "Suporte 24/7",
      "Treinamento personalizado",
      "Gerente de conta dedicado",
    ],
  },
];

export default function Pricing() {
  return (
    <div className="min-h-screen bg-background py-12">
      <CreativePricing
        tag="Planos Flexíveis"
        title="Escolha o Melhor Para Você"
        description="Gerencie seus leads e automatize vendas"
        tiers={pricingTiers}
      />
    </div>
  );
}
