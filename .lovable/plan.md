
Objetivo
- Eliminar de forma definitiva o erro de permissão (403) que impede membros com “cargo” (permissões granulares) de visualizar e usar o Kanban (e outras áreas do CRM) quando o usuário pertence a duas organizações e está acessando a organização “não principal”.
- Corrigir o comportamento “No board found, creating new one… → 403 → Erro ao criar quadro” para que:
  - Se o board existe: ele seja encontrado e carregado.
  - Se não existe: apenas Owner/Admin criem; membros vejam uma mensagem orientando que o admin crie o quadro.

Diagnóstico (causa raiz)
- O console do Marcos mostra:
  - “Memberships returned: 2”
  - Kanban tenta carregar board na organização selecionada
  - “No board found, creating new one…”
  - Request falha com 403, e aparece “Erro ao criar quadro”.
- Isso é consistente com um problema de Row Level Security (RLS) quando o usuário pertence a múltiplas organizações:
  - Várias políticas RLS (inclusive do Kanban) dependem de subqueries em organization_members ou de funções como get_user_organization_id / get_user_organization_role.
  - Hoje, organization_members tem policy de SELECT que usa get_user_organization_id(auth.uid()).
  - Se get_user_organization_id retorna “uma organização padrão” (ex: a primeira/limit 1), e o usuário seleciona outra organização no app, então:
    - organization_members “visível” via RLS fica restrito à organização errada
    - subqueries usadas nas policies do Kanban deixam de reconhecer que ele é membro da organização selecionada
    - Resultado: SELECT do board pode retornar vazio (ou 403) e INSERT do board dá 403, mesmo o usuário sendo membro válido da org.

Estratégia de correção (garantia de robustez)
A correção mais confiável é tornar “organização ativa” uma informação do backend, e fazer as funções usadas nas RLS consultarem essa organização ativa. Assim:
- Todas as tabelas/policies que hoje dependem de get_user_organization_id / get_user_organization_role passam a funcionar corretamente após trocar a organização no app.
- Evitamos ter que reescrever dezenas de policies em todas as tabelas do CRM.

Plano de implementação

1) Backend: Persistir “organização ativa” do usuário
1.1) Garantir estrutura de sessão no banco
- Verificar/ajustar a tabela user_sessions (já existe no projeto) para suportar:
  - user_id (uuid, PK)
  - active_organization_id (uuid, nullable inicialmente)
  - updated_at (timestamp)
- Se active_organization_id não existir, criar via migration.

1.2) RLS para user_sessions (se necessário)
- Confirmar que:
  - Usuário autenticado pode SELECT/INSERT/UPDATE apenas seu próprio registro (user_id = auth.uid()).
- Ajustar policies caso falte alguma permissão (o projeto já teve correção de RLS para user_sessions; aqui é checar e completar).

2) Backend: Corrigir funções “base” usadas por RLS (multi-org safe)
2.1) Atualizar get_user_organization_id(_user_id)
- Alterar a função para:
  - Primeiro: tentar retornar user_sessions.active_organization_id do usuário (se existir e o usuário for membro ativo dessa org).
  - Fallback: retornar a primeira organização ativa do usuário (como hoje), para não quebrar casos onde ainda não existe sessão gravada.

2.2) Atualizar get_user_organization_role(_user_id)
- Alterar para:
  - Se existir active_organization_id definida (e o usuário for membro ativo dela), retornar (active_organization_id, role) correspondente.
  - Fallback: comportamento antigo.

2.3) (Opcional, mas recomendado) Ajustar funções auxiliares usadas em policies
- Se houver outras funções similares que usam “LIMIT 1” (ex: get_user_organization_id sem considerar seleção), ajustá-las para respeitar active_organization_id.
- Objetivo: eliminar qualquer “LIMIT 1” que cause “organização errada” quando usuário está em duas orgs.

3) Frontend: Sempre sincronizar seleção de organização com o backend
3.1) OrganizationContext: ao selecionar/trocar organização
- Ao final de handleOrgSelect(orgId) e switchOrganization(orgId):
  - fazer upsert em user_sessions com active_organization_id = orgId para o user atual.
  - Idealmente: gravar isso antes de iniciar carregamentos que dependem de RLS (ex: Kanban/Leads/Pipeline/Chat).

