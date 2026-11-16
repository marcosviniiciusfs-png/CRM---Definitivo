---
version: alpha
name: KairoZ
description: "CRM de vendas para equipes que atendem pelo WhatsApp. A tela é quase toda neutra: fundo cinza muito claro (#F7F7F8), superfícies brancas, texto quase preto (#18181B) e bordas finas. O vermelho da marca (#E02932) é escasso de propósito: logo, o único botão principal de cada tela, o ícone do item ativo no menu e o contador de não lidas. Erro usa outro vermelho (#B42318), sempre com ícone. As etapas do funil aparecem só como um ponto de 8 px. Números usam dígitos tabulares. Tema escuro com neutros levemente azulados, nunca preto puro."

colors:
  brand: "#E02932"
  brand-hover: "#C91F28"
  brand-dark: "#E5383F"
  on-brand: "#FFFFFF"

  canvas: "#F7F7F8"
  surface: "#FFFFFF"
  surface-2: "#F1F1F3"
  surface-3: "#EAEAED"
  hairline: "#E4E4E7"
  hairline-strong: "#D4D4D8"
  ink: "#18181B"
  ink-2: "#3F3F46"
  muted: "#52525B"
  subtle: "#6B6B74"
  focus-ring: "rgba(24,24,27,.12)"

  danger: "#B42318"
  danger-tint: "#FEF3F2"
  warn: "#B54708"
  warn-tint: "#FFF6E0"
  ok: "#067647"
  ok-tint: "#ECFDF3"
  info: "#175CD3"
  info-tint: "#EFF6FF"

  dark-canvas: "#0B0B0D"
  dark-surface: "#141417"
  dark-surface-2: "#1B1B1F"
  dark-surface-3: "#26262C"
  dark-hairline: "#26262C"
  dark-hairline-strong: "#34343C"
  dark-ink: "#F4F4F5"
  dark-ink-2: "#D4D4D8"
  dark-muted: "#A1A1AA"
  dark-subtle: "#8B8B94"
  dark-danger: "#F97066"
  dark-warn: "#FDB022"
  dark-ok: "#47CD89"
  dark-info: "#53B1FD"

  stage-blue: "#3B82F6"
  stage-teal: "#14B8A6"
  stage-amber: "#F59E0B"
  stage-violet: "#8B5CF6"
  stage-green: "#16A34A"
  stage-gray: "#A1A1AA"

  chart-1: "#3F3F46"
  chart-2: "#3B82F6"
  chart-3: "#14B8A6"
  chart-4: "#F59E0B"
  chart-5: "#8B5CF6"
  chart-6: "#94A3B8"

typography:
  number-xl:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.02em
    fontFeature: tnum
  page-title:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.01em
  section-title:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  table:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: tnum
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.4
  group-label:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0.06em
    textTransform: uppercase
  button:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1
  mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5

rounded:
  sm: 6px
  md: 8px
  lg: 12px
  pill: 999px

spacing:
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  6: 24px
  8: 32px
  12: 48px

components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    height: 36px
    padding: 0 14px
  button-primary-hover:
    backgroundColor: "{colors.brand-hover}"
    textColor: "{colors.on-brand}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    border: "1px solid {colors.hairline}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    height: 36px
    padding: 0 12px
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    height: 36px
  button-destructive:
    backgroundColor: "{colors.danger}"
    textColor: "#FFFFFF"
    rounded: "{rounded.sm}"
    height: 36px
  text-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    border: "1px solid {colors.hairline-strong}"
    rounded: "{rounded.sm}"
    height: 36px
    padding: 0 12px
  text-input-focused:
    border: "1px solid {colors.ink}"
    shadow: "0 0 0 3px {colors.focus-ring}"
  text-input-error:
    border: "1px solid {colors.danger}"
    helperColor: "{colors.danger}"
  badge-reply:
    backgroundColor: "{colors.warn-tint}"
    textColor: "{colors.warn}"
    rounded: "{rounded.pill}"
    typography: "{typography.caption}"
  badge-late:
    backgroundColor: "{colors.danger-tint}"
    textColor: "{colors.danger}"
    rounded: "{rounded.pill}"
  badge-meeting:
    backgroundColor: "{colors.info-tint}"
    textColor: "{colors.info}"
    rounded: "{rounded.pill}"
  badge-won:
    backgroundColor: "{colors.ok-tint}"
    textColor: "{colors.ok}"
    rounded: "{rounded.pill}"
  unread-counter:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    rounded: "{rounded.pill}"
    fontSize: 11px
  filter-chip:
    backgroundColor: transparent
    textColor: "{colors.ink-2}"
    border: "1px dashed {colors.hairline-strong}"
    rounded: "{rounded.pill}"
    height: 32px
  stage-dot:
    size: 8px
    rounded: "{rounded.pill}"
  kanban-column:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.lg}"
    width: 284px
    padding: 8px
  lead-card:
    backgroundColor: "{colors.surface}"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.md}"
    padding: 12px
  sidebar:
    backgroundColor: "{colors.surface}"
    width: 232px
    borderRight: "1px solid {colors.hairline}"
  sidebar-item:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    height: 34px
  sidebar-item-active:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.ink}"
    iconColor: "{colors.brand}"
  kpi-card:
    backgroundColor: "{colors.surface}"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.md}"
    padding: 16px
    valueTypography: "{typography.number-xl}"
  alert-error:
    backgroundColor: "{colors.danger-tint}"
    textColor: "{colors.danger}"
    rounded: "{rounded.md}"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    shadow: "0 8px 24px rgba(0,0,0,.16)"
  bottom-nav:
    backgroundColor: "{colors.surface}"
    borderTop: "1px solid {colors.hairline}"
    height: 68px
  fab:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    size: 56px
    rounded: "{rounded.pill}"
