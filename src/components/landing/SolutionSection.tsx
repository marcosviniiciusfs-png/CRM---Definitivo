import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { PipelineIllustration, TeamIllustration, DashboardIllustration } from "./illustrations";

const solutions = [
  {
    title: "Pipeline Visual",
    subtitle: "Arraste e organize seus leads em etapas personalizadas do funil",
    features: [
      "Funis 100% personalizáveis",
      "Drag & drop intuitivo",
      "Valores e previsão de receita por etapa",
      "Histórico de movimentação",
    ],
    illustration: <PipelineIllustration />,
  },
  {
    title: "Gestão de Equipe e Comissões",
    subtitle: "Acompanhe a performance de cada vendedor e gerencie comissões",
    features: [
      "Ranking de vendedores em tempo real",
      "Metas individuais e por equipe",
      "Cálculo automático de comissões",
      "Controle de permissões por cargo",
    ],
    illustration: <TeamIllustration />,
  },
  {
    title: "Métricas e Dashboard Financeiro",
    subtitle: "Receita, ticket médio, conversão e ranking — tudo em tempo real",
    features: [
      "Dashboard com visão completa",
      "Relatórios de receita mensal",
      "Taxa de conversão por etapa",
      "Previsão de faturamento",
    ],
    illustration: <DashboardIllustration />,
  },
];

const SolutionSection = () => (
  <section className="py-20">
    <div className="container mx-auto px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        className="text-center mb-16"
      >
        <h2 className="text-3xl md:text-4xl font-bold text-foreground">
          O que você <span className="text-primary">ganha</span> com o KairoZ
        </h2>
      </motion.div>

      <div className="space-y-24 max-w-6xl mx-auto">
        {solutions.map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: i % 2 === 0 ? -40 : 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className={`grid md:grid-cols-2 gap-10 items-center ${i % 2 === 1 ? "md:direction-rtl" : ""}`}
          >
            <div className={`${i % 2 === 1 ? "md:order-2" : ""}`}>
              <h3 className="text-2xl font-bold text-foreground mb-3">{s.title}</h3>
              <p className="text-muted-foreground mb-6">{s.subtitle}</p>
              <ul className="space-y-3">
                {s.features.map((f, fi) => (
                  <li key={fi} className="flex items-center gap-3 text-sm text-foreground">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Check size={12} className="text-primary" />
                    </div>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className={`${i % 2 === 1 ? "md:order-1" : ""}`}>
              {s.illustration}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

export default SolutionSection;
