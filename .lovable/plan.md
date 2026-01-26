
# Plano: Correção do Sistema de Permissões de Cargos e Scroll do Modal

## Diagnóstico dos Problemas

### Problema 1: Membros com Cargo Personalizado não Veem o Quadro Kanban

**Causa raiz identificada:**
O sistema de permissões atual (`OrganizationContext.tsx`) calcula permissões APENAS baseado nos roles básicos (`owner`, `admin`, `member`). Ele **NÃO** carrega as permissões granulares do cargo personalizado (`organization_custom_roles`) que está associado ao membro.

Sequência do problema:
1. Owner cria cargo "Gestor de Trafego" com `can_view_kanban: true`
2. Membro é associado a esse cargo via `custom_role_id`
3. Quando membro acessa `/tarefas`, o `OrganizationContext` calcula permissões como `member`
4. O contexto **ignora** as permissões do cargo personalizado
5. Resultado: Membro não consegue interagir corretamente com o Kanban

**Dados confirmados:**
```
Membro user_id: 306869ac-482b-49df-a9f4-b57f1743e9c8
custom_role_id: af2d912f-143a-46ca-9fe4-c8f757a2cdc5
Cargo: "Gestor de Trafego" com can_view_kanban: true
```

**Nota importante sobre RLS:**
As RLS policies das tabelas Kanban (`kanban_boards`, `kanban_columns`, `kanban_cards`) verificam APENAS se o usuário é membro da organização - elas **NÃO** verificam `can_view_kanban`. Portanto, o problema NÃO é de RLS, mas sim de:
1. Falta de carregamento das permissões do cargo personalizado no contexto
2. Falta de verificação dessas permissões nos componentes

---

### Problema 2: Modal de Edição de Cargo Sem Scroll

A imagem mostra o modal de edição do cargo "Gestor de Trafego" onde a seção "Leads" aparece cortada no final. O modal precisa de ajustes de scroll para permitir visualização de todas as seções.

**Situação atual:**
```tsx
<DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
  <ScrollArea className="flex-1 max-h-[calc(85vh-180px)] pr-4">
```

O problema é que o `ScrollArea` pode estar com altura calculada incorretamente ou com padding insuficiente.

---

## Solução Proposta

### Parte 1: Integrar Permissões de Cargo Personalizado ao Contexto

**Arquivos a modificar:**

#### 1. `src/contexts/OrganizationContext.tsx`

Expandir a interface `Permissions` para incluir todas as permissões granulares do cargo:

```typescript
interface Permissions {
  // Permissões existentes (baseadas em owner/admin/member)
  canManageCollaborators: boolean;
  canDeleteCollaborators: boolean;
  // ... outras existentes ...
  
  // NOVAS: Permissões granulares do cargo personalizado
  canViewKanban: boolean;
  canCreateTasks: boolean;
  canEditOwnTasks: boolean;
  canEditAllTasks: boolean;
  canDeleteTasks: boolean;
  canViewAllLeads: boolean;
  canViewAssignedLeads: boolean;
  canCreateLeads: boolean;
  canEditLeads: boolean;
  canDeleteLeads: boolean;
  canAssignLeads: boolean;
  canViewPipeline: boolean;
  canMoveLeadsPipeline: boolean;
  canViewChat: boolean;
  canSendMessages: boolean;
  canViewAllConversations: boolean;
  canManageTags: boolean;
  canManageAutomations: boolean;
  canViewReports: boolean;
  
  // Dados do cargo
  customRoleId: string | null;
  customRoleName: string | null;
  
  role: 'owner' | 'admin' | 'member' | null;
  loading: boolean;
}
```

Atualizar a RPC `get_my_organization_memberships` para também retornar `custom_role_id`, ou criar uma função adicional para buscar o cargo.

Modificar `loadOrganizationData` para:
1. Após obter o membership, verificar se tem `custom_role_id`
2. Se tiver, buscar as permissões do cargo em `organization_custom_roles`
3. Mesclar permissões do cargo com as permissões base do role

Lógica de merge de permissões:
```typescript
const calculatePermissionsWithCustomRole = (
  baseRole: 'owner' | 'admin' | 'member' | null,
  customRolePermissions: CustomRolePermissions | null
): Permissions => {
  const basePermissions = calculatePermissions(baseRole);
  
  // Owner e Admin sempre têm todas as permissões
  if (baseRole === 'owner' || baseRole === 'admin') {
    return {
      ...basePermissions,
      canViewKanban: true,
      canCreateTasks: true,
      // ... todas as permissões granulares como true
    };
  }
  
  // Para members, usar permissões do cargo personalizado se existir
  if (customRolePermissions) {
    return {
      ...basePermissions,
      canViewKanban: customRolePermissions.can_view_kanban,
      canCreateTasks: customRolePermissions.can_create_tasks,
      // ... mapear todas as permissões do cargo
    };
  }
  
  // Member sem cargo: permissões mínimas
  return {
    ...basePermissions,
    canViewKanban: false,
    canCreateTasks: false,
    // ... todas false
  };
};
```

