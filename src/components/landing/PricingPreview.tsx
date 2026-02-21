import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Check, Star, Crown, Shield } from "lucide-react";

const plans = [
  {
    name: "Star",
    price: "197",
    icon: <Star size={22} />,
    popular: false,
    features: ["Até 5 colaboradores", "1 funil de vendas", "Gestão de leads", "Dashboard básico"],
  },
  {
    name: "Pro",
    price: "497",
    icon: <Crown size={22} />,
    popular: true,
    features: ["Até 15 colaboradores", "Funis ilimitados", "Automações", "Comissões e metas", "Métricas avançadas"],
  },
  {
    name: "Elite",
    price: "1.970",
    icon: <Shield size={22} />,
    popular: false,
    features: ["Colaboradores ilimitados", "Tudo do Pro", "Suporte prioritário", "API personalizada", "Treinamento dedicado"],
  },
];

const PricingPreview = () => {
  const navigate = useNavigate();

  return (
    <section id="planos" className="py-20 bg-muted/40">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          className="text-center mb-14"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">
            Planos para cada <span className="text-primary">momento</span> do seu negócio
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.12, duration: 0.5 }}
              className={`relative bg-background rounded-2xl p-8 border transition-all duration-300 hover:shadow-lg ${
                plan.popular ? "border-primary shadow-md scale-[1.02]" : "border-border"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-4 py-1 rounded-full">
                  Mais popular
                </div>
              )}
              <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl mb-4 ${plan.popular ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                {plan.icon}
              </div>
              <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
              <div className="mt-2 mb-6">
                <span className="text-3xl font-bold text-foreground">R$ {plan.price}</span>
                <span className="text-sm text-muted-foreground">/mês</span>
              </div>
              <ul className="space-y-3 mb-8">
                {plan.features.map((f, fi) => (
                  <li key={fi} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check size={14} className="text-primary flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => navigate("/pricing")}
                variant={plan.popular ? "default" : "outline"}
                className="w-full rounded-xl"
              >
                Ver detalhes
              </Button>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PricingPreview;
