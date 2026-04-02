import { useState, useCallback } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import kairozLogo from "@/assets/kairoz-logo-red.png";
import Hero from "@/components/ui/animated-shader-hero";
import "./Landing.css";

/* ---------- FAQ Data ---------- */
const faqItems = [
  { q: "O que é o KairoZ?", a: "O KairoZ é um CRM focado em equipes de vendas. Centraliza gestão de leads, funil, metas, comissões e métricas em um único lugar — com integração nativa ao WhatsApp e em breve Instagram Direct." },
  { q: "Preciso instalar algo?", a: "Não! O KairoZ é 100% online. Basta criar sua conta e começar a usar diretamente pelo navegador, no computador ou celular." },
  { q: "Posso testar antes de assinar?", a: "Sim! Oferecemos acesso gratuito para que você conheça todas as funcionalidades essenciais antes de escolher um plano pago." },
  { q: "O WhatsApp já funciona?", a: "Sim! A integração com WhatsApp via Evolution API está totalmente ativa — receba e responda mensagens, envie áudios e mídias direto pelo chat do CRM." },
  { q: "Como funciona a distribuição de leads?", a: "O sistema de roleta distribui leads automaticamente entre os vendedores, respeitando regras de disponibilidade e capacidade configuradas pelo gestor." },
];

