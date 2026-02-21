import { motion } from "framer-motion";
import { LostLeadsIcon, BrokenFunnelIcon, DisorganizedTeamIcon } from "./illustrations";

const painPoints = [
  {
    icon: <LostLeadsIcon />,
    title: "Leads se perdem sem acompanhamento",
    description: "Sem um sistema centralizado, contatos importantes escapam e oportunidades de venda são desperdiçadas.",
  },
  {
    icon: <BrokenFunnelIcon />,
    title: "Sem visão clara do funil de vendas",
    description: "Você não sabe em que etapa cada negociação está, nem quais precisam de atenção urgente.",
  },
  {
    icon: <DisorganizedTeamIcon />,
    title: "Equipe sem metas e controle",
    description: "Sem métricas claras, é impossível saber quem está performando bem e quem precisa de apoio.",
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.15 } },
};

const item = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

const PainPointsSection = () => (
  <section className="py-20 bg-muted/40">
    <div className="container mx-auto px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        className="text-center mb-14"
      >
        <h2 className="text-3xl md:text-4xl font-bold text-foreground">
          Esses <span className="text-primary">problemas</span> estão custando suas vendas
        </h2>
      </motion.div>

      <motion.div
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-60px" }}
        className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto"
      >
        {painPoints.map((p, i) => (
          <motion.div
            key={i}
            variants={item}
            className="bg-background rounded-2xl p-8 border border-border shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-300"
          >
            <div className="mb-5">{p.icon}</div>
            <h3 className="text-lg font-semibold text-foreground mb-2">{p.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{p.description}</p>
          </motion.div>
        ))}
      </motion.div>
    </div>
  </section>
);

export default PainPointsSection;
