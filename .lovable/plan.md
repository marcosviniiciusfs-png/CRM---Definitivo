
# Plano: Separar Webhook de Formulários em Nova Aba com Cards Estilo CRM

## Visão Geral

Refatorar a seção de Integrações para:
1. Criar uma estrutura com **Tabs** separando as integrações atuais dos "Webhooks de Formulários"
2. Permitir **múltiplos webhooks** por organização (atualmente limitado a 1)
3. Exibir cada webhook como um **card no estilo da imagem de referência** com:
   - Nome/Tag do webhook
   - Badge de status (Ativa/Inativa)
   - Badge "Receber Webhook"
   - Etapa padrão configurada
   - Responsável pela distribuição
   - Tags associadas
   - Estatísticas (Total, Convertidos, Perdidos)
   - Ações (visualizar, configurar, deletar)

---

## Layout Proposto

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Integrações                                                                    │
│  Conecte e gerencie suas integrações com serviços externos                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│  [ Conexões ]     [ Webhooks ]                                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ABA "Conexões" (atual):                                                        │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │ WhatsApp Connection                                                         ││
│  │ Mais Integrações (Hub)                                                      ││
│  │ Facebook Leads Connection                                                   ││
│  │ Logs de Acompanhamento                                                      ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
│  ABA "Webhooks" (nova):                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │  🔗 Integrações   2                                          🔌 Ativas (1)  ││
│  │ ─────────────────────────────────────────────────────────────────────────── ││
│  │                                                                             ││
│  │  ┌─────────────────────────────────────────────────────────────────────────┐││
│  │  │ 🔗 SIMULADOR                                                 [ Ativa ] │││
│  │  │     [ 🔗 Receber Webhook ]                                              │││
│  │  │                                                                         │││
│  │  │  Etapa Padrão: NOVO LEAD                                                │││
│  │  │  Responsável: Distribuição Automática                                   │││
│  │  │  Tags: (SIMULADOR)                                                      │││
│  │  │  📊 Total: 75   ✓ 57   ✕ 18                                             │││
│  │  │                                                                         │││
│  │  │  [ 👁 ]  [ ⚙ ]                                                  [ 🗑 ]  │││
│  │  └─────────────────────────────────────────────────────────────────────────┘││
│  │                                                                             ││
│  │  ┌─────────────────────────────────────────────────────────────────────────┐││
│  │  │ 🔗 LANDING PAGE                                             [ Inativa ] │││
│  │  │     [ 🔗 Receber Webhook ]                                              │││
│  │  │  ...                                                                    │││
│  │  └─────────────────────────────────────────────────────────────────────────┘││
│  │                                                                             ││
│  │            [ + Criar Novo Webhook ]                                         ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Mudanças no Banco de Dados

### 1. Alterar tabela `webhook_configs` para suportar múltiplos webhooks

**Migration SQL:**
```sql
-- Remover constraint unique para permitir múltiplos webhooks por organização
ALTER TABLE webhook_configs 
DROP CONSTRAINT IF EXISTS webhook_configs_organization_id_key;

-- Adicionar nome/título para identificação do webhook
ALTER TABLE webhook_configs 
ADD COLUMN IF NOT EXISTS name TEXT DEFAULT 'Webhook';

-- Adicionar campo para responsável padrão
ALTER TABLE webhook_configs 
ADD COLUMN IF NOT EXISTS default_responsible_user_id UUID REFERENCES auth.users(id);

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_webhook_configs_organization 
ON webhook_configs(organization_id);
```

---

## Novos Componentes

### 1. `WebhookIntegrationsTab.tsx` (Nova aba)

Componente que gerencia a lista de webhooks com:
- Contador de integrações ativas
- Lista de cards de webhook
- Botão para criar novo webhook

```typescript
interface WebhookIntegrationsTabProps {
  organizationId: string;
}

export const WebhookIntegrationsTab = ({ organizationId }: WebhookIntegrationsTabProps) => {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Carregar webhooks da organização
  // Abrir modal de criação
  // Listar WebhookCard para cada webhook
};
```

### 2. `WebhookCard.tsx` (Card individual)

Card estilizado conforme a imagem de referência:

```typescript
interface WebhookCardProps {
  webhook: WebhookConfig;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStatus: () => void;
}

export const WebhookCard = ({ webhook, onEdit, onDelete, onToggleStatus }: WebhookCardProps) => {
  // Exibir:
  // - Nome do webhook (da tag ou name)
  // - Badge de status (Ativa/Inativa)
  // - Badge "Receber Webhook"
  // - Etapa padrão (buscar do mapeamento de funil)
  // - Responsável (se configurado)
  // - Tag associada
  // - Estatísticas (total, won, lost)
  // - Ícones de ação (visualizar URL, configurar, deletar)
};
```

### 3. `CreateWebhookModal.tsx` (Modal de criação)

Modal para criar novo webhook com campos:
- Nome do webhook
- Nome da tag a ser criada
- Seletor de funil de destino
- Responsável padrão (opcional)

### 4. `WebhookConfigModal.tsx` (Modal de configuração)

Modal para editar webhook existente:
- Editar nome/tag
- Alterar funil de destino
- Regenerar token
- Copiar URL
- Ativar/desativar

---

## Arquivo Principal: `src/pages/Integrations.tsx`

### Mudanças:

1. **Importar componentes de Tabs**
2. **Criar estado para aba ativa**
3. **Mover lógica de webhook para novo componente**
4. **Estrutura com Tabs:**

