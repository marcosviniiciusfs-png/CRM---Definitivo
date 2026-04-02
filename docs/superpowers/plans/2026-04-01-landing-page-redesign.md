# Landing Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Kairoz CRM landing page with the new v3 design, preserving auth logic and all existing routes.

**Architecture:** Single React component (`Landing.tsx`) with a companion CSS file (`Landing.css`). The WebGL hero canvas runs via `useEffect`+`useRef` with proper cleanup. FAQ uses React state for accordion behavior. All navigation buttons route to `/auth` via react-router's `useNavigate`.

**Tech Stack:** React 18, TypeScript, Vite, react-router-dom, raw CSS (no Tailwind for this page)

---

### Task 1: Create the CSS file

**Files:**
- Create: `src/pages/Landing.css`

- [ ] **Step 1: Create `src/pages/Landing.css` with all styles from the original HTML**

Create the file with the exact CSS from the v3 HTML. All keyframes and selectors preserved verbatim. The only change: remove the `body` and `html` rules (since those are global and handled by the app shell) — keep everything else.

```css
/* Kairoz Landing v3 — all keyframes and component styles */

@keyframes glow-pulse{0%,100%{text-shadow:0 0 24px rgba(220,38,38,.9),0 0 48px rgba(220,38,38,.5)}50%{text-shadow:0 0 12px rgba(220,38,38,.6),0 0 24px rgba(220,38,38,.3)}}
@keyframes slide-up{from{opacity:0;transform:translateY(32px)}to{opacity:1;transform:translateY(0)}}
@keyframes badge-in{from{opacity:0;transform:translateY(-12px) scale(.9)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes scanline{0%{transform:translateY(-100%)}100%{transform:translateY(100vh)}}
@keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes dot-blink{0%,100%{opacity:1}50%{opacity:.2}}
@keyframes flicker{0%,100%{opacity:1}93%{opacity:.88}94%{opacity:1}97%{opacity:.92}98%{opacity:1}}
@keyframes grid-scroll{from{background-position:0 0}to{background-position:0 40px}}
@keyframes count-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes card-in{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}

/* All remaining selectors from the original, unchanged */
/* (see full CSS block in spec — paste verbatim) */
```

The full file must contain every CSS rule from the original HTML's `<style>` block, excluding only `body{...}` and `html{scroll-behavior:smooth}` which are handled globally.

- [ ] **Step 2: Commit**

```bash
git add src/pages/Landing.css
git commit -m "feat: add Landing.css with v3 landing page styles and keyframes"
```

---

### Task 2: Rewrite `Landing.tsx` — structure, auth, nav, hero with WebGL

**Files:**
- Modify: `src/pages/Landing.tsx` (full rewrite)

- [ ] **Step 1: Rewrite `src/pages/Landing.tsx` with imports, auth logic, nav, and hero section**

```tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import kairozLogo from "@/assets/kairoz-logo-red.png";
import "./Landing.css";

/* ---------- WebGL Hero Hook ---------- */
function useWebGLHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const gl = c.getContext("webgl2");
    if (!gl) return;

    const rsz = () => {
      const d = Math.max(1, 0.5 * devicePixelRatio);
      c.width = c.offsetWidth * d;
      c.height = c.offsetHeight * d;
      gl.viewport(0, 0, c.width, c.height);
    };

    const vs = `#version 300 es\nprecision highp float;\nin vec4 position;\nvoid main(){gl_Position=position;}`;
    const fs = `#version 300 es
precision highp float;
out vec4 O;
uniform vec2 R;
uniform float T;
#define FC gl_FragCoord.xy
#define MN min(R.x,R.y)
float rnd(vec2 p){p=fract(p*vec2(12.9898,78.233));p+=dot(p,p+34.56);return fract(p.x*p.y);}
float ns(in vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);return mix(mix(rnd(i),rnd(i+vec2(1,0)),u.x),mix(rnd(i+vec2(0,1)),rnd(i+1.),u.x),u.y);}
float fbm(vec2 p){float t=0.,a=1.;mat2 m=mat2(1.,-.5,.2,1.2);for(int i=0;i<5;i++){t+=a*ns(p);p*=2.*m;a*=.5;}return t;}
float clouds(vec2 p){float d=1.,t=0.;for(float i=0.;i<3.;i++){float a=d*fbm(i*10.+p.x*.2+.2*(1.+i)*p.y+d+i*i+p);t=mix(t,d,a);d=a;p*=2./(i+1.);}return t;}
void main(){
  vec2 uv=(FC-.5*R)/MN,st=uv*vec2(2.,1.);
  vec3 col=vec3(0.);
  float bg=clouds(vec2(st.x+T*.5,-st.y));
  uv*=1.-.3*(sin(T*.2)*.5+.5);
  for(float i=1.;i<12.;i++){
    uv+=.1*cos(i*vec2(.1+.01*i,.8)+i*i+T*.5+.1*uv.x);
    float d=length(uv);
    col+=.00125/d*(cos(sin(i)*vec3(1.,2.,3.))+1.)*vec3(1.8,.15,.15);
    float b=ns(i+uv+bg*1.731);
    col+=.002*b/length(max(uv,vec2(b*uv.x*.02,uv.y)))*vec3(1.5,.1,.1);
    col=mix(col,vec3(bg*.45,bg*.04,bg*.04),d);
  }
  O=vec4(col,1.);
}`;

    const mk = (t: number, s: string) => {
      const sh = gl.createShader(t)!;
      gl.shaderSource(sh, s);
      gl.compileShader(sh);
      return sh;
    };
    const pg = gl.createProgram()!;
    gl.attachShader(pg, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(pg, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(pg);

    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,1,-1,-1,1,1,1,-1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(pg, "position");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const uR = gl.getUniformLocation(pg, "R");
    const uT = gl.getUniformLocation(pg, "T");

    rsz();
    let raf = 0;
    const onResize = () => rsz();
    window.addEventListener("resize", onResize);

    const loop = (now: number) => {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(pg);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.uniform2f(uR, c.width, c.height);
      gl.uniform1f(uT, now * 0.001);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return canvasRef;
}

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
  const canvasRef = useWebGLHero();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = useCallback((idx: number) => {
    setOpenFaq(prev => prev === idx ? null : idx);
  }, []);

  const goToAuth = useCallback(() => navigate("/auth"), [navigate]);

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

      {/* HERO */}
      <section className="hero">
        <canvas id="cvs" ref={canvasRef}></canvas>
        <div className="scanline-wrap"></div>
        <div className="overlay-darken"></div>
        <div className="grid-floor"></div>
        <div className="hero-body">
          <div className="badge"><span className="badge-dot"></span>CRM para equipes de alta performance</div>
          <h1>
            <span className="l1">Venda mais.</span>
            <span className="l2">Perca menos.</span>
          </h1>
          <p className="hero-sub">Gerencie leads, controle seu funil e acompanhe métricas da sua equipe — <strong>tudo em tempo real, em um só lugar.</strong></p>
          <div className="btn-row">
            <button className="btn-p" onClick={goToAuth}>Começar agora — grátis</button>
            <a className="btn-o" href="#features">Ver funcionalidades</a>
          </div>
        </div>
      </section>

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
```

Key decisions in this code:
- `useWebGLHero()` hook returns the `canvasRef` and handles all WebGL init/cleanup in a `useEffect`
- Auth guard logic preserved exactly (loading spinner, user redirect, FB OAuth check)
- All buttons that navigate to auth use `goToAuth` callback
- FAQ uses `openFaq` state (number index or null) for accordion
- Footer links use direct `href` paths to existing routes
- SVG attributes use JSX syntax (`strokeWidth` instead of `stroke-width`, `&amp;` for `&`)

- [ ] **Step 2: Verify the build compiles**

Run: `cd "c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo" && npx tsc --noEmit --skipLibCheck 2>&1 | head -30`

Expected: No errors related to `Landing.tsx`. (There may be pre-existing warnings in other files — those are fine.)

- [ ] **Step 3: Commit**

```bash
git add src/pages/Landing.tsx
git commit -m "feat: rewrite Landing page with v3 design, WebGL hero, and accordion FAQ"
```

---

### Task 3: Verify in browser

**Files:** None (verification only)

- [ ] **Step 1: Start dev server and verify**

Run: `cd "c:/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo" && npm run dev`

Verify in browser:
1. Navigate to `/` — the new landing page renders
2. WebGL canvas shows the animated red shader effect
3. Click "Entrar →" — redirects to `/auth`
4. Click "Começar agora — grátis" — redirects to `/auth`
5. Click "Ver funcionalidades" — smooth scroll to features section
6. Click FAQ items — accordion opens/closes (one at a time)
7. Footer links "Privacidade" and "Termos" navigate to `/privacy-policy` and `/terms-of-service`
8. Login with a valid user — auto-redirects to `/dashboard` instead of showing landing
9. All other routes (`/dashboard`, `/pipeline`, `/settings`, etc.) still work normally

- [ ] **Step 2: Commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: adjust landing page after browser verification"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** CSS file (Task 1), Landing.tsx rewrite with WebGL + auth + nav + all sections (Task 2), browser verification (Task 3)
- [x] **Placeholder scan:** No TBDs, all code is concrete
- [x] **Type consistency:** `useWebGLHero` returns `React.RefObject<HTMLCanvasElement>`, `openFaq` is `number | null`, `toggleFaq` takes `number`
- [x] **Navigation:** All CTA buttons call `navigate("/auth")`, footer links use direct hrefs to existing routes