#### 2. Criar nova função RPC `get_member_custom_role_permissions`

```sql
CREATE OR REPLACE FUNCTION public.get_member_custom_role_permissions(org_id UUID)
RETURNS TABLE (
  can_view_kanban BOOLEAN,
  can_create_tasks BOOLEAN,
  can_edit_own_tasks BOOLEAN,
  can_edit_all_tasks BOOLEAN,
  can_delete_tasks BOOLEAN,
  can_view_all_leads BOOLEAN,
  can_view_assigned_leads BOOLEAN,
  can_create_leads BOOLEAN,
  can_edit_leads BOOLEAN,
  can_delete_leads BOOLEAN,
  can_assign_leads BOOLEAN,
  can_view_pipeline BOOLEAN,
  can_move_leads_pipeline BOOLEAN,
  can_view_chat BOOLEAN,
  can_send_messages BOOLEAN,
  can_view_all_conversations BOOLEAN,
  can_manage_collaborators BOOLEAN,
  can_manage_integrations BOOLEAN,
  can_manage_tags BOOLEAN,
  can_manage_automations BOOLEAN,
  can_view_reports BOOLEAN,
  custom_role_id UUID,
  custom_role_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ocr.can_view_kanban,
    ocr.can_create_tasks,
    ocr.can_edit_own_tasks,
    ocr.can_edit_all_tasks,
    ocr.can_delete_tasks,
    ocr.can_view_all_leads,
    ocr.can_view_assigned_leads,
    ocr.can_create_leads,
    ocr.can_edit_leads,
    ocr.can_delete_leads,
    ocr.can_assign_leads,
    ocr.can_view_pipeline,
    ocr.can_move_leads_pipeline,
    ocr.can_view_chat,
    ocr.can_send_messages,
    ocr.can_view_all_conversations,
    ocr.can_manage_collaborators,
    ocr.can_manage_integrations,
    ocr.can_manage_tags,
    ocr.can_manage_automations,
    ocr.can_view_reports,
    ocr.id AS custom_role_id,
    ocr.name AS custom_role_name
  FROM organization_members om
  JOIN organization_custom_roles ocr ON om.custom_role_id = ocr.id
  WHERE om.user_id = auth.uid()
    AND om.organization_id = org_id
  LIMIT 1;
$$;
```

#### 3. `src/pages/Tasks.tsx` - Verificar permissão antes de exibir

```tsx
const Tasks = () => {
  const { organizationId, isReady } = useOrganizationReady();
  const { permissions } = useOrganization();

  if (!isReady || !organizationId) {
    return <LoadingAnimation text="Carregando tarefas..." />;
  }

  // Verificar permissão de visualização do Kanban
  if (!permissions.canViewKanban) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center">
        <Shield className="h-16 w-16 text-muted-foreground/50 mb-4" />
        <h2 className="text-xl font-semibold">Acesso Restrito</h2>
        <p className="text-muted-foreground">
          Você não tem permissão para visualizar o quadro de tarefas.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ... resto do componente */}
    </div>
  );
};
```

#### 4. `src/components/KanbanBoard.tsx` - Verificar permissões para ações

```tsx
export const KanbanBoard = ({ organizationId }: KanbanBoardProps) => {
  const { permissions } = useOrganization();
  
  // Usar permissões granulares para controlar ações
  const canCreateTasks = permissions.canCreateTasks;
  const canEditAllTasks = permissions.canEditAllTasks;
  const canEditOwnTasks = permissions.canEditOwnTasks;
  const canDeleteTasks = permissions.canDeleteTasks;
  
  // Passar essas permissões para componentes filhos
  // e condicionar botões/ações
};
```

---

### Parte 2: Corrigir Scroll do Modal de Edição de Cargo

**Arquivo:** `src/components/RoleManagementTab.tsx`

#### Problema Visual Identificado
O modal tem `max-h-[85vh]` e o ScrollArea tem `max-h-[calc(85vh-180px)]`, mas o footer tem `pt-4` e `border-t` que podem estar consumindo espaço adicional.

#### Solução
1. Aumentar a área disponível para scroll
2. Adicionar padding inferior dentro do ScrollArea para garantir que o último item não fique cortado