---

# KairoZ: design system

Protótipo visual com as seis telas (diagnóstico, fundamentos, funil claro e escuro, dashboard e celular): artefato privado "KairoZ: redesenho visual" no claude.ai.

## Overview

O KairoZ é uma ferramenta de trabalho: o vendedor abre de manhã e fecha à noite. A interface precisa sumir e deixar aparecer o que pede ação: quem está esperando resposta, que tarefa atrasou, qual lead vale mais.

A identidade sai da tela de login: preto, branco e o vermelho do logo. Os neutros fazem quase todo o trabalho. O vermelho marca a marca e a ação principal, e só. Quanto menos ele aparece, mais pesa quando aparece.

Referências estudadas (repositório awesome-design-md e o curso OpenDesign): Linear (densidade e bordas finas), Intercom (inbox e contadores), Mercury e Stripe (números e tabelas), Raycast (atalhos e busca), PostHog (dashboards). Nenhuma foi copiada; delas saíram regras, não aparência.

## Colors

### Marca

- `brand` #E02932 aparece em quatro lugares: logo, o único botão principal da tela, o ícone do item ativo no menu e o contador de não lidas.
- Nunca em: fundo de seção, borda de foco, texto comum, gráfico, etapa do funil, erro, link.
- No tema escuro vira `brand-dark` #E5383F, um pouco mais claro para manter o contraste.

### Neutros

Escala fria do zinco. `canvas` é o fundo da página, `surface` é o cartão, `surface-2` é a coluna do funil e o fundo de grupo, `surface-3` é o hover e o item ativo. Texto em três pesos: `ink` (principal), `ink-2` (secundário), `muted` (legenda). `subtle` só para rótulo de grupo.

Nunca branco puro como fundo de página e nunca preto puro em lugar nenhum.

### Estados

| Estado | Texto | Fundo | Uso |
|---|---|---|---|
| Erro | `danger` #B42318 | `danger-tint` #FEF3F2 | campo inválido, tarefa atrasada, falha |
| Atenção | `warn` #B54708 | `warn-tint` #FFF6E0 | lead esperando resposta |
| Sucesso | `ok` #067647 | `ok-tint` #ECFDF3 | ganho, envio confirmado |
| Informação | `info` #175CD3 | `info-tint` #EFF6FF | reunião marcada, dica |

Erro nunca usa o vermelho da marca e sempre vem com ícone e texto, para não depender só da cor.

### Etapas do funil

Cor de etapa aparece só como um ponto de 8 px ao lado do nome. Coluna, cartão e cabeçalho ficam neutros. Seis cores fixas, atribuídas pela ordem da etapa: azul, verde-água, âmbar, violeta, verde (ganho) e cinza (perdido ou arquivado).

### Gráficos

A série principal é `chart-1` (neutro escuro). As outras seguem `chart-2` a `chart-6`. Vermelho e rosa ficam fora dos gráficos, porque ali significariam erro.

## Typography

### Família

Inter em todo o app, de 400 a 700. JetBrains Mono só para IDs, chaves e trechos técnicos.

### Hierarquia

