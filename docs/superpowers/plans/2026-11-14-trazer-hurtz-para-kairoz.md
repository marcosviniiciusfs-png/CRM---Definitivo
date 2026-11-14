# Plano: trazer do Hurtz CRM para o KairoZ

Data: 2026-11-14 · Status: em andamento (fase a fase)

O Hurtz CRM é um fork do Chatwoot (Rails + Vue). O KairoZ é React + Supabase. Nada é copiado:
trazemos **regras, fórmulas e textos** e reimplementamos aqui. Cada fase sai em um branch próprio
a partir do `main`, com `npm run check` passando, e só começa depois que a anterior foi aprovada.

| Fase | Entrega | Depende de | Tamanho |
|---|---|---|---|
| 0 | Guia de escrita | — | P |
| 1 | Eventos de etapa | — | M |
| 2 | Ações de etapa no servidor | 1 | M |
| 3 | Card, tarefas e lembretes do agendado | 1, 2 | G |
| 4 | Painel de acompanhamento | 1 | G |
| 5 | Leads de anúncio por dia | 1 | P |
| 6 | Revisão dos textos existentes | 0 | M |
| 7 | IA de etapas em modo sombra | 1, 2, 3 | G |

---

## Fase 0 — Guia de escrita

**Por quê:** as fases seguintes criam muitas telas novas. Com o guia pronto, elas já nascem no padrão.

**Entra:**
- `docs/guia-de-escrita.md`, curto (uma página), com:
  - tratamento por "você", quase sempre implícito no imperativo ("Selecione", "Preencha");
  - erro: "Não foi possível X. Tente novamente." (sempre com o próximo passo);
  - confirmação: pergunta + consequência ("Excluir esta regra? Os leads que já entraram por ela continuam no histórico.");
  - estado vazio: "Nenhum(a) X ainda." + ação seguinte;
  - sucesso curto, sem "com sucesso!" e sem emoji;
  - botões de 1 a 3 palavras, verbo + objeto;
  - glossário: **lead** (não "cliente"), **etapa** (não "estágio"), **funil** na interface;
  - métrica sempre explicada em português comum ("Pessoas diferentes que viram os anúncios.").
- Referência ao guia no `CLAUDE.md`.

**Pronto quando:** o guia existe, com 5 a 10 exemplos "antes → depois" tirados do próprio KairoZ.

---

## Fase 1 — Eventos de etapa

**Por quê:** é a base do painel (fase 4), dos lembretes (fase 3) e da IA (fase 7). Hoje o KairoZ só
reconhece `won`, `lost` e `discarded`; "agendado" é um nome de etapa e o no-show fica em `leads.status_reuniao`.

**Entra:**
- Migration: coluna `funnel_stages.linked_event`, nula por padrão, com os valores
  `scheduled`, `confirmed`, `attended`, `no_show`, `procedure_done`, `won`, `lost`.
  - Índice único parcial `(funnel_id, linked_event)`: cada evento em no máximo uma etapa por funil.
  - `stage_type` continua como está (é lido em ~30 arquivos para ganho e perda); `linked_event`
    é complementar.
  - Preenchimento inicial: etapas `won` → `won`, `lost` → `lost`; etapas chamadas "Agendamento
    Realizado"/"Agendado" → `scheduled` (conferir os dados antes de aplicar).
- `FunnelStagesConfig`: seletor "Esta etapa representa…" em cada etapa, avisando quando o evento sai
  de outra etapa.
- Helper único no front para responder "qual etapa é o evento X neste funil".

**Decisão a tomar no início:** o no-show/realizada continua em `status_reuniao` (marcação no card)
ou passa a ser etapa? Proposta: manter `status_reuniao` e, no painel, contar os dois.

**Pronto quando:** dá para marcar os eventos nas etapas, o banco impede evento duplicado no funil,
nada do que usa `stage_type` mudou de comportamento.

---

## Fase 2 — Ações de etapa no servidor

**Por quê:** hoje `executeStageActions` roda no navegador (`Pipeline.tsx`). Quando o lead muda de
etapa por automação, roleta ou Edge Function, as ações não disparam. Os lembretes da fase 3
precisam disparar sempre.

**Entra:**
- Registro de toda mudança de etapa no servidor (`funnel_stage_history` + trigger), com a origem
  (`human`, `automation`, `system`), como o `pipeline_moves.source` do Hurtz.
- Ações de etapa (mensagem, tarefa, atribuição, evento de conversão Meta no `won`) executadas por
  uma Edge Function a partir desse registro, uma vez por movimentação.
- Remover a execução no navegador.
- Decidir o destino de `StageAutomationConfig` (vazio), `funnel_automation_rules` (sem uso),
  `max_days_in_stage` e `required_fields` (salvos e não aplicados): implementar ou remover.

**Pronto quando:** mover o lead por qualquer caminho dispara as ações exatamente uma vez, e o
histórico mostra quem moveu.

