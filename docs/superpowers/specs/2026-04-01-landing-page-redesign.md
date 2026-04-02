# Landing Page Redesign — Kairoz CRM v3

## Objetivo
Substituir a landing page atual do CRM pela nova versão v3 (fornecida como HTML/CSS/JS puro), adaptando para a stack React + TypeScript do projeto.

## Stack do Projeto
- React 18 + TypeScript + Vite
- TailwindCSS + shadcn/ui + Framer Motion
- react-router-dom (lazy loading)
- Supabase (auth/backend)

## Abordagem

### CSS: arquivo separado
Criar `src/pages/Landing.css` com todo o CSS da landing v3, incluindo:
- Reset global scoped (via wrapper div)
- Todas as keyframes (glow-pulse, slide-up, badge-in, scanline, marquee, dot-blink, flicker, grid-scroll, count-in, card-in)
- Estilos dos componentes (nav, hero, ticker, stats, pain-grid, feat-grid, int-row, faq, cta, footer)
- Media queries responsivas

### Estrutura de arquivos
```
src/pages/
├── Landing.tsx          # Componente principal reescrito
├── Landing.css          # CSS com animações
```

### Navegação preservada
| Elemento | Ação |
|----------|------|
| Botão "Entrar →" (nav) | `navigate("/auth")` |
| Botão "Começar agora — grátis" | `navigate("/auth")` |
| Botão "Ver funcionalidades" | Scroll para #features |
| Botão "Criar conta grátis →" (CTA) | `navigate("/auth")` |
| Links âncora (nav) | Scroll suave nativo via href |
| Footer: Privacidade | `/privacy-policy` |
| Footer: Termos | `/terms-of-service` |

### Autenticação (lógica mantida)
- Loading → spinner com logo Kairoz
- Usuário logado → redirect `/dashboard` (ou `/integrations` se OAuth Facebook)
- Não logado → exibe landing page

### WebGL Hero
- Canvas `#cvs` com shader GLSL renderizado via `useEffect` + `useRef`
- Cleanup no return do useEffect (cancelAnimationFrame, removeEventListener resize)
- Respeita `devicePixelRatio` como no original

### FAQ Accordion
- Estado React (`useState`) para controlar item aberto
- Uma única FAQ aberta por vez (comportamento accordion)

### Componente único
Landing inteira em um único componente `Landing.tsx` porque:
- Landing e autocontida e nao reutiliza partes em outros lugares
- CSS e altamente especifico com seletores diretos
- Script WebGL precisa de inicializacao/cleanup no mesmo escopo

## Arquivos modificados
1. `src/pages/Landing.tsx` — reescrita completa
2. `src/pages/Landing.css` — novo arquivo

## Arquivos NAO modificados
- `src/App.tsx` — rota `/` continua apontando para `Landing`
- `src/components/landing/*` — nao serao deletados (podem ser removidos depois)
- `index.html` — sem alteracoes
- Todas as outras rotas permanecem intactas
