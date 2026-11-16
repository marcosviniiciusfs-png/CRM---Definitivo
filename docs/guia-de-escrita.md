# Guia de escrita do KairoZ

Vale para todo texto que aparece para quem usa o CRM: títulos, botões, avisos (toasts), confirmações,
estados vazios, placeholders, ajuda e mensagens de erro. Logs e comentários de código ficam de fora.

A ideia é uma só: **o texto diz o que aconteceu e o que fazer agora, com as palavras que a equipe de
vendas usa.**

## Regras

1. **Fale com "você", de forma implícita.** Use o imperativo: "Selecione um funil", "Preencha o
   telefone". Evite "deseja", "por gentileza" e "tem certeza que".
2. **Erro tem formato fixo:** "Não foi possível {ação}. {Próximo passo}."
   - O próximo passo padrão é "Tente novamente."; quando houver um melhor, use-o
     ("Reconecte o Facebook nas integrações.").
   - Não mostre `err.message` cru para o usuário. Se o detalhe ajuda, traduza ou mande para o log.
3. **Confirmação pergunta e diz a consequência.** "Excluir {coisa}? {O que acontece com os dados}."
   Se não dá para desfazer, diga isso no fim: "Não dá para desfazer."
   - O botão de confirmar repete o verbo: "Excluir", "Redistribuir", nunca "Sim" ou "OK".
4. **Estado vazio:** "Nenhum(a) {coisa} ainda." e, quando houver, a ação seguinte.
   Para busca ou filtro sem resultado: "Nenhum lead neste filtro."
5. **Sucesso é curto e no particípio:** "Lead movido.", "Facebook conectado."
   Sem "com sucesso", sem exclamação, sem emoji. Se houver número, ele vem primeiro:
   "12 leads redistribuídos."
6. **Botões têm de 1 a 3 palavras, verbo + objeto:** "Salvar etapa", "Importar leads", "Cancelar".
7. **Plural certo, sem "(s)".** Escreva "1 lead movido" e "3 leads movidos" (escolha a frase pela
   contagem).
8. **Acentos sempre.** "configuração", "página", "formulário", "você", "redistribuídos".
9. **Métrica vem explicada em português comum**, em uma frase, com o número concreto quando ajudar:
   "Conversas em que o lead mandou a segunda mensagem."
10. **Maiúscula só no início** de títulos e botões ("Lembretes de agendamento", não
    "Lembretes de Agendamento"). Nomes próprios e siglas mantêm a forma: WhatsApp, Meta, CPL.
11. **Frases terminam com ponto** em avisos, ajuda e estados vazios. Títulos, botões e rótulos não.

## Glossário

| Use | Não use | Observação |
|---|---|---|
| lead | cliente, contato, prospect | pessoa no funil. "Contato" só para a agenda do WhatsApp |
| cliente | — | só para quem já comprou, ou para a organização que assina o KairoZ (painel admin) |
| etapa | estágio, fase, coluna | |
| funil | pipeline | na interface. "Pipeline" pode continuar no código e no nome da rota |
| responsável | agente, dono | quem atende o lead |
| colaborador | membro, usuário | pessoa da equipe dentro da organização |
| roleta | distribuição automática | regra que reparte leads entre colaboradores |
| canal | instância | conexão de WhatsApp. "Instância" só em tela técnica |
| agendamento | reunião marcada | o compromisso marcado com o lead |
| no-show | não compareceu (em badge curto) | na frase, use "não compareceu" |

## Antes e depois (textos reais do KairoZ)

| Onde | Antes | Depois |
|---|---|---|
| Erro | "Erro ao mover lead" | "Não foi possível mover o lead. Tente novamente." |
| Erro com detalhe técnico | `Erro: ${err.message}` | "Não foi possível salvar. Tente novamente." (detalhe no log) |
| Validação | "Preencha todos os campos" | "Preencha o nome e o telefone do lead." (diga quais) |
| Validação | "O telefone do lead é obrigatório" | "Preencha o telefone do lead." |
| Confirmação | "Tem certeza que deseja excluir esta regra?" | "Excluir esta regra? Os leads que já passaram por ela continuam no funil." |
| Confirmação | "Tem certeza que deseja excluir este log? Esta ação não pode ser desfeita." | "Excluir este log? Não dá para desfazer." |
| Estado vazio | "Nenhum canal WhatsApp conectado" | "Nenhum canal de WhatsApp conectado ainda. Conecte um em Integrações." |
| Estado vazio | "Nenhum dado disponível" | "Nenhum lead neste período." (diga o que está vazio) |
| Sucesso | "Facebook conectado com sucesso!" | "Facebook conectado." |
| Sucesso com número | `${n} leads redistribuidos com sucesso!` | "12 leads redistribuídos." |
| Plural | `${ids.length} lead(s) movido(s)` | "3 leads movidos" / "1 lead movido" |
| Acento | "leads aguardando configuracao de roleta/agente." | "leads esperando uma roleta ou um responsável." |
| Termo | "Primeiro estágio (padrão)" | "Primeira etapa (padrão)" |

## Como aplicar

- Telas e textos novos seguem este guia desde o primeiro commit.
- Textos antigos são revisados por área (fase 6 do plano `docs/superpowers/plans/2026-11-14-trazer-hurtz-para-kairoz.md`),
  não de passagem em PRs de outra coisa.
- Na dúvida entre duas formas, escolha a mais curta que ainda diga o que fazer.
