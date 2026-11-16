# KairoZ para consórcio

Data: 16/11/2026. Status: proposta, nada implementado.

## Objetivo

Todos os clientes do KairoZ vendem consórcio. O CRM trata essa venda como uma venda genérica: um lead com um "valor". O objetivo é cobrir o ciclo inteiro da venda de consórcio, da qualificação à comissão, para as corretoras venderem mais e com menos planilha, sem deixar de servir outros segmentos.

## Decisões tomadas

- **Modo consórcio por organização.** Uma chave nas configurações liga os módulos de consórcio e troca os termos (ex.: "valor" vira "crédito"). Organizações de outros segmentos não mudam.
- **Corretoras multimarca.** O cadastro de planos e o simulador trabalham com várias administradoras e comparam planos lado a lado.
- **Quando a venda conta é escolha de cada organização:** na adesão (com estorno se cancelar) ou só depois da 1ª parcela paga. Vale para produção, ranking e comissão.
- **Pós-venda fica de fora.** Assembleias, lances depois da adesão, contemplação e inadimplência continuam com a administradora. O KairoZ guarda só o status da cota (aguardando 1ª parcela, ativa, cancelada), porque ele decide produção e estorno de comissão.

## Como a venda de consórcio acontece e o que o KairoZ cobre

| Etapa | O que a corretora precisa | KairoZ hoje |
|---|---|---|
| Captação | Meta Ads, formulários, WhatsApp, indicação, distribuição justa | Forte: Lead Ads, webhooks, WhatsApp, roleta, Painel de anúncios |
| Qualificação | Tipo de bem, crédito desejado, parcela que cabe, prazo, lance disponível, FGTS, urgência | Não tem campos próprios; vai para observação |
| Atendimento | Responder rápido, tarefas, lembretes | Bom: aguardando resposta, tarefas, lembretes de reunião |
| Simulação | Parcela, custo total, lance embutido/livre/fixo, comparar administradoras | Não tem |
| Proposta | PDF ou link com a marca da corretora, enviado no WhatsApp, saber se o cliente abriu | Não tem |
| Adesão | Registrar a cota: administradora, grupo, cota, crédito, prazo, parcela, contrato | Só "venda ganha" com valor livre |
| Comissão | % por administradora, paga em parcelas, estorno se cancelar, divisão corretora/vendedor | Uma regra por organização, sem parcelas nem estorno |
| Gestão | Produção em crédito por vendedor, equipe e administradora; metas; ranking | Ranking calculado no navegador; dashboard genérico |

Referências do nicho: KONQCRM (simulador, Central de Propostas com Plano A/B, PDF, contratos, comissões, ranking em TV), CFlow (simulador com lance fixo/embutido, FGTS e redutor de parcela, proposta por link com contagem de aberturas, comissão por faixa e estorno, "receber por extrato"), Adda (estratégias de lance, financeiro com comissões a receber e a pagar, assistente de qualificação no WhatsApp) e CRM de Consórcio (simulação multi-administradora, comparativo, status das cotas).

## Fases

Cada fase é um PR, testado no localhost e publicado. A ordem coloca primeiro os dados certos (sem eles ranking e comissão ficam errados), depois motivação, conversão e dinheiro. O redesenho visual (branch `design/kairoz-visual`) precisa entrar antes, porque as telas novas usam esse padrão.

### Fase 0: modo consórcio (pequena)

- Chave por organização (`organizations` ou tabela de configurações) e um hook `useSegment()` para o front.
- Termos trocados no modo consórcio: "Valor" → "Crédito", "Venda" → "Venda de cota", "Produtos" → "Planos".
- Funil-modelo de consórcio, oferecido em qualquer funil ainda sem etapas próprias e sem leads: Novo lead → Qualificado → Simulação enviada → Reunião agendada → Reunião feita → Proposta enviada → Aguardando pagamento → Cota vendida, mais Perdido. As duas etapas de reunião já vêm ligadas aos eventos "agendado" e "compareceu".
- Esconde o catálogo genérico com estoque e custo para organizações em modo consórcio.

### Fase 1: qualificação e registro da cota (média)

- **Campos de qualificação no lead:** tipo de bem (imóvel, veículo, moto, pesados, serviços), crédito desejado, parcela que cabe, prazo desejado, lance disponível (R$ ou %), usa FGTS, quando quer o bem. Aparecem no cartão, no detalhe do lead, no mapeamento de formulários e do Meta.
- **Administradoras:** cadastro simples por organização (nome, logo, cor).
- **Venda de cota** (`consortium_sales`): lead, vendedor, administradora, tipo de bem, grupo, cota, crédito, prazo, parcela, nº da proposta/contrato, data da adesão, status (aguardando 1ª parcela, ativa, cancelada), data do pagamento da 1ª parcela, motivo do cancelamento. Um cliente pode comprar várias cotas.
- Ao mover o lead para "Cota vendida", abre o formulário da cota. O crédito somado vira a produção.
- Regra da organização: a venda conta na adesão ou na 1ª parcela. Na regra da adesão, cancelar a cota estorna. Na regra da 1ª parcela, a cota só conta quando alguém confirma o pagamento.