```tsx
<Tabs defaultValue="conexoes">
  <TabsList>
    <TabsTrigger value="conexoes">Conexões</TabsTrigger>
    <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
  </TabsList>
  
  <TabsContent value="conexoes">
    <WhatsAppConnection />
    <IntegrationsHub />
    <FacebookLeadsConnection />
    <LogsCard />
  </TabsContent>
  
  <TabsContent value="webhooks">
    <WebhookIntegrationsTab organizationId={organizationId} />
  </TabsContent>
</Tabs>
```

---

## Detalhes do Card de Webhook (baseado na imagem)

```tsx
<Card className="border">
  {/* Header com nome e status */}
  <div className="flex items-start justify-between p-4 pb-2">
    <div className="flex items-center gap-3">
      <div className="p-2 bg-primary/10 rounded-lg">
        <Link2 className="h-5 w-5 text-primary" />
      </div>
      <div>
        <h3 className="font-semibold text-lg uppercase">{webhook.name || tagName}</h3>
        <Badge variant="outline" className="text-xs mt-1">
          <Link2 className="h-3 w-3 mr-1" />
          Receber Webhook
        </Badge>
      </div>
    </div>
    <Badge variant={webhook.is_active ? "success" : "secondary"}>
      {webhook.is_active ? "Ativa" : "Inativa"}
    </Badge>
  </div>
  
  {/* Informações */}
  <CardContent className="pt-3 space-y-2 text-sm">
    <div>
      <span className="text-muted-foreground">Etapa Padrão:</span>{" "}
      <span className="font-medium">{stageName || "NOVO LEAD"}</span>
    </div>
    <div>
      <span className="text-muted-foreground">Responsável:</span>{" "}
      <span className="font-medium">{responsibleName || "Distribuição Automática"}</span>
    </div>
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground">Tags:</span>
      <Badge variant="secondary" className="text-xs">
        {tagName}
      </Badge>
    </div>
    
    {/* Estatísticas */}
    <div className="flex items-center gap-3 pt-2">
      <span className="text-muted-foreground text-xs flex items-center gap-1">
        <Activity className="h-3 w-3" />
        Total: {stats.total}
      </span>
      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
        ✓ {stats.won}
      </Badge>
      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
        ✕ {stats.lost}
      </Badge>
    </div>
  </CardContent>
  
  {/* Footer com ações */}
  <div className="flex items-center justify-between px-4 py-3 border-t">
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" onClick={handleViewUrl}>
        <Eye className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={onEdit}>
        <Settings className="h-4 w-4" />
      </Button>
    </div>
    <Button variant="ghost" size="icon" className="text-destructive" onClick={onDelete}>
      <Trash2 className="h-4 w-4" />
    </Button>
  </div>
</Card>
```

---

## Consulta para Estatísticas do Webhook

```typescript
const loadWebhookStats = async (webhookId: string, tagId: string) => {
  // Total de leads com a tag do webhook
  const { count: total } = await supabase
    .from('lead_tag_assignments')
    .select('*, leads!inner(*)', { count: 'exact', head: true })
    .eq('tag_id', tagId);

  // Leads convertidos (stage_type = 'won')
  const { count: won } = await supabase
    .from('lead_tag_assignments')
    .select('*, leads!inner(funnel_stage_id, funnel_stages!inner(stage_type))', { count: 'exact', head: true })
    .eq('tag_id', tagId)
    .eq('leads.funnel_stages.stage_type', 'won');

  // Leads perdidos (stage_type = 'lost')
  const { count: lost } = await supabase
    .from('lead_tag_assignments')
    .select('*, leads!inner(funnel_stage_id, funnel_stages!inner(stage_type))', { count: 'exact', head: true })
    .eq('tag_id', tagId)
    .eq('leads.funnel_stages.stage_type', 'lost');

  return { total, won, lost };
};
```

---

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| **Migration SQL** | CRIAR | Alterar `webhook_configs` para suportar múltiplos |
| `src/components/WebhookIntegrationsTab.tsx` | CRIAR | Nova aba com lista de webhooks |
| `src/components/WebhookCard.tsx` | CRIAR | Card individual estilo CRM |
| `src/components/CreateWebhookModal.tsx` | CRIAR | Modal para criar webhook |
| `src/components/WebhookConfigModal.tsx` | CRIAR | Modal para configurar webhook |
| `src/pages/Integrations.tsx` | MODIFICAR | Adicionar Tabs e reorganizar |

---

## Checklist de Validação

1. **Banco de Dados:**
   - [ ] Migration aplica sem erros
   - [ ] Múltiplos webhooks podem ser criados por org
   - [ ] Campo `name` adicionado com default

2. **Interface:**
   - [ ] Tabs funcionam corretamente
   - [ ] Cards exibem todas as informações
   - [ ] Estatísticas calculadas corretamente
   - [ ] Ações (criar, editar, deletar) funcionam

3. **Funcionalidade:**
   - [ ] Webhooks novos recebem leads corretamente
   - [ ] Tags são atribuídas aos leads
   - [ ] Mapeamento de funil funciona por webhook
   - [ ] URL copiável para cada webhook

4. **Estilo:**
   - [ ] Cards seguem o design da imagem de referência
   - [ ] Badges de status com cores corretas
   - [ ] Responsivo em mobile

---

## Considerações de Performance

- Usar `useMemo` para cálculos de estatísticas
- Carregar estatísticas de forma lazy (não bloquear lista)
- Implementar skeleton loading para os cards
- Cache das consultas de funnel/stages
