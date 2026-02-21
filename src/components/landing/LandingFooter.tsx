import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import kairozLogo from "@/assets/kairoz-logo-red.png";

const LandingFooter = () => {
  const navigate = useNavigate();

  return (
    <>
      {/* CTA Final */}
      <section className="py-20 bg-gradient-to-br from-primary to-primary/80">
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
              Pronto para organizar suas vendas?
            </h2>
            <p className="text-primary-foreground/80 mb-8 max-w-md mx-auto">
              Comece agora e veja a diferença que um CRM de verdade faz na sua equipe.
            </p>
            <Button
              size="lg"
              onClick={() => navigate("/auth")}
              className="bg-background text-primary hover:bg-background/90 rounded-full px-10 h-12 text-base gap-2 font-semibold"
            >
              Começar agora <ArrowRight size={18} />
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 border-t border-border bg-background">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <img src={kairozLogo} alt="KairoZ" className="h-7 object-contain" />
          <div className="flex gap-6">
            <button onClick={() => navigate("/privacy-policy")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Política de Privacidade
            </button>
            <button onClick={() => navigate("/terms-of-service")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Termos de Uso
            </button>
          </div>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} KairoZ. Todos os direitos reservados.</p>
        </div>
      </footer>
    </>
  );
};

export default LandingFooter;