| Papel | Tamanho/peso | Uso |
|---|---|---|
| `number-xl` | 32/600, tabular | valor de KPI |
| `page-title` | 24/600 | título da página |
| `section-title` | 16/600 | título de cartão e seção |
| `body` | 14/400 | texto corrido, formulário |
| `table` | 13/400, tabular | tabelas, cartões do funil |
| `caption` | 12/500 | hora, responsável, ajuda |
| `group-label` | 11/600, maiúsculas | grupo do menu |

### Regras

- Nada abaixo de 11 px.
- Maiúsculas só no rótulo de grupo.
- Valores, telefones, datas e porcentagens com `font-variant-numeric: tabular-nums`.
- Moeda sempre `R$ 8.900` (sem centavos no funil; com centavos em financeiro).

## Layout

### Espaço

Base de 4 px: 4, 8, 12, 16, 24, 32, 48. Dentro de componente, 8 a 12. Entre blocos, 16 a 24. Entre seções da página, 32.

### Estrutura do app

- Menu lateral de 232 px com rótulos e grupos (Vendas, Análise, Equipe), seletor de organização no topo, Integrações e Configurações no rodapé. Recolhe para 64 px só por escolha do usuário.
- Barra superior com busca global ("Buscar leads, conversas e tarefas", atalho Ctrl K), notificações e avatar.
- Cabeçalho da página: título, uma linha de resumo com números ("35 leads abertos · R$ 412 mil em negociação"), troca de visão (Quadro/Lista), "Mais" e um botão principal.
- Linha de filtros abaixo do cabeçalho. Filtros vazios usam borda tracejada; filtros aplicados mostram o valor.

### Funil

Colunas de 284 px em `surface-2`, raio 12, com ponto da etapa, nome, quantidade e total em R$. Cartão com nome e valor na primeira linha, detalhe (produto · origem) na segunda, no máximo um selo de estado e rodapé com responsável e tempo.

## Elevation & Depth

- Padrão: borda fina de 1 px (`hairline`), sem sombra.
- Sombra só para o que flutua: menu, popover, modal, toast, botão flutuante do celular.
- Cartão arrastado ganha sombra média e uma leve rotação; ao soltar, volta à borda.

## Shapes

| Raio | Uso |
|---|---|
| 6 px | botão, campo, item de menu |
| 8 px | cartão, KPI, alerta, toast |
| 12 px | painel, coluna do funil, modal |
| Pílula | selo, filtro, contador |

## Components

### Botões

- Principal (vermelho): um por tela. Se dois parecem principais, um deles é secundário.
- Secundário: branco com borda. É o padrão para quase tudo.
- Fantasma: só ícone ou texto, para ações de linha e barra de ferramentas.
- Destrutivo: `danger`, só dentro da confirmação, nunca na tela principal.
- Altura 36 px no desktop, 44 px de área de toque no celular.

### Campos

Altura 36, borda `hairline-strong`, foco com borda `ink` e anel neutro de 3 px. Erro com borda `danger` e mensagem abaixo, com ícone, dizendo como corrigir ("Use só números, como 8900.").

### Selos de estado do lead

Um selo por cartão, escolhido por prioridade: atrasada > responder > reunião > hoje > ganho. Texto curto com tempo quando ajuda: "Responder · 12 min", "Tarefa atrasada", "Reunião amanhã, 14:00".

### Fichas de atenção

Acima do funil: Responder, Atrasadas, Hoje, Sem tarefa, cada uma com contagem. Responder usa `warn`, Atrasadas usa `danger`, as outras são neutras. Clicar filtra o funil.

### Estado vazio

Ícone neutro, uma frase do que falta e uma ação secundária ("Nenhuma tarefa para este lead. Crie uma para lembrar o próximo contato." + "Criar tarefa").

### Avisos

Toast escuro para confirmação rápida (some em 4 s). Alerta com fundo `danger-tint` para erro que precisa de ação, com o que aconteceu e o que fazer.

## Do's and Don'ts

### Faça

- Um botão vermelho por tela, no máximo.
- Mostrar o número que importa no cabeçalho da página.
- Escrever rótulos com verbo e objeto ("Adicionar lead", "Criar tarefa"). Siga `docs/guia-de-escrita.md`.
- Usar ícones de traço (lucide) com 1,75 px de espessura, 16 a 20 px.
- Testar cada tela nos temas claro e escuro e em 390 px de largura.

### Não faça

- Pintar coluna, cartão ou cabeçalho com a cor da etapa.
- Usar o vermelho da marca para erro, foco ou gráfico.
- Usar outra cor de marca no celular (o botão "Mover" azul de hoje).
- Pôr ícone sobre o título da página.
- Usar emoji como ícone.
- Usar fundo preto puro no tema escuro.
- Criar mais de um dashboard para a mesma pergunta.

