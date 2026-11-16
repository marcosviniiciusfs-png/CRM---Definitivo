# Gamificação e ranking de vendedores

Data: 16/11/2026. Status: proposta, nada implementado.

## Objetivo

Um ranking que o vendedor confie e que o gestor use para acompanhar a equipe: produção, vendas, reuniões, rapidez de atendimento e metas, com pontos, níveis, medalhas, campanhas com prêmio e modo TV. Tudo calculado no servidor, a partir de eventos que o navegador não consegue forjar.

Referências: KONQCRM (CRM de consórcio com ranking diário, pódio, top 10, modo batalha, feed de vendas ao vivo, recordes e TV em tela cheia), SalesScreen (missões, sequências, XP e níveis, conquistas, celebrações), Zoho Motivator (metas individuais e de equipe, concursos, canal de TV) e as boas práticas de Spinify/Salesforce (poucas métricas ligadas à receita, regras claras, quadros por equipe, recompensar constância e não só o topo).

## Decisões tomadas

- O ranking abre em **Produção (R$)**. Vendas, Pontos, Conversão e Equipes ficam em abas.
- **Cada organização escolhe** se vendedores veem o R$ dos colegas. Padrão: visível. Escondido, o vendedor vê posição, pontos e o próprio valor; owner e admin veem tudo.
- Prêmios entram por **campanhas**: o gestor descreve o prêmio, o sistema apura e anuncia. Sem loja de moedas por enquanto.

## O que existe hoje

- `/ranking` (`src/pages/Ranking.tsx`) agrega tudo no navegador: vendas por `data_conclusao`, tarefas por `kanban_card_assignees`, corrida de agendamentos (`AppointmentRaceTab`) e competição com revelação (`ranking_competitions`).
- Pontos aparecem em três lugares com regras diferentes (`TaskLeaderboard`, `task_completion_logs`, score de `Reunioes.tsx`), e nenhum é a fonte de verdade.
- Metas estão espalhadas: `goals` (sem período), `team_goals`, `appointment_goals`, `panel_settings.monthly_conversation_goal`.
- Fontes confiáveis (gravadas no servidor): `funnel_stage_history` (quem moveu, quando, origem humano/automação, `linked_event` agendado/confirmado/compareceu/faltou, ganho/perda via `stage_type`) e `lead_distribution_history` (quem recebeu cada lead).
- Fontes não confiáveis (gravadas pelo navegador): `leads.data_conclusao`, `leads.status_reuniao`, `lead_activities`, conclusão de tarefas. Mensagens do WhatsApp não guardam quem enviou.

Consequência: o sistema novo pontua a partir de `funnel_stage_history`, `lead_distribution_history` e de um histórico novo de respostas, e não usa os campos gravados pelo navegador.

## Como funciona

> Organizações em **modo consórcio** (ver `2026-11-16-kairoz-consorcio.md`) usam a venda de cota como fonte de venda e produção: crédito vendido, regra da organização para quando a venda conta (adesão ou 1ª parcela) e estorno quando a cota é cancelada. As demais usam a etapa ganha e o valor do lead, como descrito abaixo.

### 1. Placar confiável

- Tabela `score_events`: um registro por fato pontuável (organização, vendedor creditado, equipe na data, tipo, pontos, valor em R$, lead, origem e id da origem, data). Única por origem e tipo, para não contar duas vezes.
- Gravada só por triggers e funções do servidor. O navegador apenas lê.
- **Crédito vai para o responsável do lead no momento do fato**, não para quem clicou. Venda movida por automação também conta para o responsável.
- **Estorno automático**: se o lead sai de uma etapa ganha, entra um evento negativo que anula a venda. Voltou para ganho, credita de novo. Assim mover e desfazer não rende pontos.
- Limite diário por tipo de evento (ex.: no máximo 50 pontos/dia de resposta rápida) para evitar volume artificial.
- Histórico visível: o vendedor abre "de onde vieram meus pontos" e vê cada evento.

### 2. Tabela de pontos (padrão, editável por organização)

| Fato | Pontos | Fonte |
|---|---|---|
| Venda ganha | 100 | entrada em etapa `won` |
| Reunião agendada | 10 | etapa com `linked_event = agendado` |
| Reunião que aconteceu | 25 | `linked_event = compareceu` |
| Resposta em até 5 min | 5 | histórico novo de respostas |
| Resposta em até 15 min | 2 | histórico novo de respostas |
| Meta mensal batida | 300 | apuração diária |
| Recorde pessoal de produção | 100 | apuração mensal |

Falta do cliente (`faltou`) não tira pontos do vendedor. Valor da venda não vira ponto: quem mede valor é o quadro de Produção.

### 3. Quadros do ranking

- **Produção (R$)**: soma do valor das vendas líquidas (vendas menos estornos).
- **Vendas**: quantidade.
- **Pontos**: esforço e qualidade.
- **Conversão**: vendas ÷ leads recebidos (de `lead_distribution_history`). Equilibra quem recebe menos leads.
- **Equipes**: os mesmos quadros somados por equipe.
- Períodos: hoje, semana, mês e temporada (mês). Pódio dos 3 primeiros, lista completa, seta de subida/descida em relação a ontem e a posição do próprio vendedor sempre fixa na tela.

