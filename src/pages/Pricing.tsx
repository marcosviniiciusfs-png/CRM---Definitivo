import { CreativePricing, PricingTier } from "@/components/ui/creative-pricing";
import { Zap, TrendingUp, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useState, useEffect } from "react";

// Mapeamento dos planos com price_id do Stripe
const STRIPE_PLANS = {
  basico: {
    priceId: "price_1SYp92CIzFkZL7Jmk8LxUPOp",
    productId: "prod_TVqqdFt1DYCcCI",
    maxCollaborators: 5,
  },
  profissional: {
    priceId: "price_1SYp9OCIzFkZL7JmHitGK3FN",
    productId: "prod_TVqr72myTFqI39",
    maxCollaborators: 15,
  },
  enterprise: {
    priceId: "price_1SYp9bCIzFkZL7JmvcvRhSLh",
    productId: "prod_TVqrhrzuIdUDcS",
    maxCollaborators: 30,
  },
  colaboradorExtra: {
    priceId: "price_1SYpG5CIzFkZL7JmZq9Q7Z1a",
    productId: "prod_TVqy95fQXCZsWI",
    pricePerUnit: 30,
  }
};

const pricingTiers: PricingTier[] = [
  {
    name: "Básico",
    icon: <Zap className="w-6 h-6" />,
    price: 200,
    description: "Ideal para começar",
    color: "blue",
    features: [
      "Até 500 leads",
      "5 colaboradores inclusos",
      "WhatsApp integrado",
      "Funil básico",
      "Suporte por email",
    ],
    maxCollaborators: 5,
  },
  {
    name: "Profissional",
    icon: <TrendingUp className="w-6 h-6" />,
    price: 500,
    description: "Para equipes em crescimento",
    color: "amber",
    features: [
      "Leads ilimitados",
      "15 colaboradores inclusos",
      "Automações avançadas",
      "Múltiplos funis",
      "Facebook Leads integrado",
      "Relatórios completos",
      "Suporte prioritário",
    ],
    popular: true,
    maxCollaborators: 15,
  },
  {
    name: "Enterprise",
    icon: <Crown className="w-6 h-6" />,
    price: 2000,
    description: "Solução completa",
    color: "purple",
    features: [
      "Tudo do Profissional",
      "30 colaboradores inclusos",
      "API dedicada",
      "Múltiplas organizações",
      "Suporte 24/7",
      "Treinamento personalizado",
      "Gerente de conta dedicado",
    ],
    maxCollaborators: 30,
  },
];

export default function Pricing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<{
    subscribed: boolean;
    product_id: string | null;
    subscription_end: string | null;
  } | null>(null);

  useEffect(() => {
    if (user) {
      checkSubscription();
    }
  }, [user]);

  const checkSubscription = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (error) throw error;
      setSubscription(data);
    } catch (error) {
      console.error("Erro ao verificar assinatura:", error);
    }
  };

  const handleSubscribe = async (planName: string, extraCollaborators: number = 0) => {
    if (!user) {
      toast.error("Faça login para assinar um plano");
      navigate("/auth");
      return;
    }

    setLoading(planName);

    try {
      let priceId: string;
      if (planName === "Básico") {
        priceId = STRIPE_PLANS.basico.priceId;
      } else if (planName === "Profissional") {
        priceId = STRIPE_PLANS.profissional.priceId;
      } else {
        priceId = STRIPE_PLANS.enterprise.priceId;
      }

      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { 
          priceId,
          extraCollaborators 
        },
      });

      if (error) throw error;

      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error) {
      console.error("Erro ao criar checkout:", error);
      toast.error("Erro ao processar pagamento. Tente novamente.");
    } finally {
      setLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error) {
      console.error("Erro ao abrir portal:", error);
      toast.error("Erro ao abrir portal de assinatura");
    }
  };

  return (
    <div className="min-h-screen bg-background py-12">
      <CreativePricing
        tag="Planos Flexíveis"
        title="Escolha o Melhor Para Você"
        description="Gerencie seus leads e automatize vendas"
        tiers={pricingTiers}
        onSubscribe={handleSubscribe}
        loading={loading}
        subscription={subscription}
        onManageSubscription={handleManageSubscription}
        extraCollaboratorPrice={STRIPE_PLANS.colaboradorExtra.pricePerUnit}
      />
    </div>
  );
}
