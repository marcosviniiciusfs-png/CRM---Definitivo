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
- Migration `20261114120000_funnel_stage_linked_event.sql`: coluna `funnel_stages.linked_event`, nula por
  padrão, com os eventos da reunião `scheduled`, `confirmed`, `attended`, `no_show`.
  - Índice único parcial `(funnel_id, linked_event)`: cada evento em no máximo uma etapa por funil.
  - Trigger: marcar o evento numa etapa tira o evento da etapa que o tinha antes.
  - Preenchimento inicial pelos nomes ("Agendamento Realizado", "Reunião Feita", "Não compareceu"...),
    só em etapas não finais e uma por funil.
  - Funil padrão de organização nova já nasce com Agendamento Realizado = `scheduled` e Reunião Feita = `attended`.
- `FunnelStagesConfig`: seletor "Esta etapa representa" e selo do evento em cada etapa; avisa quando o
  evento vai sair de outra etapa.
- `src/lib/stageEvents.ts`: único lugar para perguntar "qual etapa é o evento X" (`getStageEvent`,
  `findStagesForEvent`, `missingMeetingEvents`), com testes em `tests/stage-events.test.ts`.

**Decisões tomadas:**
- Ganho e perdido continuam em `stage_type` (lido em ~30 arquivos); o helper responde `won`/`lost`
  a partir dele. Assim não há duas fontes que possam divergir.
- `procedure_done` do Hurtz (clínica) ficou de fora: no KairoZ o fechamento é `won`.
- No-show/realizada marcado no card (`leads.status_reuniao`) continua; o painel (fase 4) conta os
  dois, a etapa e a marcação.
- `ensure_user_organization` (só service role desde 20260908) ainda cria o funil reserva sem eventos;
  a fase 4 avisa quais eventos faltam marcar.

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

**Feito (branch `feat/acoes-etapa-servidor`):**
- Migration `20261114150000_stage_moves_and_actions.sql`: `funnel_stage_history.source`, fila
  `stage_action_runs`, trigger `leads_record_stage_move`, `claim_stage_action_runs` (só service role) e
  cron `process-stage-actions-sweep` (1 min). O trigger também chama a função na hora via pg_net.
- Edge Function `process-stage-actions` + regras puras em `_shared/stage-actions.ts`
  (testes em `tests/stage-actions.test.ts`).
- `Pipeline.tsx` não executa mais ações.

**Decisões tomadas:**
- Ação só quando o lead **já estava numa etapa e mudou**. Lead novo, ou distribuição que define a
  primeira etapa, só grava histórico (igual ao comportamento anterior).
- No máximo uma vez: execução que travou no meio vira `failed` e não é repetida (a mensagem pode já
  ter saído); ação esperando há mais de 6 h vira `skipped`; lead que saiu da etapa antes da ação rodar
  é pulado.
- Mensagem automática sai pelo canal do lead; sem canal, pelo primeiro canal conectado **da mesma
  organização** (antes pegava qualquer canal conectado). Atribuição procura o e-mail só na organização
  do lead.
- Origem: `human` quando há usuário logado; `automation` quando a Edge Function manda
  `x-move-source: automation`; `system` no resto.

**Ordem de deploy:** frontend primeiro, depois migration + função. Na ordem inversa, por alguns
minutos a mesma movimentação dispararia a ação no navegador e no servidor.

**Ficou para depois (decidir com o dono):**
- `StageAutomationConfig` (tela vazia), `funnel_automation_rules` (sem uso), `max_days_in_stage` e
  `required_fields` (salvos e não aplicados).
- `process-automation-rules` muda a coluna antiga `leads.stage`, não `funnel_stage_id`: a ação
  "mudar etapa" das automações não move o lead nos funis.

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

**Feito (branch `feat/card-tarefas-lembretes`):**
- A data do agendamento já existia como campo próprio: `leads.data_agendamento_reuniao`
  (migration `20261002110000`, veio do GitHub).
