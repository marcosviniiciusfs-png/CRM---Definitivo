import { motion } from "framer-motion";
import { GitBranch, Zap, UsersRound, BarChart3 } from "lucide-react";

const stats = [
  { icon: <GitBranch size={28} />, label: "Funis personalizáveis", value: "Ilimitados" },
  { icon: <Zap size={28} />, label: "Mais produtividade", value: "3x" },
  { icon: <UsersRound size={28} />, label: "Gestão completa de equipe", value: "Total" },
  { icon: <BarChart3 size={28} />, label: "Métricas em tempo real", value: "24/7" },
];

const StatsSection = () => (
  <section className="py-20">
    <div className="container mx-auto px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto"
      >
        {stats.map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1, duration: 0.4 }}
            className="text-center p-6"
          >
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary mb-4">
              {s.icon}
            </div>
            <div className="text-3xl md:text-4xl font-bold text-foreground mb-1">{s.value}</div>
            <div className="text-sm text-muted-foreground">{s.label}</div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  </section>
);

export default StatsSection;