Feito na Fase 1:
- Tabelas `lead_consortium_profiles`, `consortium_administrators` e `consortium_sales`, com RLS; regra em `organization_settings`.
- A soma do crédito das cotas não canceladas vira o valor do lead; `consortium_sales_summary()` dá a produção por vendedor aplicando a regra.
- Ficha do lead com Qualificação e Cotas (registrar, confirmar 1ª parcela, cancelar com motivo).
- No funil, mover para a etapa de ganho abre o registro da cota; o lead só muda de etapa depois de registrar.
- Configurações › Organização com a regra e o cadastro de administradoras (com atalhos das mais comuns).
- Dashboard das organizações em modo consórcio usa as cotas para produção, quantidade e equipe.

Ficou para depois:
- Tarefa automática para confirmar a 1ª parcela (hoje: botão "Confirmar 1ª parcela" na cota).
- Qualificação vinda de formulários e do Meta, e o tipo de bem no cartão do funil.
- Escolher outro vendedor na cota: hoje o vendedor é o responsável do lead.

### Fase 2: ranking e gamificação (média)

- Fase 1 de `docs/superpowers/plans/2026-11-16-gamificacao-ranking.md`, com uma diferença: no modo consórcio, venda e produção vêm de `consortium_sales` (crédito vendido, regra de quando conta, estorno no cancelamento), e não do valor livre do lead.
- Quadros extras do nicho: produção por administradora e por tipo de bem.

### Fase 3: planos, simulador e proposta (grande)

- **Tabelas de planos por administradora:** tipo de bem, faixa de crédito, prazos, taxa de administração, fundo de reserva, seguro, índice de reajuste, redutor de parcela, limite de lance embutido, lance fixo. Cadastro na tela e importação por planilha.
- **Simulador:** escolhe tipo de bem, crédito e prazo, e o sistema lista os planos cadastrados que atendem. Para cada um calcula:
  - parcela cheia e reduzida;
  - custo total (taxa + fundo + seguro);
  - crédito líquido com lance embutido;
  - efeito de lance livre ou fixo.
- **Comparativos:** até três planos lado a lado e uma comparação com financiamento a uma taxa informada.
- **Proposta:** PDF e link com a marca da corretora, Plano A e Plano B, enviada pelo chat do WhatsApp do lead, com registro de quando o cliente abriu. O lead avança sozinho para "Proposta enviada".
- **Mensagens prontas do nicho:** simulação, explicação de lance, retomada de proposta.
- Os números são estimativas a partir do que a corretora cadastrou. A proposta traz um aviso de que as condições finais são as da administradora.

### Fase 4: comissões de consórcio (grande)

- **Regras por administradora e plano:**
  - % sobre o crédito;
  - número de parcelas e % de cada uma (ex.: 6x);
  - tabela de estorno por parcela em que a cota cancela;
  - divisão entre corretora, vendedor e supervisor, em % fixo ou por faixa de produção do mês.
- **Previsão mês a mês:** a receber das administradoras e a pagar aos vendedores.
- **Conciliação:** marcar parcelas recebidas, à mão ou importando a planilha de extrato da administradora.
- **Estorno automático** quando a cota é cancelada, seguindo a tabela.
- **Relatórios:** por vendedor, equipe, administradora e período. O vendedor vê a própria comissão prevista.
- Substitui as comissões genéricas atuais nas organizações em modo consórcio.

### Fase 5: gamificação completa (média)

- Fases 2 a 4 do plano de gamificação: metas de produção com ritmo (também por administradora), níveis, medalhas, sequências, campanhas com prêmio, feed ao vivo e modo TV.

### Fase 6: entrar como usuário, para suporte (média)

Pedido do dono do KairoZ: o super admin entra na conta de um cliente para ver e fazer o que ele vê, como no CRM Hurtz. Não depende das fases de consórcio; fica por último para não atrapalhar.

- **Só o super admin do login normal** (papel `super_admin` em `user_roles`) pode usar. O painel de admin com senha própria (`admin_credentials`/`admin_sessions`) não entra nisso.
- Botão "Entrar como este usuário" na ficha do usuário no painel de admin, com motivo obrigatório.
- Uma Edge Function confere o papel, registra o acesso (`impersonation_logs`: quem, quem foi acessado, motivo, início, fim) e devolve uma sessão do usuário. O navegador guarda a sessão do super admin para voltar depois.
- Faixa fixa no topo durante todo o acesso: "Você está como Fulano (Organização X) · Voltar para minha conta". A sessão emprestada expira em 1 hora.
- Pré-requisito: fechar antes as falhas do painel de admin listadas no relatório de análise (fora do repositório), porque entrar como qualquer usuário aumenta o estrago de um acesso indevido.

## Depois, se fizer sentido

- Assistente de qualificação no WhatsApp: faz as primeiras perguntas (bem, crédito, prazo, lance) e preenche os campos.
- Pontuação do lead (quente, morno, frio) a partir dos campos de qualificação e do tempo de resposta.
- Recompra e indicação: lembrar o vendedor de oferecer nova cota a clientes com venda ativa.

## Limites conhecidos

- As administradoras não têm integração aberta. Planos, cotas e extratos entram por cadastro ou planilha.
- Regras de comissão e estorno variam por administradora e contrato. O sistema aplica o que a corretora cadastrar e não substitui o contrato.
- Ligações telefônicas não são registradas.
