import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";
import { HeroIllustration } from "./illustrations";

const HeroSection = () => {
  const navigate = useNavigate();

  return (
    <section className="pt-28 pb-20 md:pt-36 md:pb-28">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Text */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight text-foreground">
              O CRM que sua equipe de vendas precisa para{" "}
              <span className="text-primary">vender mais</span>
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-lg">
              Gerencie leads, controle seu funil de vendas, acompanhe metas e comissões da sua equipe — tudo em um só lugar.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Button size="lg" onClick={() => navigate("/auth")} className="gap-2 rounded-full px-8 h-12 text-base">
                Começar agora <ArrowRight size={18} />
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => document.getElementById("funcionalidades")?.scrollIntoView({ behavior: "smooth" })}
                className="gap-2 rounded-full px-8 h-12 text-base"
              >
                <Play size={16} /> Ver funcionalidades
              </Button>
            </div>
          </motion.div>

          {/* Illustration */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
            className="flex justify-center"
          >
            <div className="w-full max-w-md">
              <HeroIllustration />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