```tsx
// Linha ~461
<DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
  <DialogHeader className="flex-shrink-0">
    {/* ... */}
  </DialogHeader>

  <ScrollArea className="flex-1 overflow-y-auto pr-4">
    <div className="space-y-6 pb-6"> {/* padding-bottom extra */}
      {/* Conteúdo do formulário */}
    </div>
  </ScrollArea>

  <DialogFooter className="flex-shrink-0 pt-4 border-t mt-auto">
    {/* Botões */}
  </DialogFooter>
</DialogContent>
```

Mudanças específicas:
1. `max-h-[85vh]` -> `max-h-[90vh]` (mais espaço vertical)
2. Remover `max-h-[calc(85vh-180px)]` do ScrollArea (deixar flex-1 calcular)
3. Adicionar `pb-6` no container interno do ScrollArea
4. Adicionar `mt-auto` no DialogFooter para garantir posicionamento

---

## Resumo dos Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `src/contexts/OrganizationContext.tsx` | Expandir interface Permissions, carregar permissões do cargo personalizado |
| `src/pages/Tasks.tsx` | Verificar `canViewKanban` antes de renderizar |
| `src/components/KanbanBoard.tsx` | Usar permissões granulares para controlar ações |
| `src/components/RoleManagementTab.tsx` | Ajustar altura e scroll do modal |
| **Migration SQL** | Criar função RPC `get_member_custom_role_permissions` |

---

## Fluxo Final Esperado

```
┌─────────────────────────────────────────────────────────────┐
│ Login do Membro com Cargo "Gestor de Trafego"               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ OrganizationContext carrega:                                │
│ 1. get_my_organization_memberships → role: 'member'         │
│ 2. get_member_custom_role_permissions → can_view_kanban:true│
│ 3. Mescla permissões base + cargo personalizado             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Membro acessa /tarefas                                      │
│ permissions.canViewKanban === true                          │
│ → KanbanBoard é renderizado com quadro compartilhado        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Membro pode:                                                │
│ ✅ Ver colunas e tarefas                                    │
│ ✅ Criar tarefas (se can_create_tasks: true)                │
│ ✅ Editar próprias tarefas (se can_edit_own_tasks: true)    │
│ ✅ Editar todas tarefas (se can_edit_all_tasks: true)       │
│ ✅ Excluir tarefas (se can_delete_tasks: true)              │
└─────────────────────────────────────────────────────────────┘
```

---

## Resultado Visual do Modal Corrigido

```
┌─────────────────────────────────────────────────────────┐
│ Editar Cargo                                        ✕   │
│ Configure as permissões que os membros...               │
├─────────────────────────────────────────────────────────┤
│ Nome do Cargo *                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Gestor de Trafego                                   │ │ ← Scrollable
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Descrição                                               │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Descreva as responsabilidades deste cargo...        │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Cor do Cargo                                            │
│ ○ ○ ● ○ ○ ○ ○ ○ ○ ○                                     │
│                                                         │
│ ─────────────────────────────────────────────────────   │
│                                                         │
│ 📋 Tarefas / Kanban                                     │
│   ☑ Visualizar quadro Kanban    ☑ Criar tarefas         │
│   ☑ Editar próprias tarefas     ☑ Editar todas tarefas  │
│   ☑ Excluir tarefas                                     │
│                                                         │
│ ─────────────────────────────────────────────────────   │
│                                                         │
│ 👥 Leads                                                │
│   ☑ Ver leads atribuídos        ☑ Ver TODOS os leads    │
│   ☑ Criar leads                 ☑ Editar leads          │
│   ☑ Excluir leads               ☑ Atribuir leads        │
│                                                         │    ▲
│ ─────────────────────────────────────────────────────   │    │ Agora
│                                                         │    │ com scroll
│ 📊 Pipeline                                             │    │ visível
│   ☑ Visualizar pipeline         ☑ Mover leads           │    ▼
│                                                         │
│ ─────────────────────────────────────────────────────   │
│                                                         │
│ 💬 Chat                                                 │
│   ☑ Acessar chat                ☑ Enviar mensagens      │
│   ☐ Ver TODAS as conversas                              │
│                                                         │
│ ─────────────────────────────────────────────────────   │
│                                                         │
│ ⚙️ Administração                                        │
│   ☐ Gerenciar colaboradores     ☐ Gerenciar integrações │
│   ☐ Gerenciar tags              ☐ Gerenciar automações  │
│   ☑ Visualizar relatórios                               │
│                                                         │
│ (espaço extra para garantir último item visível)        │
├─────────────────────────────────────────────────────────┤
│                        [Cancelar]  [Salvar Alterações]  │
└─────────────────────────────────────────────────────────┘
```

Esta solução garante que:
1. Membros com cargo personalizado vejam corretamente o Kanban compartilhado
2. As permissões granulares do cargo controlem as ações disponíveis
3. O modal de edição de cargos permita scroll completo de todas as opções