- 3a — Migration `20261114180000_appointment_reminders.sql`: `appointment_reminder_settings`
  (uma linha por organização, **nasce desligada**), fila `appointment_reminders`, triggers em
  `leads`, `funnel_stages` e nas configurações, `claim_due_appointment_reminders` e cron de 1 minuto.
  Edge Function `send-appointment-reminders`; regras puras em `_shared/appointment-reminders.ts`.
  Tela "Lembretes" em Reuniões (owner/admin).
- 3b — Migration `20261114200000_lead_waiting_reply.sql`: `leads.aguardando_resposta_desde`, mantido
  por trigger em `mensagens_chat` (ENTRADA liga, SAIDA desliga, tolera histórico fora de ordem),
  preenchido com os últimos 30 dias; RPC `lead_open_tasks`. Estado do card em
  `src/lib/leadCardState.ts`; chips Responder/Atrasadas/Hoje/Sem tarefa e contadores na coluna.
- `_shared/lead-outbound.ts` junta canal do lead, coluna de tarefa e dono da organização para as
  ações de etapa e os lembretes.

**Decisões tomadas:**
- Mesmo lembrete não sai duas vezes para o mesmo horário: sair e voltar para a etapa recria só o que
  ainda não saiu (no Hurtz, reentrar reenviava tudo).
- Lembrete atrasado mais de 30 min não sai (cron ou função fora do ar).
- Tarefa de no-show só se ninguém marcou a reunião (`status_reuniao`) e o lead ainda está na etapa.
- Tarefa considerada no card: qualquer tarefa aberta do lead no quadro de tarefas (no Hurtz era só a
  de quem está vendo). "Sem tarefa" não vira selo no card, só filtro, para não poluir o Pipeline.
- Chips e contadores contam os leads **carregados** na tela (a paginação continua por etapa).

**Ficou para depois:**
- Aviso diário às 8h de tarefas que vencem hoje e vencidas.
- O Pipeline não escuta UPDATE de leads em tempo real: o selo "Responder" atualiza quando a tela
  recarrega os leads. A versão mobile (`MobilePipelineView`) ainda não mostra os selos.
- `send-scheduled-reminders` (lembrete manual por agendamento) procura canal com status `'CONNECTED'`
  em maiúsculas e provavelmente nunca envia. Corrigir solta de uma vez os lembretes antigos
  pendentes; precisa de limpeza antes.

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

**Feito (branch `feat/painel-acompanhamento`), pronto mas desligado:**
- Migration `20261114220000_panel.sql`: `panel_settings` (nasce **desligado**), `panel_meta_tokens`
  (token próprio, criptografado, só service role), `panel_meta_cache` e RPC `panel_attendance`.
- Edge Function nova `panel-meta-insights` (a `fetch-ads-insights` ficou intacta), modos `status`,
  `insights`, `set_goal` e `configure`. Fórmulas em `_shared/panel-metrics.ts`.
- Página `/painel` ("Painel" no menu, mesma permissão de Métricas): resultado com comparação,
  indicadores, meta do mês, conversas por dia, criativos Melhor/Revisar e atendimento por dia com taxas.
  Taxas e meta em `src/lib/panelRates.ts`.

**Decisões tomadas:**
- O dono pediu para **não usar o token dele** ainda (o token dele é só para os clientes dele). Por isso:
  o painel nasce desligado em toda organização; desligado, nenhuma chamada à Meta é feita; ligar e
  escolher o token (próprio do painel ou o Facebook conectado na organização) é só do super admin
  (`user_roles.super_admin`); o admin da organização só muda a meta mensal. Nada foi testado contra a
  Meta: os testes usam dados fictícios.
- O atendimento por dia não depende da Meta e aparece mesmo com o painel desligado.
- "Agendado de anúncio": origem Facebook/Meta/Instagram ou tag "Lead de anúncio".
- Compareceu/faltou somam a etapa (Fase 1) e a marcação do card (`status_reuniao`), no dia da reunião.
- Alcance somado entre várias contas de anúncio é aproximado (a Meta não deduplica entre contas).

**Antes de ligar:** escolher o token de cada organização; conferir um período contra o Gerenciador
de Anúncios. Ficou para depois: miniatura dos criativos, público (idade, plataforma, horário),
filtro por campanha, imprimir/PDF e tela de configuração no painel de super admin do KairoZ.

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
