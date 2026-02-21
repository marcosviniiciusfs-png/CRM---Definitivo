import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import kairozLogo from "@/assets/kairoz-logo-red.png";
import LandingNavbar from "@/components/landing/LandingNavbar";
import HeroSection from "@/components/landing/HeroSection";
import PainPointsSection from "@/components/landing/PainPointsSection";
import SolutionSection from "@/components/landing/SolutionSection";
import FeaturesTabsSection from "@/components/landing/FeaturesTabsSection";
import StatsSection from "@/components/landing/StatsSection";
import PricingPreview from "@/components/landing/PricingPreview";
import FAQSection from "@/components/landing/FAQSection";
import LandingFooter from "@/components/landing/LandingFooter";

const Landing = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <img src={kairozLogo} alt="KairoZ" className="h-16 animate-pulse" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNavbar />
      <HeroSection />
      <PainPointsSection />
      <SolutionSection />
      <FeaturesTabsSection />
      <StatsSection />
      <PricingPreview />
      <FAQSection />
      <LandingFooter />
    </div>
  );
};

export default Landing;