### 4. Metas com ritmo

- Uma tabela só de metas (`seller_goals`): escopo vendedor, equipe ou organização; métrica (produção, vendas, reuniões que aconteceram, pontos); mês; alvo.
- A barra mostra o realizado e o **ritmo esperado** pelos dias úteis passados: "no ritmo", "abaixo do ritmo", "faltam R$ 42 mil, R$ 3,8 mil por dia útil".
- Substitui `goals`, `team_goals` e `appointment_goals` na tela de ranking (as antigas ficam até a migração dos dados).

### 5. Níveis, medalhas e sequências

- **Nível**: os pontos acumulados de sempre viram XP. Nível 1 a 50, em faixas Bronze, Prata, Ouro e Diamante. Nível nunca cai; a temporada zera só o ranking do mês.
- **Medalhas**: catálogo com regras (primeira venda, 5 vendas no mês, recorde pessoal, 20 respostas em até 5 min na semana, mês sem tarefa atrasada, meta batida 3 meses seguidos). Cada organização pode desligar ou criar as suas com base nas métricas existentes.
- **Sequência**: dias úteis seguidos batendo a meta diária de atividade (ex.: 3 reuniões agendadas ou 10 respostas rápidas). Marcos em 5, 10 e 20 dias.

### 6. Campanhas com prêmio

- O gestor cria: nome, período, métrica, participantes (todos, equipe ou lista), formato e prêmio descrito.
- Formatos: **corrida** (maior resultado vence), **meta** (todos que baterem ganham), **equipe contra equipe** e **batalha 1 contra 1**.
- Opção de **revelação**: resultado escondido até a data, como `ranking_competitions` faz hoje (que passa a ser um formato de campanha).
- Apuração automática no fim do período, anúncio no feed e na TV, e registro dos vencedores.

### 7. Celebração e TV

- **Feed ao vivo**: "Carla fechou R$ 71.200", "Bruno bateu a meta do mês", "Júlia subiu para o nível 12". Respeita a regra de visibilidade do R$.
- **Aviso no app** com som opcional quando alguém da equipe vende ou bate meta (usa o tempo real do Supabase sobre `score_events`).
- **Modo TV**: tela cheia em rotação (pódio de produção, metas da equipe, campanha ativa, feed). Abre por um link próprio de só leitura, com token que o gestor pode revogar, para ficar numa TV sem login de usuário.

### Segurança

- Tabelas novas nascem com RLS: membro lê só a própria organização; escrita só por funções do servidor.
- As funções de leitura do ranking aplicam a regra de visibilidade do R$ no servidor, não no navegador.
- O token da TV dá acesso só às funções de leitura da TV daquela organização.

## Fases

Cada fase é um PR, com migração, funções e telas, testada no localhost e depois publicada.

### Fase 1: placar e ranking de produção

- Migração: `score_rules` (com os padrões), `score_events`, triggers em `funnel_stage_history` (venda, estorno, reunião agendada, reunião que aconteceu) e em `lead_distribution_history` (lead recebido, 0 ponto).
- Histórico de respostas: quando `aguardando_resposta_desde` é limpo, gravar o tempo de espera e o responsável. Isso gera os pontos de resposta rápida.
- Carga do mês atual a partir de `funnel_stage_history`.
- Funções de leitura: `ranking_board` (quadro, período, equipe) e `seller_summary` (meu desempenho).
- Configuração por organização: visibilidade do R$ e tabela de pontos.
- Tela `/ranking` nova no design do DESIGN.md: abas Produção, Vendas, Pontos, Conversão e Equipes, pódio, lista e "minha posição".

### Fase 2: metas, níveis, medalhas e sequências

- `seller_goals` com ritmo por dia útil; telas de definir e acompanhar metas.
- Níveis por XP, catálogo de medalhas, apuração diária por pg_cron (mesmo padrão de `process-stage-actions`).
- Página "Meu desempenho": nível, medalhas, sequência, metas e histórico de pontos.

### Fase 3: campanhas

- `campaigns` e `campaign_participants`, os quatro formatos, revelação, apuração e registro de vencedores.
- Migração de `ranking_competitions` para campanhas.

### Fase 4: feed, celebrações e TV

- Feed ao vivo, avisos com som e modo TV com link de só leitura.

## Limites conhecidos

- Reunião só pontua em funil com etapas ligadas a agendado/compareceu (recurso de eventos de etapa já em produção). Funil sem essa ligação precisa ser configurado.
- Ligações telefônicas não são registradas, então não entram (o Konq tem meta diária de ligações).
- A autoria de mensagens não existe; o tempo de resposta é creditado ao responsável do lead.
- Vendas antigas, de antes do histórico de etapas existir, não entram na carga inicial.

## Verificação

- Testes das regras de pontuação (venda, estorno, crédito ao responsável, limite diário) com Vitest nas funções puras e com SQL de checagem no banco local.
- Conferência do mês carregado contra o ranking atual de vendas de uma organização piloto, explicando cada diferença.
- Teste da regra de visibilidade do R$ com um usuário membro.
