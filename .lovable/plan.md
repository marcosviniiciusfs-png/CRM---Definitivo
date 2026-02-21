

# Redesign da Landing Page - Foco no CRM e Gestao de Vendas

## Direcionamento

O WhatsApp sera mencionado apenas uma vez, de forma discreta, em uma secao secundaria como "integracao disponivel". O foco principal sera nas capacidades do CRM: gestao de leads, funil de vendas, controle de equipe, metricas financeiras e produtividade.

## Estrutura da Pagina (10 secoes)

### 1. Navbar fixa
- Logo KairoZ a esquerda
- Links: Funcionalidades | Planos
- Botoes: "Entrar" (outline) | "Comecar gratis" (vermelho)
- Efeito: backdrop-blur ao rolar a pagina

### 2. Hero Section
- Titulo: "O CRM que sua equipe de vendas precisa para **vender mais**"
- Subtitulo: "Gerencie leads, controle seu funil de vendas, acompanhe metas e comissoes da sua equipe - tudo em um so lugar."
- Botoes: "Comecar agora" + "Ver funcionalidades"
- Ilustracao SVG: personagem cartoon ao lado de um dashboard com graficos e funil
- Animacao: textos sobem com fade-in, ilustracao entra com scale

### 3. Faixa de confianca
- "Tudo que voce precisa para gerenciar suas vendas"
- Icones: Pipeline | Equipes | Metricas | Automacoes | Tarefas (icones SVG simples, nao logos de terceiros)

### 4. Secao "Problemas" (3 cards animados)
- "Leads se perdem sem acompanhamento"
- "Sem visao clara do funil de vendas"
- "Equipe sem metas e controle de resultados"
- Cada card com ilustracao SVG cartoon e animacao stagger

### 5. Secao "Solucoes" (layout alternado com ilustracoes)
Tres blocos, imagem + texto alternando lados:

**Bloco 1 - Pipeline Visual**
- "Arraste e organize seus leads em etapas personalizadas do funil"
- Ilustracao: funil com cards sendo movidos

**Bloco 2 - Gestao de Equipe e Comissoes**
- "Acompanhe a performance de cada vendedor, defina metas e gerencie comissoes automaticamente"
- Ilustracao: personagens em podio com graficos

**Bloco 3 - Metricas e Dashboard Financeiro**
- "Receita do mes, ticket medio, taxa de conversao e ranking de vendedores em tempo real"
- Ilustracao: dashboard com graficos e numeros

### 6. Abas de Funcionalidades
- Tabs interativas: **Leads** | **Pipeline** | **Equipes** | **Automacoes**
- Cada tab mostra descricao + ilustracao SVG
- Transicao animada entre tabs
- WhatsApp aparece aqui APENAS como sub-item dentro da tab "Leads": "Integracao com WhatsApp disponivel em breve"

### 7. Numeros/Metricas animados
- 4 contadores:
  - "Funis personalizaveis"
  - "3x Mais produtividade"
  - "Gestao completa de equipe"
  - "Metricas em tempo real"

### 8. Preview de Planos
- 3 cards: Star (R$197) | Pro (R$497) | Elite (R$1.970)
- Pro destacado como popular
- Botao "Ver detalhes" vai para /pricing

### 9. FAQ (Accordion)
- "O que e o KairoZ?"
- "Preciso instalar algo?"
- "Posso testar antes de assinar?"
- "Quantos colaboradores posso ter?"
- "Tem integracao com WhatsApp?" (resposta: "Sim, a integracao com WhatsApp esta sendo preparada e estara disponivel em breve.")

### 10. CTA Final + Footer
- Fundo gradiente vermelho
- "Pronto para organizar suas vendas?"
- Botao grande
- Footer com links de Privacidade e Termos

## Visual e Animacoes

- **Fundo**: Branco/claro (sem StarsBackground preto)
- **Cores**: Vermelho KairoZ para CTAs e destaques, cinza para textos
- **Ilustracoes**: SVG inline cartunizados com personagens simplificados (sem rostos detalhados), elementos de funil, graficos e dashboards flutuando
- **Framer Motion**: fade-in + translateY no hero, stagger nos cards, whileInView nas secoes, contadores animados, crossfade nas tabs
- **Responsivo**: mobile-first, hero empilhado no mobile, 3 colunas no desktop

## Arquivos

| Arquivo | Acao |
|---------|------|
| `src/pages/Landing.tsx` | Reescrever - montar todas as secoes |
| `src/components/landing/LandingNavbar.tsx` | Criar |
| `src/components/landing/HeroSection.tsx` | Criar |
| `src/components/landing/PainPointsSection.tsx` | Criar |
| `src/components/landing/SolutionSection.tsx` | Criar |
| `src/components/landing/FeaturesTabsSection.tsx` | Criar |
| `src/components/landing/StatsSection.tsx` | Criar |
| `src/components/landing/PricingPreview.tsx` | Criar |
| `src/components/landing/FAQSection.tsx` | Criar |
| `src/components/landing/LandingFooter.tsx` | Criar |
| `src/components/landing/illustrations.tsx` | Criar - SVGs cartunizados |

## Mencao ao WhatsApp

O WhatsApp aparece em apenas dois lugares discretos:
1. Na aba "Leads" da secao de funcionalidades: "Integracao com WhatsApp disponivel em breve"
2. No FAQ: resposta a pergunta sobre WhatsApp

Em nenhum momento o WhatsApp aparece no Hero, nos titulos principais ou como funcionalidade destaque.

