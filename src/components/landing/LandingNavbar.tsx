import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import kairozLogo from "@/assets/kairoz-logo-red.png";

const LandingNavbar = () => {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMenuOpen(false);
  };

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-background/80 backdrop-blur-lg shadow-sm border-b border-border" : "bg-transparent"
      }`}
    >
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <img src={kairozLogo} alt="KairoZ" className="h-8 md:h-10 object-contain" />

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-6">
          <button onClick={() => scrollTo("funcionalidades")} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Funcionalidades
          </button>
          <button onClick={() => scrollTo("planos")} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Planos
          </button>
          <Button variant="outline" size="sm" onClick={() => navigate("/auth")}>
            Entrar
          </Button>
          <Button size="sm" onClick={() => navigate("/auth")}>
            Começar grátis
          </Button>
        </div>

        {/* Mobile toggle */}
        <button className="md:hidden text-foreground" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden bg-background border-b border-border px-4 pb-4 flex flex-col gap-3"
        >
          <button onClick={() => scrollTo("funcionalidades")} className="text-sm font-medium text-muted-foreground py-2">Funcionalidades</button>
          <button onClick={() => scrollTo("planos")} className="text-sm font-medium text-muted-foreground py-2">Planos</button>
          <Button variant="outline" size="sm" onClick={() => navigate("/auth")} className="w-full">Entrar</Button>
          <Button size="sm" onClick={() => navigate("/auth")} className="w-full">Começar grátis</Button>
        </motion.div>
      )}
    </motion.nav>
  );
};

export default LandingNavbar;
