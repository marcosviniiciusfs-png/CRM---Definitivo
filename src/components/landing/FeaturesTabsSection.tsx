import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, GitBranch, UsersRound, Zap } from "lucide-react";
import { LeadsTabIllustration, PipelineIllustration, TeamIllustration, AutomationTabIllustration } from "./illustrations";

const tabs = [
  {
    id: "leads",
    label: "Leads",
    icon: <Users size={18} />,
    title: "Gerencie todos os seus leads em um só lugar",
    description: "Cadastre, organize e acompanhe cada lead do primeiro contato ao fechamento. Filtre por etapa, responsável, origem e muito mais.",
    note: "Integração com WhatsApp disponível em breve",
    illustration: <LeadsTabIllustration />,
  },
  {
    id: "pipeline",
    label: "Pipeline",
    icon: <GitBranch size={18} />,
    title: "Funil de vendas visual e personalizável",
    description: "Crie etapas customizadas, arraste leads entre fases e tenha visão clara de onde cada negociação está. Defina valores e previsões por etapa.",
    illustration: <PipelineIllustration />,
  },
  {
    id: "equipes",
    label: "Equipes",
    icon: <UsersRound size={18} />,
    title: "Controle completo da sua equipe comercial",
    description: "Defina metas, acompanhe performance, gerencie comissões e distribua leads automaticamente entre seus vendedores.",
    illustration: <TeamIllustration />,
  },
  {
    id: "automacoes",
    label: "Automações",
    icon: <Zap size={18} />,
    title: "Automatize tarefas repetitivas",
    description: "Crie regras automáticas para mover leads, atribuir responsáveis, enviar notificações e muito mais — sem código.",
    illustration: <AutomationTabIllustration />,
  },
];

const FeaturesTabsSection = () => {
  const [active, setActive] = useState("leads");
  const currentTab = tabs.find((t) => t.id === active)!;

  return (
    <section id="funcionalidades" className="py-20 bg-muted/40">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">
            Funcionalidades que <span className="text-primary">impulsionam</span> suas vendas
          </h2>
        </motion.div>

        {/* Tab buttons */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex gap-1 p-1 bg-background rounded-xl border border-border shadow-sm">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActive(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  active === tab.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.3 }}
            className="grid md:grid-cols-2 gap-10 items-center max-w-5xl mx-auto"
          >
            <div>
              <h3 className="text-2xl font-bold text-foreground mb-4">{currentTab.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{currentTab.description}</p>
              {currentTab.note && (
                <p className="mt-4 text-xs text-muted-foreground/70 italic">{currentTab.note}</p>
              )}
            </div>
            <div>{currentTab.illustration}</div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
};

export default FeaturesTabsSection;
