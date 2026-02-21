import { CreativePricing, PricingTier } from "@/components/ui/creative-pricing";
import { Zap, TrendingUp, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useState, useEffect } from "react";

const PLANS = {
  star: { maxCollaborators: 5 },
  pro: { maxCollaborators: 15 },
  elite: { maxCollaborators: 30 },
};

const EXTRA_COLLABORATOR_PRICE = 25;

const pricingTiers: PricingTier[] = [
  {
    name: "Star",
    icon: <Zap className="w-6 h-6" />,
    price: 47.99,
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
    name: "Pro",
    icon: <TrendingUp className="w-6 h-6" />,
    price: 197.99,
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
    name: "Elite",
    icon: <Crown className="w-6 h-6" />,
    price: 499,
    description: "Solução completa",
    color: "purple",
    features: [
      "Tudo do Pro",
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
    plan_id: string | null;
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
      const planId = planName.toLowerCase();

      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { planId, extraCollaborators },
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

  const handleAddCollaborators = async (quantity: number) => {
    try {
      toast.loading("Adicionando colaboradores...");
      const { data, error } = await supabase.functions.invoke("update-subscription", {
        body: { action: "add_collaborators", quantity },
      });

      if (error) throw error;

      toast.dismiss();
      toast.success(data?.message || "Colaboradores adicionados com sucesso!");
      await checkSubscription();
    } catch (error) {
      toast.dismiss();
      console.error("Erro ao adicionar colaboradores:", error);
      toast.error("Erro ao adicionar colaboradores. Tente novamente.");
    }
  };

  const handleUpgradePlan = async (newPlanId: string) => {
    try {
      toast.loading("Processando upgrade...");
      const { data, error } = await supabase.functions.invoke("update-subscription", {
        body: { action: "upgrade_plan", newPlanId },
      });

      if (error) throw error;

      toast.dismiss();

      if (data?.url) {
        window.open(data.url, "_blank");
        toast.success("Redirecionando para o checkout do novo plano...");
      } else {
        toast.success(data?.message || "Plano atualizado com sucesso!");
      }

      await checkSubscription();
    } catch (error) {
      toast.dismiss();
      console.error("Erro ao fazer upgrade:", error);
      toast.error("Erro ao atualizar plano. Tente novamente.");
    }
  };

  return (
    <div className="min-h-screen bg-background py-12">
      <CreativePricing
        tag="Planos"
        title="Escolha o Melhor Para Você"
        description="Gerencie seus leads e automatize vendas"
        tiers={pricingTiers}
        onSubscribe={handleSubscribe}
        loading={loading}
        subscription={subscription}
        onManageSubscription={handleManageSubscription}
        onAddCollaborators={handleAddCollaborators}
        onUpgradePlan={handleUpgradePlan}
        extraCollaboratorPrice={EXTRA_COLLABORATOR_PRICE}
      />
    </div>
  );
}
