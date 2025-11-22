import { StarsBackground } from "@/components/ui/stars-background";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import kairozLogo from "@/assets/kairoz-logo.png";
import individualGif from "@/assets/individual.gif";
import checkBoardGif from "@/assets/check_board.gif";
import AnimatedChatIcon from "@/components/AnimatedChatIcon";

const Landing = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const handleStartClick = () => {
    if (user) {
      navigate('/dashboard');
    } else {
      navigate('/auth');
    }
  };

  const features = [
    {
      icon: null,
      type: 'gif',
      gifSrc: individualGif,
      title: "Captura Imediata de Leads",
      description: "Todos os contatos do WhatsApp são automaticamente registrados como leads no seu CRM"
    },
    {
      icon: null,
      type: 'animated',
      title: "Histórico e Contexto",
      description: "Acesse todo o histórico de conversas e informações do cliente em um só lugar"
    },
    {
      icon: null,
      type: 'gif',
      gifSrc: checkBoardGif,
      title: "Organização e Produtividade",
      description: "Gerencie seu funil de vendas e tarefas com eficiência máxima"
    }
  ];

  return (
    <StarsBackground className="min-h-screen bg-black text-white" speed={30} factor={0.08} starColor="#22d3ee">
      <div className="container mx-auto px-4 py-12">
        {/* Logo */}
        <div className="flex justify-center mb-16">
          <img 
            src={kairozLogo} 
            alt="KairoZ Logo" 
            className="h-16 md:h-20 object-contain"
          />
        </div>

        {/* Hero Section */}
        <div className="text-center mb-20">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-cyan-400 to-teal-500 bg-clip-text text-transparent">
            Sua Central de Gestão de
            <br />
            Clientes e WhatsApp
          </h1>
          <p className="text-lg md:text-xl text-gray-300 max-w-3xl mx-auto">
            Transforme mensagens em vendas: O CRM que une a potência do WhatsApp com a organização do seu funil de vendas.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-20 max-w-6xl mx-auto">
          {features.map((feature, index) => (
            <div 
              key={index}
              className="group p-6 rounded-xl border border-cyan-500/20 bg-gray-900/50 backdrop-blur-sm hover:border-cyan-500/40 hover:bg-gray-900/70 transition-all duration-300"
            >
              <div className="flex justify-center mb-4">
                {feature.type === 'lucide' && feature.icon ? (
                  <feature.icon className="w-16 h-16 text-cyan-400" />
                ) : feature.type === 'gif' && feature.gifSrc ? (
                  <img src={feature.gifSrc} alt={feature.title} className="w-16 h-16 object-contain" />
                ) : (
                  <AnimatedChatIcon />
                )}
              </div>
              <h3 className="text-xl font-semibold mb-3 text-center">
                {feature.title}
              </h3>
              <p className="text-gray-400 text-center text-sm">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* About Section */}
        <div className="max-w-4xl mx-auto mb-16">
          <h2 className="text-3xl font-bold mb-6">O que é o KairoZ?</h2>
          <p className="text-gray-300 leading-relaxed mb-8">
            O KairoZ é mais do que um CRM tradicional, é uma plataforma de Gestão de Relacionamento com o Cliente 
            (Customer Relationship Management) desenvolvida especificamente para o ambiente de conversação rápida. Ele 
            centraliza toda a comunicação do seu negócio, permitindo que você capture novos Leads que chegam pelo 
            WhatsApp e gerencie essas conversas e o funil de vendas em um único lugar.
          </p>

          <h2 className="text-3xl font-bold mb-6">Quem Deve Usar o KairoZ?</h2>
          <p className="text-gray-300 leading-relaxed">
            O KairoZ é ideal para pequenas e médias empresas (PMEs) e equipes de vendas que recebem um alto volume de 
            contato inicial pelo WhatsApp, precisam converter contatos de mídias sociais e valorizam a agilidade no 
            atendimento.
          </p>
        </div>

        {/* CTA Button */}
        <div className="flex justify-center">
          <Button 
            onClick={handleStartClick}
            size="lg"
            className="bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-600 hover:to-teal-600 text-white text-lg px-12 py-6 h-auto rounded-full shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 transition-all duration-300"
          >
            Começar agora
          </Button>
        </div>
      </div>
    </StarsBackground>
  );
};

export default Landing;
