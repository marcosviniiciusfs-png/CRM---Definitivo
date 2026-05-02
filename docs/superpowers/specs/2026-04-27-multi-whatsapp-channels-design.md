# Multi-WhatsApp: Canais com Múltiplos Números

**Data:** 2026-04-27
**Status:** Aprovado pelo usuário

## Resumo

Permitir que uma organização conecte até 5 números de WhatsApp (canais) ao CRM. Cada canal recebe um nome personalizado. Na página Chat, um seletor de canal filtra as conversas por número. Leads são automaticamente associados ao canal pelo qual entraram.

## Decisões Tomadas

| Decisão | Escolha |
|---|---|
| Associação lead-canal | Coluna `whatsapp_instance_id` na tabela `leads` (Abordagem A) |
| Nome do canal | Coluna `channel_name` na tabela `whatsapp_instances` |
| Filtro no Chat | Seletor/dropdown no topo da sidebar ("Todos os canais" / canal específico) |
| Funil por canal | Mesmo funil para todos os canais |
| Limite de canais | 5 por organização |
| Layout Integrações | Card compacto com badge "N ativos" → clique abre modal com lista de canais |
| Indicador visual no Chat | Barra colorida ao lado de cada conversa indicando o canal |

## Mudanças no Banco de Dados

### Migration: Adicionar colunas

```sql
-- 1. Adicionar nome do canal na tabela whatsapp_instances
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS channel_name TEXT;

-- 2. Adicionar referencia ao canal na tabela leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS whatsapp_instance_id UUID
  REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;

-- 3. Adicionar coluna de cor para diferenciar canais no chat
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS channel_color TEXT DEFAULT '#25D366';
```

### Backfill

- Leads existentes com `source = 'WhatsApp'` ou que já têm mensagens no chat devem ser associados à instância WhatsApp ativa da organização.

## Mudanças por Camada

### 1. Página Integrações (`src/pages/Integrations.tsx`)

**Card WhatsApp recolhido (padrão):**
- Ícone WhatsApp + "Mensagens"
- Badge com contagem de canais ativos (ex: "3 ativos")
- Sem canais: mostra botão "Conectar"

**Modal de canais (ao clicar no card):**
- Header: "Canais WhatsApp" + "N de 5 conectados" + botão fechar
- Lista de canais: cada linha com ícone, nome do canal, número, badge de leads, botão "Editar" e "Desconectar"
- Footer: botão "Conectar novo canal (N restantes)"
- Editar: inline, nome vira input com Salvar/Cancelar

**Conectar novo canal:**
- Abre dialog de QR code existente (WhatsAppConnection)
- Após conexão bem-sucedida, pergunta o nome do canal
- Valida limite de 5 canais antes de permitir nova conexão

### 2. Página Chat (`src/pages/Chat.tsx`)

**Seletor de canal:**
- Dropdown no topo da sidebar, acima da lista de conversas
- Opção "Todos os canais" (padrão) mostra todas as conversas
- Cada canal listado com indicador colorido
- Ao selecionar um canal, filtra leads por `whatsapp_instance_id`

**Indicador de canal nas conversas:**
- Barra vertical colorida ao lado direito de cada conversa na lista
- Cor definida por `channel_color` da instância
- Tooltip com nome do canal ao hover

**Envio de mensagens:**
- Ao responder um lead, usa a instância associada ao `whatsapp_instance_id` do lead
- Remove o `limit(1).maybeSingle()` atual — busca a instância específica do lead

### 3. Edge Function: `whatsapp-message-webhook`

- Quando uma mensagem chega, identifica a instância pelo `instance_name`
- Ao criar/encontrar o lead, associa `whatsapp_instance_id` com o ID da instância
- Isso garante que leads novos já ficam vinculados ao canal correto

### 4. Edge Function: `create-whatsapp-instance`

- Aceita parâmetro opcional `channel_name` no body
- Valida se a organização já tem 5 instâncias (rejeita se exceder)
- Salva `channel_name` e `channel_color` no insert

### 5. Componentes novos

**`WhatsAppChannelModal.tsx`** — Modal de gestão de canais:
- Lista canais com status, nome, número, leads
- Botões editar nome / desconectar
- Botão conectar novo canal

**`ChannelSelector.tsx`** — Dropdown de seletor de canal no Chat:
- "Todos os canais" + lista de canais ativos
- Filtra `leads` por `whatsapp_instance_id` selecionado

### 6. Edge Functions afetadas

| Função | Mudança |
|---|---|
| `create-whatsapp-instance` | Aceitar `channel_name`, validar limite 5 |
| `whatsapp-message-webhook` | Associar `whatsapp_instance_id` ao lead |
| `send-whatsapp-message` | Buscar instância pelo `whatsapp_instance_id` do lead (não mais `limit(1)`) |
| `send-whatsapp-media` | Mesmo: buscar instância pelo `whatsapp_instance_id` do lead |
| `check-whatsapp-status` | Retornar `channel_name` e `channel_color` |
| `disconnect-whatsapp-instance` | Manter funcionando por instância |
| `delete-whatsapp-instance` | Manter funcionando por instância |

## Cores dos Canais

Paleta padrão para diferenciar canais no chat (atribuída na ordem de criação):

```
#25D366 (verde WhatsApp)
#3b82f6 (azul)
#f59e0b (amarelo)
#ef4444 (vermelho)
#8b5cf6 (roxo)
```

Quando o 6º canal for criado (se o limite aumentar), recomeça do verde.

## Regras de Negócio

1. **Limite:** Máximo de 5 canais WhatsApp por organização
2. **Nome obrigatório:** Ao conectar, o usuário deve dar um nome ao canal
3. **Lead por canal:** Um lead pertence a exatamente um canal (o pelo qual entrou)
4. **Desconectar:** Ao desconectar um canal, os leads permanecem associados mas mensagens param de ser recebidas/enviadas por aquele número
5. **Reconectar:** Se reconectar o mesmo número, os leads anteriores continuam associados
6. **Funil:** Todos os canais direcionam leads para o mesmo funil padrão da organização