3.2) OrganizationContext: auto-seleção (quando só há 1 org ou vem do cache)
- Quando o contexto decidir automaticamente o targetOrgId:
  - também persistir em user_sessions.
- Isso garante que mesmo em “login + redirect direto”, o backend saiba qual org é a ativa antes das queries dos módulos.

3.3) Tratamento de falhas
- Se a escrita em user_sessions falhar, logar erro e manter a UI funcionando com o cache, mas:
  - exibir um toast “Falha ao sincronizar organização no servidor; tente novamente” para ajudar diagnóstico.
- Isso evita “silêncio” em falhas intermitentes.

4) Kanban: corrigir comportamento de criação automática e mensagens de erro
4.1) KanbanBoard.loadOrCreateBoard
- Alterar regra:
  - Apenas Owner/Admin podem criar board automaticamente se não existir.
  - Para membros: se não existir board, mostrar um estado vazio amigável (“Nenhum quadro foi criado nesta organização. Peça ao administrador para criar.”) em vez de tentar INSERT e cair em 403.
- Benefício: mesmo se houver qualquer regressão futura, o membro não ficará “travado” em erro ao tentar criar algo que não deve criar.

4.2) Melhorar diagnóstico de 403
- Se fetch do board retornar erro 403:
  - toast com mensagem específica de permissão (e sugestão: “confira se a organização ativa está correta”).
- Isso facilita identificar problemas de RLS imediatamente.

5) Garantia de “tudo funciona em todas as seções permitidas”
5.1) Revisão rápida de seções críticas que dependem de organização
- Depois do backend “org ativa” estar correto, validar (e ajustar se necessário) fluxos que usam RLS com get_user_organization_id:
  - Tarefas/Kanban (kanban_boards, kanban_columns, kanban_cards, assignees)
  - Pipeline/Leads
  - Chat/WhatsApp status
- Em geral, a mesma causa raiz afeta múltiplas áreas: corrigir a função base tende a corrigir todas.

5.2) Checklist de validação (obrigatório antes de “parar”)
Cenário A: Usuário em 2 organizações (Marcos)
- Entrar, escolher Organização 1 (onde ele é owner ou tem permissões amplas)
  - Acessar Tarefas → Kanban carrega sem erro 403
- Trocar para Organização 2 (onde ele é member com cargo permitindo kanban)
  - Acessar Tarefas → Kanban carrega o board do admin (sem tentar criar)
  - Se board não existir: aparece mensagem orientando admin a criar, sem 403
- Validar que o console não mostra “Failed to load resource: 403” para kanban_boards.

Cenário B: Usuário com 1 organização
- Nada muda: acesso continua normal.

Cenário C: Usuário com cargo sem canViewKanban
- Continua bloqueado no Tasks com “Acesso Restrito” (comportamento desejado).

6) Correção de conformidade: tipos gerados automaticamente
- O arquivo src/integrations/supabase/types.ts não deve ser editado manualmente.
- Verificar e reverter qualquer alteração manual nele e deixar que o sistema gere o types corretamente (isso evita inconsistência e problemas em builds futuros).

Entregáveis (o que será alterado quando sairmos do modo read-only)
- Migração no banco:
  - adicionar/garantir coluna active_organization_id em user_sessions (se necessário)
  - atualizar funções get_user_organization_id e get_user_organization_role para respeitar organização ativa
  - (se necessário) ajustar policies de user_sessions
- Código:
  - src/contexts/OrganizationContext.tsx: upsert de active_organization_id no backend em seleção/troca/auto-seleção
  - src/components/KanbanBoard.tsx: impedir criação automática para membros e melhorar handling de 403
  - (se necessário) pequenos ajustes em fluxos que ainda consultem organization_members direto para “descobrir org” em vez do contexto, para evitar conflitos
- Correção de conformidade:
  - remover quaisquer edições manuais em src/integrations/supabase/types.ts (deixar gerar automaticamente)

O que eu preciso de você (sem ferramentas, para confirmar 100%)
- Confirmar: quando o Marcos entra, ele escolhe explicitamente a organização no modal/selector, ou o app auto-seleciona?
- Confirmar: na organização “onde ele é membro”, já existe um board criado (como “Quadro de Tarefas”), ou às vezes realmente não existe?

Se você quiser, posso continuar na próxima mensagem já com a execução completa dessas correções (migrações + código) assim que você mandar “pode continuar”.