## Responsive Behavior

### Pontos de quebra

| Largura | Comportamento |
|---|---|
| < 768 px | navegação inferior, funil em abas por etapa, botão flutuante para adicionar |
| 768 a 1279 px | menu recolhido em 64 px, funil com rolagem horizontal |
| ≥ 1280 px | menu completo de 232 px |

### Celular

- Navegação inferior com quatro itens: Início, Funil, Chat (com contador) e Tarefas. O resto vai para o avatar.
- Funil em abas por etapa (pílula com ponto e contagem) e lista vertical de cartões. O mesmo cartão do desktop, com "Mover" secundário e, quando houver, "Responder" escuro.
- Botão flutuante vermelho de 56 px para adicionar lead, acima da navegação.
- Área de toque mínima de 44 px.

## Iteration Guide

Ordem sugerida para levar este sistema ao código, uma etapa por PR:

1. Tokens: trocar as variáveis de `src/index.css` pela tabela abaixo. É a mudança que mais muda a aparência com menos código.
2. Tirar o vermelho de `--accent`, `--ring` e `--sidebar-ring`, e revisar os componentes que dependiam disso.
3. Menu lateral com rótulos e grupos.
4. Funil: colunas neutras com ponto, cartão novo, fichas de atenção.
5. Celular: navegação inferior e funil em abas.
6. Dashboard único com abas Vendas, Marketing e Equipe, substituindo as telas de números separadas.

### Tokens para `src/index.css`

| Variável | Claro (hoje → proposto) | Escuro (hoje → proposto) |
|---|---|---|
| `--background` | 0 0% 100% → 240 7% 97% | 0 0% 0% → 240 8% 5% |
| `--foreground` | 215 20% 15% → 240 6% 10% | 0 0% 95% → 240 5% 96% |
| `--card` / `--popover` | 0 0% 100% → 0 0% 100% | 0 0% 5% → 240 7% 8% |
| `--primary` | 357 75% 52% (mantém) | 357 75% 52% → 358 77% 56% |
| `--secondary` | 215 25% 95% → 240 8% 95% | 0 0% 8% → 240 7% 11% |
| `--muted` | 215 20% 96% → 240 8% 95% | 0 0% 10% → 240 7% 11% |
| `--muted-foreground` | 215 15% 50% → 240 5% 34% | 0 0% 72% → 240 5% 65% |
| `--accent` | 357 75% 52% → 240 8% 92% | 0 0% 15% → 240 7% 16% |
| `--accent-foreground` | 0 0% 100% → 240 6% 10% | 0 0% 95% → 240 5% 96% |
| `--destructive` | 0 74% 42% → 4 76% 40% | 0 74% 42% → 4 92% 69% |
| `--warning` | 38 92% 50% → 22 92% 37% | 38 92% 50% → 39 98% 56% |
| `--success` | 142 71% 45% → 155 90% 24% | 142 71% 45% → 150 57% 54% |
| `--border` / `--input` | 215 20% 90% → 240 6% 90% | 0 0% 15% → 240 7% 16% |
| `--ring` | 357 75% 52% → 240 5% 65% | 357 75% 52% → 240 4% 46% |
| `--sidebar-accent` | 0 0% 92% → 240 8% 92% | 0 0% 18% → 240 7% 16% |
| `--sidebar-ring` | 357 75% 52% → 240 5% 65% | 357 75% 52% → 240 4% 46% |

Novas variáveis a criar: `--info` (218 80% 46% / 207 98% 66%), `--border-strong` (240 5% 84% / 240 7% 22%) e os fundos suaves de estado (`--danger-tint`, `--warn-tint`, `--ok-tint`, `--info-tint`).

## Known Gaps

- `--accent` hoje é o vermelho da marca no tema claro. Trocar por neutro muda todo componente que usa `bg-accent`; precisa de uma revisão tela a tela.
- `--hover-border` (azul), `--glow-green`, `--new-lead-glow` e `--chat-bubble` (verde-petróleo) ainda não têm lugar no sistema. Decidir se saem ou viram tokens de estado.
- A bolha do chat não foi redesenhada. Ponto de partida: mensagem do cliente em `surface`, mensagem da equipe em `surface-3`, sem verde.
- Gráficos ainda não têm regra de eixo, grade e legenda. Seguir a paleta `chart-*` e a série principal neutra.
- A cor de cada etapa hoje é escolhida pelo usuário. Decidir se vira a paleta fixa de seis cores ou se a escolha fica, limitada a essas seis.