---

## Fase 3 — Card, tarefas e lembretes do agendado

**Entra:**
- Estado do card, nesta prioridade: **precisa responder** > **tarefa vencida** > **vence hoje** >
  **sem tarefa**. "Hoje" e "vencida" pelo dia de Brasília.
- Chips de filtro no Pipeline (Hoje, Vencidas, Sem tarefa) e contadores por coluna
  (total, aguardando resposta, vencidas, hoje).
- Data do agendamento como campo próprio do lead (hoje vive em JSON dentro de `lead_activities`).
- Lembretes ao entrar na etapa `scheduled`, configuráveis por organização:
  - D-1 às 8h e D-1 às 17h (mensagem ao lead);
  - 2h antes (mensagem ao lead);
  - 10 min depois: **tarefa interna** "Lead não entrou na call, ligar agora" para o responsável.
- Regras de envio: só sai se o lead ainda está na etapa e a data não mudou; sair da etapa cancela;
  reentrar recomeça; horário já passado é pulado.
- Aviso diário às 8h: tarefas que vencem hoje e vencidas.

**Pronto quando:** um lead agendado recebe os lembretes certos, reagendar não duplica, e o card
mostra o estado na prioridade acima.

---

## Fase 4 — Painel de acompanhamento

**Base:** `LeadMetrics` + `fetch-ads-insights` já existentes.

**Entra:**
- Cache das respostas da Meta: 5 min se o período inclui hoje/ontem, 1 h nos outros casos.
- **Resultado:** conversas iniciadas, custo por conversa (sem campanhas de tráfego/alcance),
  valor investido e **conversas reais** (lead mandou a 2ª mensagem).
- Comparação com o período anterior de mesmo tamanho em cada número.
- **Indicadores:** alcance, impressões, CTR, frequência, CPM, cliques no link.
- **Meta mensal com ritmo:** esperado até hoje, ritmo atual, quanto falta por dia.
- **Criativos:** "Melhor" (≥ 5 conversas, custo ≤ média, ≥ 50% continuaram) e "Revisar"
  (custo > 1,25× a média, ou < 30% continuaram com ≥ 5 conversas).
- **Atendimento por dia** (a partir dos eventos da fase 1): agendamento, confirmação,
  comparecimento, fechamento, conversa → fechamento e custo por agendado vindo de anúncio.
  Aviso de quais eventos ainda não estão marcados nas etapas.
- Atalhos de período (Hoje, Ontem, 7, 14, 30 dias, Este mês, Mês passado) e atualização sozinha a
  cada 5 min quando o período termina hoje e a aba está visível.
- Cores dos gráficos pelos tokens do tema (hoje são fixas no código).

**Pronto quando:** os números batem com o Gerenciador de Anúncios para um período de teste e as
taxas batem com uma contagem manual no funil.

---

## Fase 5 — Leads de anúncio por dia

**Base:** `whatsapp_tracking_rules` + `ad-lead-tagging.ts` já marcam o lead que chega pela
palavra-chave do anúncio.

**Entra:**
- Registro da entrada por regra (data, regra, se é retorno do contato), sem duplicar.
- Tabela por dia: uma coluna por regra, total de leads e agendados, linha de totais, dias zerados.
- Leads de formulário do Facebook entram na mesma contagem (no Hurtz eles ficam de fora; aqui não).

---

## Fase 6 — Revisão dos textos existentes

Aplicar o guia da fase 0 nas telas antigas, por área (Pipeline, Roleta, Integrações, Colaboradores,
Tarefas, Dashboard), um PR por área para facilitar a revisão.

---

## Fase 7 — IA de etapas em modo sombra

**Entra (conceito do `stage_mover` do Hurtz):**
- Cada etapa recebe um papel genérico (`first_contact`, `followup_no_reply`, `nurture_*`,
  `scheduled`...). Etapa sem papel = a IA não mexe.
- Liga em **modo sombra**: decide e registra em auditoria, não move ninguém.
- Travas: não mexe em lead movido por pessoa nos últimos 14 dias; no máximo um movimento por lead
  em 24 h; teto por hora na organização; nunca entra sozinha em `confirmed`, `attended`, `no_show`,
  `procedure_done`, `won`, `lost`.
- Fatos calculados em código (quem falou por último, horas sem resposta); o modelo só classifica
  interesse, com nome, telefone e e-mail mascarados.
- Tela para aprovar sugestões (o Hurtz ainda não tem).

**Pronto quando:** rodou em sombra por pelo menos uma semana em uma organização e as decisões
registradas foram conferidas antes de liberar o movimento real.

---

## Fora do escopo

- Identidade visual do Hurtz (laranja "Brasa", fundo off-white): é a marca Hurtz.
- i18n: o KairoZ é só português; o guia de escrita resolve a consistência.
