# Kairoz CRM - Documentação Completa do Sistema

## Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura do Sistema](#arquitetura-do-sistema)
3. [Funcionalidades Principais](#funcionalidades-principais)
4. [Integrações](#integrações)
5. [Estrutura do Banco de Dados](#estrutura-do-banco-de-dados)
6. [Sistema de Permissões](#sistema-de-permissões)
7. [Edge Functions](#edge-functions)
8. [Configurações e Personalização](#configurações-e-personalização)
9. [Segurança](#segurança)
10. [Escalabilidade](#escalabilidade)

---

## Visão Geral

O **Kairoz CRM** é uma plataforma completa de gestão de relacionamento com clientes (CRM) desenvolvida para equipes de vendas. O sistema oferece:

- **Gestão de Leads**: Captura, organização e acompanhamento de leads
- **Pipeline de Vendas**: Funis personalizáveis com múltiplas etapas
- **Chat WhatsApp**: Integração completa com WhatsApp via Evolution API
- **Integrações Meta**: Facebook Lead Ads e Meta Conversions API
- **Automação**: Regras de automação e distribuição automática de leads
- **Equipes**: Gestão de colaboradores e equipes de vendas
- **Métricas**: Dashboards completos com análises de desempenho

### Stack Tecnológico

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 18, TypeScript, Vite |
| Estilização | Tailwind CSS, shadcn/ui |
| Estado | React Query (TanStack Query) |
| Backend | Supabase (Lovable Cloud) |
| Banco de Dados | PostgreSQL |
| Autenticação | Supabase Auth |
| Funções Serverless | Deno (Edge Functions) |
| WhatsApp | Evolution API |
| Pagamentos | Stripe |

---

## Arquitetura do Sistema

### Estrutura de Pastas

```
src/
├── assets/              # Imagens, ícones e arquivos estáticos
├── components/          # Componentes React reutilizáveis
│   ├── chat/           # Componentes do chat WhatsApp
│   ├── dashboard/      # Widgets do dashboard
│   └── ui/             # Componentes base (shadcn/ui)
├── contexts/           # Contexts React (Auth, Theme, Organization)
├── hooks/              # Custom hooks
├── integrations/       # Configuração Supabase
├── lib/                # Utilitários
├── pages/              # Páginas/rotas da aplicação
└── types/              # Tipos TypeScript

supabase/
├── config.toml         # Configuração do Supabase
└── functions/          # Edge Functions (Deno)
```

### Fluxo de Dados

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│  Edge Functions │────▶│   PostgreSQL    │
│   (React)       │◀────│    (Deno)       │◀────│   (Supabase)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │
         │                       ▼
         │              ┌─────────────────┐
         │              │  APIs Externas  │
         │              │  - Evolution    │
         │              │  - Meta/Facebook│
         │              │  - Stripe       │
         │              │  - Google Cal   │
         │              └─────────────────┘
         │
         ▼
┌─────────────────┐
│   Realtime      │
│   (WebSocket)   │
└─────────────────┘
```

---

## Funcionalidades Principais

### 1. Dashboard

**Rota:** `/dashboard`

O dashboard principal exibe métricas em tempo real:

| Métrica | Descrição |
|---------|-----------|
| Novos Leads | Leads criados no mês atual |
| Novos Clientes | Leads convertidos (stage 'won') no mês |
| Tarefas Atuais | Cards Kanban não concluídos |
| Tarefas de Leads | Tarefas associadas a leads específicos |
| Tarefas Atrasadas | Tasks com due_date vencida |
| Taxa de Perda | % de leads em stages 'lost' |

**Widgets adicionais:**
- Gráfico de vendas por período
- Metas individuais e de equipe
- Ranking de vendedores
- Forecast de vendas
- Vendas por fonte

### 2. Pipeline de Vendas

**Rota:** `/pipeline`

Sistema de funis de vendas com drag-and-drop:

#### Funil Padrão (criado automaticamente)
1. Novo Lead
2. Qualificação / Aquecido
3. Agendamento Realizado
4. Reunião Feita
5. Proposta / Negociação
6. Aprovação / Análise
7. Venda Realizada (won)
8. Pós-venda / Ativação
9. Perdido (lost)

#### Funcionalidades do Pipeline
- **Múltiplos funis**: Tabs para navegar entre funis
- **Drag-and-drop**: Mover leads entre etapas
- **Busca**: Filtrar por nome ou fonte
- **Badges de fonte**: WhatsApp, Facebook, Webhook, Manual
- **Tags personalizadas**: Categorização de leads
- **Deduplicação**: Sistema inteligente de detecção de duplicatas

### 3. Chat WhatsApp

**Rota:** `/chat`

Integração completa com WhatsApp via Evolution API:

#### Funcionalidades
- **Mensagens de texto**: Envio e recebimento
- **Mídia**: Imagens, áudios, vídeos, documentos
- **Stickers e GIFs**: Suporte completo
- **Áudio PTT**: Gravação de áudio push-to-talk
- **Resposta citada**: Responder mensagens específicas
- **Reações**: Emojis em mensagens
- **Mensagens fixadas**: Pin de mensagens importantes
- **Status online**: Indicador de presença
- **Typing indicator**: Status de digitação

#### Arquitetura do Chat
```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Evolution   │────▶│   Webhook    │────▶│  Supabase    │
│     API      │     │  (QR/Msg)    │     │  Database    │
└──────────────┘     └──────────────┘     └──────────────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │   Realtime   │
                                          │ Subscription │
                                          └──────────────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │   Frontend   │
                                          │    (Chat)    │
                                          └──────────────┘
```

### 4. Leads

**Rota:** `/leads`

Gestão completa de leads:

#### Campos do Lead
| Campo | Tipo | Descrição |
|-------|------|-----------|
| nome_lead | TEXT | Nome do contato |
| telefone_lead | TEXT | Telefone (WhatsApp) |
| email | TEXT | Email do contato |
| empresa | TEXT | Empresa/organização |
| idade | INTEGER | Idade do lead |
| valor | NUMERIC(15,2) | Valor do negócio |
| source | TEXT | Fonte (WhatsApp, Facebook, Manual, etc.) |
| responsavel | TEXT | Nome do responsável |
| responsavel_user_id | UUID | ID do responsável |
| funnel_id | UUID | Funil associado |
| funnel_stage_id | UUID | Etapa atual do funil |
| descricao_negocio | TEXT | Descrição do negócio |
| additional_data | JSONB | Dados extras de formulários |

#### Funcionalidades
- **Importação**: Excel/CSV com mapeamento de campos
- **Exportação**: Download de dados
- **Filtros**: Por status, responsável, fonte, data
- **Deduplicação inteligente**: Evita leads duplicados
- **Histórico de tentativas**: Rastreia múltiplos contatos

### 5. Kanban de Tarefas

**Rota:** `/tasks`

Board Kanban para gestão de tarefas:

#### Colunas Padrão
- A Fazer
- Em Progresso
- Concluído

#### Funcionalidades
- **Drag-and-drop**: Entre colunas e dentro delas
- **Tipos de tarefa**: Normal ou associada a lead
- **Menções**: @usuário cria notificações
- **Due date**: Data de vencimento
- **Tempo estimado**: Em minutos
- **Sync com Google Calendar**: Criar eventos a partir de tarefas

### 6. Equipes

**Rota:** `/equipes`

Gestão de equipes de vendas:

- **Criação de equipes**: Nome, descrição, cor, avatar
- **Líder de equipe**: Designação de líder
- **Membros**: Drag-and-drop para adicionar/remover
- **Metas de equipe**: Goals por período (semanal, mensal, trimestral)
- **Tipos de meta**: Contagem de vendas, receita, leads convertidos

### 7. Colaboradores

**Rota:** `/colaboradores`

Gestão de membros da organização:

#### Dashboard Individual
- Leads atribuídos
- Vendas realizadas
- Taxa de conversão
- Tempo médio de resposta
- Leads pendentes
- Receita gerada

#### Métricas Visuais
- Gauge de meta
- Gráficos de desempenho
- Ranking comparativo

### 8. Ranking

**Rota:** `/ranking`

Leaderboard de vendas:

- **Top 3**: Exibição em pódio com molduras animadas
- **Lista completa**: Todos os colaboradores ordenados
- **Filtros**: Mês, trimestre, ano
- **Métricas**: Vendas, receita, % de meta

### 9. Métricas de Leads

**Rota:** `/lead-metrics`

Análise detalhada de leads:

#### Tabs
- **WhatsApp**: Métricas de leads via WhatsApp
- **Facebook**: Leads do Facebook Lead Ads
- **Cadastro Manual**: Leads criados manualmente
- **Campanhas Meta**: Performance de campanhas de ads

### 10. Produção

**Rota:** `/producao`

Blocos de produção mensal:

- **Vendas do mês**: Total de vendas realizadas
- **Receita**: Soma dos valores dos leads ganhos
- **Custo**: Custos associados (se configurado)
- **Lucro**: Receita - Custo
- **Comparativo**: Variação vs mês anterior

### 11. Distribuição de Leads (Roleta)

**Rota:** `/lead-distribution`

Sistema automático de distribuição:

#### Métodos de Distribuição
| Método | Descrição |
|--------|-----------|
| round_robin | Rotação sequencial |
| weighted | Baseado em peso/prioridade |
| load_based | Baseado em carga atual |
| random | Distribuição aleatória |

#### Configurações por Agente
- Capacidade máxima de leads
- Horário de trabalho
- Peso/prioridade
- Pausa temporária

#### Triggers
- Novos leads (qualquer fonte)
- Leads do WhatsApp
- Leads do Facebook
- Leads de Webhooks

### 12. Funil Builder

**Rota:** `/funnel-builder`

Criação e edição de funis:

#### Configurações de Etapa
- Nome e descrição
- Cor e ícone/emoji
- Valor padrão do negócio
- Campos obrigatórios
- Tipo de etapa (custom, won, lost)
- Automações (enviar mensagem, criar tarefa, atribuir agente)

#### Mapeamento de Fontes
- Direcionar leads por fonte para etapas específicas
- Configurar por formulário do Facebook
- Configurar por canal do WhatsApp

---

## Integrações

### 1. WhatsApp (Evolution API)

**Configuração:** Settings > Integrações > WhatsApp

#### Fluxo de Conexão
1. Criar instância no CRM
2. Escanear QR Code
3. Webhook configurado automaticamente
4. Pronto para enviar/receber mensagens

#### Edge Functions
| Função | Descrição |
|--------|-----------|
| `create-whatsapp-instance` | Cria nova instância |
| `delete-whatsapp-instance` | Remove instância |
| `check-whatsapp-status` | Verifica status da conexão |
| `send-whatsapp-message` | Envia mensagem de texto |
| `send-whatsapp-media` | Envia mídia (imagem, áudio, vídeo, documento) |
| `send-whatsapp-reaction` | Envia reação a mensagem |
| `whatsapp-qr-webhook` | Recebe eventos de QR e conexão |
| `whatsapp-message-webhook` | Recebe mensagens |

#### Variáveis de Ambiente
```
EVOLUTION_API_URL=https://sua-evolution-api.com
EVOLUTION_API_KEY=sua_api_key
EVOLUTION_WEBHOOK_SECRET=seu_webhook_secret
```

### 2. Facebook Lead Ads

**Configuração:** Settings > Integrações > Facebook Leads

#### Permissões Necessárias
- `leads_retrieval`
- `pages_show_list`
- `pages_manage_metadata`
- `pages_read_engagement`
- `pages_manage_ads`
- `business_management`

#### Fluxo OAuth
1. Iniciar conexão no CRM
2. Autorizar no Facebook
3. Selecionar página e formulário
4. Webhook configurado automaticamente

#### Edge Functions
| Função | Descrição |
|--------|-----------|
| `facebook-oauth-initiate` | Inicia fluxo OAuth |
| `facebook-oauth-callback` | Callback do OAuth |
| `facebook-leads-webhook` | Recebe leads do Facebook |
| `facebook-subscribe-webhook` | Inscreve webhook no Facebook |
| `facebook-list-lead-forms` | Lista formulários disponíveis |

### 3. Meta Conversions API (CAPI)

**Configuração:** Settings > Integrações > Meta Pixel

Envia eventos de conversão para o Meta quando leads são convertidos:

#### Configuração
- Pixel ID
- Access Token
- Configuração global (todos os funis)

#### Evento Enviado
- **Purchase**: Quando lead move para stage 'won'
- Dados: email (hash SHA256), telefone (hash SHA256), valor

### 4. Google Calendar

**Configuração:** Settings > Integrações > Google Calendar

#### Funcionalidades
- Visualizar eventos do calendário
- Criar eventos a partir do CRM
- Sincronizar tarefas Kanban

#### Edge Functions
| Função | Descrição |
|--------|-----------|
| `google-calendar-oauth-initiate` | Inicia OAuth |
| `google-calendar-oauth-callback` | Callback OAuth |
| `list-calendar-events` | Lista eventos |
| `create-calendar-event` | Cria evento |
| `update-calendar-event` | Atualiza evento |
| `delete-calendar-event` | Remove evento |

### 5. Webhooks Externos

**Configuração:** Settings > Integrações > Webhooks

Recebe leads de formulários externos:

#### Endpoint
```
POST https://[project-id].supabase.co/functions/v1/form-webhook?token=[webhook_token]
```

#### Payload Esperado
```json
{
  "nome": "Nome do Lead",
  "telefone": "11999999999",
  "email": "email@exemplo.com",
  "empresa": "Empresa",
  "valor": 1000,
  "descricao": "Descrição do negócio",
  "source": "Landing Page"
}
```

### 6. Stripe (Pagamentos)

#### Planos Disponíveis
| Plano | Preço | Colaboradores |
|-------|-------|---------------|
| Star | R$ 197/mês | 5 |
| Pro | R$ 497/mês | 15 |
| Elite | R$ 1.970/mês | 30 |

**Adicional:** R$ 30/mês por colaborador extra

#### Edge Functions
| Função | Descrição |
|--------|-----------|
| `create-checkout` | Cria sessão de checkout |
| `check-subscription` | Verifica status da assinatura |
| `update-subscription` | Atualiza/upgrade de plano |
| `customer-portal` | Portal de billing do Stripe |

---

## Estrutura do Banco de Dados

### Tabelas Principais

#### `organizations`
```sql
id UUID PRIMARY KEY
name TEXT NOT NULL
created_at TIMESTAMP
updated_at TIMESTAMP
```

#### `organization_members`
```sql
id UUID PRIMARY KEY
organization_id UUID REFERENCES organizations
user_id UUID REFERENCES auth.users
email TEXT
role organization_role -- 'owner', 'admin', 'member'
created_at TIMESTAMP
```

#### `leads`
```sql
id UUID PRIMARY KEY
organization_id UUID REFERENCES organizations
nome_lead TEXT NOT NULL
telefone_lead TEXT NOT NULL
email TEXT
empresa TEXT
idade INTEGER
valor NUMERIC(15,2)
source TEXT
responsavel TEXT
responsavel_user_id UUID
funnel_id UUID REFERENCES sales_funnels
funnel_stage_id UUID REFERENCES funnel_stages
descricao_negocio TEXT
additional_data JSONB
avatar_url TEXT
is_online BOOLEAN
last_seen TIMESTAMP
last_message_at TIMESTAMP
duplicate_attempts_count INTEGER
duplicate_attempts_history JSONB
position INTEGER
created_at TIMESTAMP
updated_at TIMESTAMP
```

#### `mensagens_chat`
```sql
id UUID PRIMARY KEY
id_lead UUID REFERENCES leads
corpo_mensagem TEXT NOT NULL
direcao TEXT -- 'ENTRADA' ou 'SAIDA'
data_hora TIMESTAMP
status_entrega TEXT
evolution_message_id TEXT
media_type TEXT
media_url TEXT
media_metadata JSONB
quoted_message_id UUID REFERENCES mensagens_chat
created_at TIMESTAMP
```

#### `sales_funnels`
```sql
id UUID PRIMARY KEY
organization_id UUID REFERENCES organizations
name TEXT NOT NULL
description TEXT
icon TEXT
icon_color TEXT
is_default BOOLEAN
is_active BOOLEAN
created_at TIMESTAMP
updated_at TIMESTAMP
```

#### `funnel_stages`
```sql
id UUID PRIMARY KEY
funnel_id UUID REFERENCES sales_funnels
name TEXT NOT NULL
description TEXT
color TEXT
icon TEXT
position INTEGER
stage_type TEXT -- 'custom', 'won', 'lost'
is_final BOOLEAN
default_value NUMERIC
max_days_in_stage INTEGER
required_fields JSONB
stage_config JSONB
created_at TIMESTAMP
updated_at TIMESTAMP
```

#### `teams`
```sql
id UUID PRIMARY KEY
organization_id UUID REFERENCES organizations
name TEXT NOT NULL
description TEXT
color TEXT
avatar_url TEXT
leader_id UUID
created_at TIMESTAMP
updated_at TIMESTAMP
```

#### `team_members`
```sql
id UUID PRIMARY KEY
team_id UUID REFERENCES teams
user_id UUID
role TEXT
joined_at TIMESTAMP
```

#### `kanban_boards`
```sql
id UUID PRIMARY KEY
organization_id UUID REFERENCES organizations
name TEXT
created_at TIMESTAMP
updated_at TIMESTAMP
```

#### `kanban_columns`
```sql
id UUID PRIMARY KEY
board_id UUID REFERENCES kanban_boards
title TEXT NOT NULL
position INTEGER
created_at TIMESTAMP
```

#### `kanban_cards`
```sql
id UUID PRIMARY KEY
column_id UUID REFERENCES kanban_columns
content TEXT NOT NULL
description TEXT
created_by UUID
lead_id UUID REFERENCES leads
due_date TIMESTAMP
estimated_time INTEGER
timer_started_at TIMESTAMP
calendar_event_id TEXT
calendar_event_link TEXT
position INTEGER
created_at TIMESTAMP
updated_at TIMESTAMP
```

#### `whatsapp_instances`
```sql
id UUID PRIMARY KEY
organization_id UUID REFERENCES organizations
instance_name TEXT NOT NULL
status TEXT
phone_number TEXT
qr_code TEXT
webhook_url TEXT
api_key TEXT
connected_at TIMESTAMP
created_at TIMESTAMP
updated_at TIMESTAMP
```

#### `notifications`
```sql
id UUID PRIMARY KEY
user_id UUID NOT NULL
type TEXT NOT NULL
title TEXT NOT NULL
message TEXT NOT NULL
read BOOLEAN DEFAULT false
lead_id UUID REFERENCES leads
card_id UUID REFERENCES kanban_cards
from_user_id UUID
due_date TIMESTAMP
time_estimate INTEGER
created_at TIMESTAMP
updated_at TIMESTAMP
```

### Índices de Performance

```sql
-- Leads
idx_leads_org_funnel_stage (organization_id, funnel_id, funnel_stage_id)
idx_leads_org_responsavel_user_id (organization_id, responsavel_user_id)
idx_leads_org_created_stage (organization_id, created_at, funnel_stage_id)
idx_leads_org_phone (organization_id, telefone_lead)

-- Mensagens
idx_mensagens_lead_data (id_lead, data_hora)
```

---

## Sistema de Permissões

### Roles (Papéis)

| Role | Descrição |
|------|-----------|
| **owner** | Controle total da organização |
| **admin** | Gerenciamento avançado (sem deletar) |
| **member** | Acesso limitado aos próprios leads |

### Matriz de Permissões

| Funcionalidade | Owner | Admin | Member |
|----------------|-------|-------|--------|
| Ver todos os leads | ✅ | ✅ | ❌ |
| Ver próprios leads | ✅ | ✅ | ✅ |
| Atribuir leads | ✅ | ✅ | ❌ |
| Gerenciar funis | ✅ | ✅ | ❌ |
| Gerenciar equipes | ✅ | ✅ | ❌ |
| Gerenciar membros | ✅ | ✅ | ❌ |
| Deletar leads | ✅ | ✅ | ❌ |
| Deletar membros | ✅ | ❌ | ❌ |
| Configurar integrações | ✅ | ✅ | ❌ |
| Gerenciar roleta | ✅ | ✅ | ❌ |
| Ver métricas de todos | ✅ | ✅ | ❌ |
| Ver próprias métricas | ✅ | ✅ | ✅ |

### RLS (Row Level Security)

Todas as tabelas possuem políticas RLS:

```sql
-- Exemplo: Leads
-- Members veem apenas seus leads ou não atribuídos
CREATE POLICY "Members see own leads"
ON leads FOR SELECT
USING (
  organization_id = get_user_organization_id(auth.uid())
  AND (
    -- Admin/Owner veem todos
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
    OR
    -- Member vê apenas seus leads
    responsavel_user_id = auth.uid()
    OR
    responsavel_user_id IS NULL
  )
);
```

---

## Edge Functions

### Lista Completa

| Função | JWT | Descrição |
|--------|-----|-----------|
| `add-organization-member` | ✅ | Adiciona membro à organização |
| `admin-delete-user` | ❌ | Deleta usuário (super admin) |
| `admin-generate-temp-password` | ❌ | Gera senha temporária |
| `admin-reset-password` | ❌ | Reset de senha |
| `calculate-daily-revenue` | ✅ | Calcula receita diária |
| `calculate-mrr` | ✅ | Calcula MRR |
| `check-subscription` | ✅ | Verifica assinatura Stripe |
| `check-whatsapp-status` | ✅ | Status da instância WhatsApp |
| `create-calendar-event` | ✅ | Cria evento no Google Calendar |
| `create-checkout` | ✅ | Cria checkout Stripe |
| `create-whatsapp-instance` | ✅ | Cria instância WhatsApp |
| `customer-portal` | ✅ | Portal Stripe |
| `delete-calendar-event` | ✅ | Remove evento do Calendar |
| `delete-whatsapp-instance` | ✅ | Remove instância WhatsApp |
| `disconnect-whatsapp-instance` | ✅ | Desconecta WhatsApp |
| `distribute-lead` | ❌ | Distribui lead (roleta) |
| `facebook-leads-webhook` | ❌ | Webhook Facebook Leads |
| `facebook-oauth-callback` | ❌ | Callback OAuth Facebook |
| `facebook-oauth-initiate` | ✅ | Inicia OAuth Facebook |
| `fetch-ads-insights` | ✅ | Busca métricas de ads |
| `form-webhook` | ❌ | Webhook de formulários |
| `get-signed-media-url` | ✅ | URL assinada para mídia |
| `google-calendar-oauth-callback` | ❌ | Callback OAuth Google |
| `google-calendar-oauth-initiate` | ✅ | Inicia OAuth Google |
| `list-calendar-events` | ✅ | Lista eventos do Calendar |
| `process-automation-rules` | ✅ | Processa automações |
| `send-meta-conversion-event` | ✅ | Envia evento para Meta CAPI |
| `send-whatsapp-media` | ✅ | Envia mídia WhatsApp |
| `send-whatsapp-message` | ✅ | Envia mensagem WhatsApp |
| `update-calendar-event` | ✅ | Atualiza evento Calendar |
| `update-subscription` | ✅ | Atualiza assinatura |
| `whatsapp-message-webhook` | ❌ | Webhook mensagens WhatsApp |
| `whatsapp-qr-webhook` | ❌ | Webhook QR/conexão |

---

## Configurações e Personalização

### Variáveis de Ambiente (Secrets)

| Secret | Descrição |
|--------|-----------|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_ANON_KEY` | Chave anônima |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de serviço |
| `EVOLUTION_API_URL` | URL da Evolution API |
| `EVOLUTION_API_KEY` | Chave da Evolution API |
| `EVOLUTION_WEBHOOK_SECRET` | Secret dos webhooks |
| `STRIPE_SECRET_KEY` | Chave secreta Stripe |
| `GOOGLE_CLIENT_ID` | Client ID Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Client Secret Google |
| `GOOGLE_CALENDAR_ENCRYPTION_KEY` | Chave de criptografia tokens |
| `FACEBOOK_APP_ID` | App ID do Facebook |
| `FACEBOOK_APP_SECRET` | App Secret do Facebook |
| `RESEND_API_KEY` | API Key do Resend (emails) |
| `LOVABLE_API_KEY` | Chave Lovable AI |

### Temas

O sistema suporta modo claro e escuro:

```css
/* Cores principais */
--primary: 357 75% 52%;        /* #E02A32 */
--background: 0 0% 100%;       /* Branco (light) */
--background: 0 0% 0%;         /* Preto (dark) */
```

### Storage Buckets

| Bucket | Público | Uso |
|--------|---------|-----|
| `avatars` | ✅ | Fotos de perfil |
| `team-avatars` | ✅ | Avatares de equipes |
| `chat-media` | ❌ | Mídia do WhatsApp |
| `activity-attachments` | ❌ | Anexos de atividades |
| `shields` | ✅ | Escudos do ranking |

---

## Segurança

### Medidas Implementadas

1. **RLS em todas as tabelas**: Isolamento de dados por organização
2. **Field-level access control**: Funções mascaradas para dados sensíveis
3. **Tokens criptografados**: OAuth tokens com AES-256
4. **Webhooks autenticados**: Secret para validação
5. **HTTPS obrigatório**: Todas as conexões seguras

### Funções de Segurança

```sql
-- Mascara emails para não-admins
get_organization_members_masked()

-- Mascara tokens de integração
get_facebook_integrations_masked()
get_google_calendar_integrations_masked()
get_meta_pixel_integrations_masked()
get_webhook_configs_masked()

-- Criptografia de tokens OAuth
encrypt_oauth_token(plain_token, key)
decrypt_oauth_token(encrypted_token, key)
```

---

## Escalabilidade

### Capacidade Atual

| Métrica | Limite |
|---------|--------|
| Usuários simultâneos | 80-120 |
| Leads/mês | 50.000-100.000 |
| Conexões Realtime | ~200 |
| Edge Functions concorrentes | ~50 |

### Upgrade Path

| Nível | Infraestrutura | Capacidade |
|-------|----------------|------------|
| Base | Lovable Cloud | 120 usuários |
| Pro | Supabase Pro ($25/mês) | 200 usuários |
| Team | Supabase Team ($599/mês) | 500+ usuários |

### Otimizações Implementadas

1. **Índices de performance** em tabelas críticas
2. **React Query** com cache de 5min staleTime
3. **Code splitting** com React.lazy()
4. **Virtualização** de listas longas
5. **Parallel queries** em páginas data-intensive
6. **Asset preloading** para imagens críticas

---

## Contato e Suporte

**Domínio:** https://kairozspace.com.br

**Suporte técnico:** Através da plataforma Lovable

---

*Documentação gerada em Dezembro de 2025*
*Versão do sistema: 1.0*