/* ---------- Component ---------- */
const Landing = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = useCallback((idx: number) => {
    setOpenFaq(prev => prev === idx ? null : idx);
  }, []);

  const goToAuth = useCallback(() => navigate("/auth"), [navigate]);

  const scrollToFeatures = useCallback(() => {
    document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <img src={kairozLogo} alt="KairoZ" className="h-16 animate-pulse" />
      </div>
    );
  }

  if (user && !loading) {
    const urlParams = new URLSearchParams(window.location.search);
    const hasFBOAuth = urlParams.has("facebook") || (urlParams.has("code") && urlParams.has("state"));
    if (hasFBOAuth) return <Navigate to={`/integrations${window.location.search}`} replace />;
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div style={{ background: "#000" }}>
      {/* NAV */}
      <nav>
        <div className="nav-logo">Kairoz<em>.</em></div>
        <div className="nav-links">
          <a className="nav-lnk" href="#dores">Problemas</a>
          <a className="nav-lnk" href="#features">Funcionalidades</a>
          <a className="nav-lnk" href="#integracoes">Integrações</a>
          <a className="nav-lnk" href="#faq">FAQ</a>
        </div>
        <button className="nav-btn" onClick={goToAuth}>Entrar →</button>
      </nav>

      {/* HERO — animated shader with red theme */}
      <Hero
        trustBadge={{
          text: "CRM para equipes de alta performance",
          icons: ["active"]
        }}
        headline={{
          line1: "Venda mais.",
          line2: "Perca menos."
        }}
        subtitle={'Gerencie leads, controle seu funil e acompanhe métricas da sua equipe — <strong>tudo em tempo real, em um só lugar.</strong>'}
        buttons={{
          primary: {
            text: "Começar agora — grátis",
            onClick: goToAuth
          },
          secondary: {
            text: "Ver funcionalidades",
            onClick: scrollToFeatures
          }
        }}
      />

      {/* TICKER */}
      <div className="ticker">
        <div className="ticker-inner">
          <span className="ti"><em>Leads</em> gerenciados <span className="ti-sep">///</span></span>
          <span className="ti"><em>Pipeline</em> visual kanban <span className="ti-sep">///</span></span>
          <span className="ti"><em>WhatsApp</em> integrado <span className="ti-sep">///</span></span>
          <span className="ti"><em>Instagram</em> Direct <span className="ti-sep">///</span></span>
          <span className="ti"><em>Facebook</em> Leads <span className="ti-sep">///</span></span>
          <span className="ti"><em>Metas</em> e comissões <span className="ti-sep">///</span></span>
          <span className="ti"><em>Distribuição</em> automática <span className="ti-sep">///</span></span>
          <span className="ti"><em>Métricas</em> em tempo real <span className="ti-sep">///</span></span>
          <span className="ti"><em>Leads</em> gerenciados <span className="ti-sep">///</span></span>
          <span className="ti"><em>Pipeline</em> visual kanban <span className="ti-sep">///</span></span>
          <span className="ti"><em>WhatsApp</em> integrado <span className="ti-sep">///</span></span>
          <span className="ti"><em>Instagram</em> Direct <span className="ti-sep">///</span></span>
          <span className="ti"><em>Facebook</em> Leads <span className="ti-sep">///</span></span>
          <span className="ti"><em>Metas</em> e comissões <span className="ti-sep">///</span></span>
          <span className="ti"><em>Distribuição</em> automática <span className="ti-sep">///</span></span>
          <span className="ti"><em>Métricas</em> em tempo real <span className="ti-sep">///</span></span>
        </div>
      </div>

      {/* STATS */}
      <div className="stats">
        <div className="stat"><span className="stat-v">3x</span><span className="stat-l">mais produtividade</span></div>
        <div className="stat"><span className="stat-v">∞</span><span className="stat-l">funis personalizáveis</span></div>
        <div className="stat"><span className="stat-v">24/7</span><span className="stat-l">métricas ao vivo</span></div>
        <div className="stat"><span className="stat-v">100%</span><span className="stat-l">online, sem instalar</span></div>
      </div>

      {/* DORES */}
      <div className="bg-alt" id="dores">
        <section className="sec">
          <span className="sec-tag">Problemas reais</span>
          <h2 className="sec-h">Esses problemas estão<br />custando suas vendas</h2>
          <p className="sec-p">Sem um sistema, leads escapam, o funil vira caos e sua equipe fica no escuro.</p>
          <div className="pain-grid">
            <div className="pc">
              <div className="pc-icon"><svg width="18" height="18" fill="none" stroke="#dc2626" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg></div>
              <div className="pc-h">Leads somem sem rastreamento</div>
              <div className="pc-p">Sem centralização, contatos importantes escapam e oportunidades são perdidas silenciosamente.</div>
            </div>
            <div className="pc">
              <div className="pc-icon"><svg width="18" height="18" fill="none" stroke="#dc2626" strokeWidth="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg></div>
              <div className="pc-h">Funil sem visibilidade</div>
              <div className="pc-p">Você não sabe em que etapa cada negociação está nem quais precisam de atenção urgente.</div>
            </div>
            <div className="pc">
              <div className="pc-icon"><svg width="18" height="18" fill="none" stroke="#dc2626" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg></div>
              <div className="pc-h">Equipe sem metas e controle</div>
              <div className="pc-p">Sem métricas claras, é impossível saber quem performa bem e quem precisa de apoio.</div>
            </div>
          </div>
        </section>
      </div>

      {/* FEATURES */}
      <section className="sec" id="features">
        <span className="sec-tag">Funcionalidades</span>
        <h2 className="sec-h">Tudo que sua equipe<br />precisa para vender</h2>
        <p className="sec-p">Pipeline, leads, automações e integrações numa plataforma construída para velocidade.</p>
        <div className="feat-grid">
          <div className="fc">
            <div className="fc-num">01</div>
            <div className="fc-tag">Gestão de leads</div>
            <div className="fc-h">Controle total de cada oportunidade</div>
            <div className="fc-p">Cadastre, organize e acompanhe leads do primeiro contato ao fechamento. Filtre por etapa, responsável e origem.</div>
            <div className="fc-badges"><span className="fcb">Filtros avançados</span><span className="fcb">Histórico</span><span className="fcb">Tags</span><span className="fcb">Importação CSV</span></div>
          </div>
          <div className="fc">
            <div className="fc-num">02</div>
            <div className="fc-tag">Pipeline Kanban</div>
            <div className="fc-h">Funil visual e totalmente personalizável</div>
            <div className="fc-p">Crie etapas customizadas, arraste leads entre fases e tenha visão clara de onde cada negociação está.</div>
            <div className="fc-badges"><span className="fcb">Drag &amp; drop</span><span className="fcb">Multi-funil</span><span className="fcb">Previsão</span></div>
          </div>
          <div className="fc">
            <div className="fc-num">03</div>
            <div className="fc-tag">Chat integrado</div>
            <div className="fc-h">WhatsApp e Instagram Direct no CRM</div>
            <div className="fc-p">Receba e responda mensagens sem sair da plataforma. Suporte a texto, áudio, imagens e documentos.</div>
            <div className="fc-badges"><span className="fcb">WhatsApp</span><span className="fcb">Instagram DM</span><span className="fcb">Áudio</span><span className="fcb">Mídia</span></div>
          </div>
          <div className="fc">
            <div className="fc-num">04</div>
            <div className="fc-tag">Equipe e metas</div>
            <div className="fc-h">Ranking, comissões e roleta automática</div>
            <div className="fc-p">Defina metas, acompanhe performance, calcule comissões e distribua leads automaticamente entre vendedores.</div>
            <div className="fc-badges"><span className="fcb">Ranking</span><span className="fcb">Roleta</span><span className="fcb">Comissões</span><span className="fcb">Metas</span></div>
          </div>
          <div className="fc">
            <div className="fc-num">05</div>
            <div className="fc-tag">Automações</div>
            <div className="fc-h">Regras automáticas sem código</div>
            <div className="fc-p">Crie gatilhos para mover leads, atribuir responsáveis e enviar notificações — automaticamente.</div>
            <div className="fc-badges"><span className="fcb">Gatilhos</span><span className="fcb">Ações</span><span className="fcb">Meta Forms</span></div>
          </div>
          <div className="fc">
            <div className="fc-num">06</div>
            <div className="fc-tag">Dashboard e métricas</div>
            <div className="fc-h">Relatórios em tempo real 24/7</div>
            <div className="fc-p">Previsão de vendas, ranking de vendedores, leads por fonte e calendário de atividades ao vivo.</div>
            <div className="fc-badges"><span className="fcb">Gráficos</span><span className="fcb">Forecast</span><span className="fcb">Ads insights</span></div>
          </div>
        </div>
      </section>

      {/* INTEGRAÇÕES */}
      <div className="bg-alt" id="integracoes">
        <section className="sec">
          <span className="sec-tag">Integrações</span>
          <h2 className="sec-h">Conecte suas ferramentas<br />favoritas</h2>
          <p className="sec-p">WhatsApp, Facebook e mais — tudo sincronizado com o CRM.</p>
          <div className="int-row">
            <div className="ic">
              <div className="ic-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" /><path d="M12 0C5.373 0 0 5.373 0 12c0 2.1.547 4.07 1.504 5.782L0 24l6.395-1.682A11.942 11.942 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.006-1.369l-.359-.214-3.797.995.999-3.7-.234-.381A9.818 9.818 0 1 1 12 21.818z" /></svg>
              </div>
              <div className="ic-name">WhatsApp</div>
              <div className="ic-desc">Chat direto via Evolution API</div>
              <span className="ic-badge">Ativo</span>
            </div>
            <div className="ic">
              <div className="ic-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
              </div>
              <div className="ic-name">Facebook Leads</div>
              <div className="ic-desc">Leads de anúncios automáticos</div>
              <span className="ic-badge">Ativo</span>
            </div>
            <div className="ic soon">
              <div className="ic-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="rgba(255,255,255,.3)"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" /></svg>
              </div>
              <div className="ic-name">Instagram Direct</div>
              <div className="ic-desc">Responda DMs pelo CRM</div>
              <span className="ic-badge soon-badge">Em breve</span>
            </div>
          </div>
        </section>
      </div>

      {/* FAQ */}
      <section className="sec" id="faq">
        <span className="sec-tag">FAQ</span>
        <h2 className="sec-h">Perguntas frequentes</h2>
        <p className="sec-p">Dúvidas comuns antes de começar.</p>
        <div className="faq-list">
          {faqItems.map((item, idx) => (
            <div key={idx} className={`faq-item${openFaq === idx ? " open" : ""}`}>
              <button className="faq-q" onClick={() => toggleFaq(idx)}>
                {item.q}
                <span className="faq-icon">+</span>
              </button>
              <div className="faq-a">{item.a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div style={{ padding: "64px 0 0" }}>
        <div className="cta-block">
          <h2 className="cta-h">Pronto para organizar<br />suas vendas?</h2>
          <p className="cta-sub">Comece agora e veja a diferença que um CRM de verdade faz na sua equipe.</p>
          <button className="btn-p" style={{ fontSize: 15, padding: "16px 44px" }} onClick={goToAuth}>Criar conta grátis →</button>
        </div>
      </div>

      <div style={{ height: 64 }}></div>

      {/* FOOTER */}
      <footer>
        <div className="ft-logo">Kairoz<em>.</em></div>
        <div className="ft-links">
          <a className="ft-lnk" href="/privacy-policy">Privacidade</a>
          <a className="ft-lnk" href="/terms-of-service">Termos</a>
        </div>
        <div className="ft-copy">© 2025 KairoZ — todos os direitos reservados</div>
      </footer>
    </div>
  );
};

export default Landing;
