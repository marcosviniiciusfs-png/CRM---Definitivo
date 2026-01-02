# 📋 Índice de Migrações do Banco de Dados

> **Total: 127 migrações** | Ordem de execução: 001 → 127
> 
> ⚠️ **IMPORTANTE**: Os arquivos de migração NÃO podem ser renomeados pois o Supabase usa os timestamps para controlar a ordem de execução. Este documento serve como referência numerada.

---

## 📊 Resumo por Categoria

| Categoria | Migrações | Descrição |
|-----------|-----------|-----------|
| 🏗️ Base | 001-010 | Tabelas fundamentais (leads, mensagens, WhatsApp) |
| 🏢 Organizações | 011-020 | Multi-tenancy, membros, RLS por organização |
| 👤 Perfis & Atividades | 021-030 | Profiles, activities, tags, presença |
| 🔐 Segurança | 031-040 | RLS policies, autenticação, negação de acesso |
| 👑 Admin & Roles | 041-050 | Super admin, user roles, funções admin |
| 📝 Webhook & Logs | 051-060 | Logs de webhook, configurações |
| 📱 Facebook | 061-070 | Integrações Facebook, tokens, webhooks |
| 📅 Google Calendar | 071-080 | Integrações Calendar, tokens seguros |
| 🎯 Funis & Metas | 081-100 | Sales funnels, stages, goals, teams |
| 📦 Kanban & Tarefas | 101-110 | Boards, columns, cards, notificações |
| 💰 Comissões & Produção | 111-120 | Commission configs, production blocks |
| 🔒 Tokens Seguros | 121-127 | Migração de tokens, funções seguras |

---

## 📑 Lista Completa de Migrações

### 🏗️ SEÇÃO 1: BASE (001-010)

| # | Arquivo Original | Data | Descrição |
|---|-----------------|------|-----------|
| **001** | `20251111150936_8f68db8d-471f-415f-b784-c67060605c27.sql` | 11/11/2025 | Criar tabelas `leads` e `mensagens_chat`, índices, RLS básico e função `update_updated_at_column()` |
| **002** | `20251111182436_79cb2734-1990-4023-8e07-b8a5745459cc.sql` | 11/11/2025 | Criar tabela `whatsapp_instances` com RLS e trigger de updated_at |
| **003** | `20251111183209_de869cca-49ec-4cc3-927e-26cf945c5003.sql` | 11/11/2025 | Habilitar realtime para `whatsapp_instances` |
| **004** | `20251112162845_ae7b9a3b-c751-43bb-b1d6-8b1878e619de.sql` | 12/11/2025 | Criar tabela `app_config` com valores padrão da Evolution API |
| **005** | `20251112175953_9e0dd864-d3ee-4504-ac78-1d2ae58e07ca.sql` | 12/11/2025 | Adicionar colunas `last_message_at` e `source` em leads |
| **006** | `20251112181506_9d66aa94-86ad-44bd-9477-9d867ac8e786.sql` | 12/11/2025 | Adicionar coluna `stage` em leads com índice |
| **007** | `20251112231152_11960cf0-934b-4077-9bc1-7b9cfcb8f8d9.sql` | 12/11/2025 | Habilitar realtime para tabela `leads` |
| **008** | `20251112231442_8b2f229a-401d-4276-98dc-e302ff35fdaf.sql` | 12/11/2025 | Recriar FK de mensagens_chat com cascade delete |
| **009** | `20251113025256_62d9b738-aa79-4ee6-8e0d-b94e39df1823.sql` | 13/11/2025 | Adicionar coluna `position` em leads para ordenação |
| **010** | `20251113030108_4d02c46a-8c7f-45ec-bfea-5c88f53ad223.sql` | 13/11/2025 | Adicionar colunas `email`, `empresa`, `valor` em leads |

---

### 🏢 SEÇÃO 2: ORGANIZAÇÕES (011-020)

| # | Arquivo Original | Data | Descrição |
|---|-----------------|------|-----------|
| **011** | `20251114030133_234ee291-a711-41a2-b485-9ceb8daa7aa6.sql` | 14/11/2025 | Criar enum `organization_role`, tabelas `organizations` e `organization_members`, funções `get_user_organization_id()`, `is_same_organization()`, `handle_new_user()`, `set_lead_organization()`, triggers e RLS baseado em organização |
| **012** | `20251114030621_d329b1d0-fd24-4fcd-b9da-011572f487ac.sql` | 14/11/2025 | Adicionar coluna `email` em organization_members, tornar user_id nullable |
| **013** | `20251114033326_55eb9eb8-136f-458b-a9a9-4fcc0049f816.sql` | 14/11/2025 | Corrigir RLS de organization_members, criar `get_user_organization_role()`, criar organizações para usuários existentes |
| **014** | `20251114194540_ab4342a9-c4be-40c4-9416-79761418f20f.sql` | 14/11/2025 | Migrar leads antigos para primeira organização disponível |
| **015** | `20251115022339_d9e2ef79-0811-48da-99ae-bac12971da13.sql` | 15/11/2025 | Corrigir trigger `set_lead_organization()` para não sobrescrever organization_id existente |
| **016** | `20251115154615_bc977d03-c1f8-4986-ae90-674497c44ec4.sql` | 15/11/2025 | Adicionar coluna `avatar_url` em leads para foto do WhatsApp |
| **017** | `20251115195750_39e115b1-4081-4391-b38c-88831d45ecff.sql` | 15/11/2025 | Atualizar RLS para permitir acesso a leads de TODAS as organizações do usuário |
| **018** | `20251115200221_0a5abbf1-dd56-4caa-8da5-42c5eaba4f3c.sql` | 15/11/2025 | Atualizar `handle_new_user()` para verificar convites antes de criar organização |
| **019** | `20251115200913_263d180f-850f-4b95-bad5-0ed87c6e132c.sql` | 15/11/2025 | Adicionar `organization_id` em whatsapp_instances, migrar instâncias existentes, criar trigger `set_instance_organization()` |
| **020** | `20251115224201_348763f0-8917-4fc9-acd0-26269b43b256.sql` | 15/11/2025 | Recriar políticas RLS mais permissivas para whatsapp_instances |

---

### 👤 SEÇÃO 3: PERFIS & ATIVIDADES (021-030)

| # | Arquivo Original | Data | Descrição |
|---|-----------------|------|-----------|
| **021** | `20251115224934_4366a924-6300-42fa-8346-9c6c2fa82bcf.sql` | 15/11/2025 | Atualizar RLS de whatsapp_instances para acesso baseado em organização |
| **022** | `20251116171302_d218d055-5dc2-4bf8-b2cf-1a84629da0df.sql` | 16/11/2025 | Criar tabela `lead_activities` com RLS para histórico de atividades |
| **023** | `20251116172701_75440894-3c55-47ac-8a25-95ecee5719e1.sql` | 16/11/2025 | Criar bucket `activity-attachments` e políticas de storage |
| **024** | `20251116232831_d31b9c27-4f70-4116-9e60-6865d7aa6e0b.sql` | 16/11/2025 | Criar tabela `profiles` com RLS e função `handle_new_user_profile()` |
| **025** | `20251116235051_21611629-0969-4c11-95e4-53c2242b3916.sql` | 16/11/2025 | Adicionar campos de negócio em leads: `responsavel`, `data_inicio`, `data_conclusao`, `descricao_negocio` |
| **026** | `20251117192255_79c16937-06bb-41ec-bce7-f7efbb518448.sql` | 17/11/2025 | Adicionar campos de mídia em mensagens_chat: `media_url`, `media_type`, `media_metadata` |
| **027** | `20251117202649_8c30bab1-43b8-41fe-b083-081ba366d37d.sql` | 17/11/2025 | Criar bucket `chat-media` e políticas de storage |
| **028** | `20251118212126_2af84273-4b5c-4f7b-8419-8bce01fb41e4.sql` | 18/11/2025 | Adicionar campos de presença em leads: `is_online`, `last_seen` |
| **029** | `20251119032705_9ddc542b-11cf-45f4-9f3d-0544a08013e5.sql` | 19/11/2025 | Criar tabelas `lead_tags` e `lead_tag_assignments` com RLS |
| **030** | `20251119182424_1e9406f5-6210-4fc9-9d0d-74265aac2b19.sql` | 19/11/2025 | Habilitar realtime para lead_tags e lead_tag_assignments |

---

### 🔐 SEÇÃO 4: SEGURANÇA (031-040)

| # | Arquivo Original | Data | Descrição |
|---|-----------------|------|-----------|
| **031** | `20251119194834_ee5a5722-5af4-43b8-a262-d874ac22579c.sql` | 19/11/2025 | Correção de segurança RLS: exigir autenticação em todas as tabelas sensíveis |
| **032** | `20251119195136_10c1038e-433e-4a91-b20d-230a7ea6d2f7.sql` | 19/11/2025 | Adicionar políticas RESTRICTIVE de negação explícita para role `anon` |
| **033** | `20251119201841_c966f9ee-5aa8-49fb-a27e-92cf618fd591.sql` | 19/11/2025 | Corrigir recursão infinita em RLS de organization_members |
| **034** | `20251119202628_8b7a73a4-5060-4013-be69-c5ada1021801.sql` | 19/11/2025 | Corrigir recursão em RLS de whatsapp_instances |
| **035** | `20251119203343_e244c493-4e29-4b7b-bc51-8da08338f08e.sql` | 19/11/2025 | Corrigir trigger para não sobrescrever organization_id do webhook |
| **036** | `20251120021853_0857f914-490a-43cc-a744-594fea4095eb.sql` | 20/11/2025 | Criar tabela `webhook_logs` com RLS |
| **037** | `20251120022742_9828d067-4182-45fe-9519-6417f7d72526.sql` | 20/11/2025 | Criar enum `app_role`, tabela `user_roles`, funções `has_role()`, `list_all_users()`, `count_main_users()`, `is_super_admin()` |
| **038** | `20251120024103_fcc3970b-e87d-475c-8ada-8e93aa52691e.sql` | 20/11/2025 | Criar política para users verem próprios roles |
| **039** | `20251120025331_852db5fe-2887-4ea2-a694-1516c93e83b5.sql` | 20/11/2025 | Recriar `list_all_users()` com acesso correto ao schema auth |
| **040** | `20251120025926_361e635d-5ede-4df1-a63b-38bfa2fc44d3.sql` | 20/11/2025 | Criar funções `get_user_details()` e `get_organization_members()` para super admins |

---

### 👑 SEÇÃO 5: ADMIN & FIXES (041-050)

| # | Arquivo Original | Data | Descrição |
|---|-----------------|------|-----------|
| **041** | `20251120030250_c3a9e83f-6757-4f63-bea3-56ef72afc5e9.sql` | 20/11/2025 | Corrigir funções `get_user_details()` e `get_organization_members()` com referências qualificadas |
| **042** | `20251120143541_4ceb550e-1038-4a83-8fdd-0c47fb30ff1b.sql` | 20/11/2025 | Remover constraint única de telefone_lead, adicionar constraint composta (telefone + organization) |
| **043** | `20251120145011_8bcefd1c-0c95-4e5b-82f1-7978efca5978.sql` | 20/11/2025 | Criar índices de performance adicionais |
| **044** | `20251120151341_1db556a2-c111-4fd6-a4d0-9014f5428c34.sql` | 20/11/2025 | Adicionar coluna deadline em goals |
| **045** | `20251120152521_98fac264-3cfe-4986-a722-f7ab92db1364.sql` | 20/11/2025 | Criar tabela items (produtos/serviços) |
| **046** | `20251120201102_011adc66-f506-43d1-8200-7de4eb660ee5.sql` | 20/11/2025 | Criar tabela `goals` com RLS e triggers |
| **047** | `20251120202255_6b05214b-4e57-4d69-a124-b9dbcf075701.sql` | 20/11/2025 | Adicionar bucket avatars e políticas |
| **048** | `20251120202656_bf5354df-96d1-41bb-8bb5-d205c243993a.sql` | 20/11/2025 | Criar tabela notifications |
| **049** | `20251121142206_3f5a2682-b4db-4107-99b3-d53fe830996e.sql` | 21/11/2025 | Atualizar `handle_new_user()` para verificar email em convites |
| **050** | `20251121144436_e3ef21e9-2010-41a6-ba98-ff264cffe332.sql` | 21/11/2025 | Adicionar funções de notificação |

---

### 📝 SEÇÃO 6: WEBHOOK & LOGS (051-060)

| # | Arquivo Original | Data | Descrição |
|---|-----------------|------|-----------|
| **051** | `20251121150011_97a38d76-824c-41de-9a6a-a7770fc19225.sql` | 21/11/2025 | Adicionar triggers de notificação para leads |
| **052** | `20251121165942_84348d38-8ce6-4ce7-86fc-6abe538f75fa.sql` | 21/11/2025 | Criar tabela form_webhook_logs |
| **053** | `20251121194953_db601ec0-e586-4980-9ba6-d3a1498051b2.sql` | 21/11/2025 | Criar tabela `lead_items` para produtos por lead |
| **054** | `20251122144408_f843378e-70ae-4413-bc68-f932ed6817da.sql` | 22/11/2025 | Criar tabela `facebook_integrations` com RLS |
| **055** | `20251122202357_e9aee42d-0ff2-4a9e-a101-70c53f471919.sql` | 22/11/2025 | Adicionar campos de formulário e página em facebook_integrations |
| **056** | `20251122203552_7e83525c-381b-4f28-88cb-10714e039efc.sql` | 22/11/2025 | Adicionar campos de business em facebook_integrations |
| **057** | `20251123003525_4ea96135-b097-4328-97eb-c1d40e206ca4.sql` | 23/11/2025 | Criar tabela `facebook_webhook_logs` |
| **058** | `20251125013422_ef796072-5bf0-43b5-8bcc-fc5c1536cf77.sql` | 25/11/2025 | Adicionar `notification_sound_enabled` em profiles |
| **059** | `20251125213457_a753809d-12f1-431b-a2d8-299a41a73c0e.sql` | 25/11/2025 | Adicionar campo responsavel_user_id em leads |
| **060** | `20251126193024_69ef63fb-9dbe-4258-b650-24debc9aaaab.sql` | 26/11/2025 | Criar função sync_responsavel_user_id |

---

### 📱 SEÇÃO 7: FACEBOOK & INTEGRATIONS (061-070)

| # | Arquivo Original | Data | Descrição |
|---|-----------------|------|-----------|
| **061** | `20251126193413_7a526196-062d-4020-a66e-5de0eb9dd009.sql` | 26/11/2025 | Criar trigger para sincronizar responsável |
| **062** | `20251127020740_c4fade59-553d-4508-be0c-56bece0c9a5b.sql` | 27/11/2025 | Criar tabela `webhook_configs` com token único por organização |
| **063** | `20251127021835_3c448f50-2982-4fc3-a253-ce2913f96af6.sql` | 27/11/2025 | Adicionar tag_id em webhook_configs |
| **064** | `20251127023722_9eb1918f-1d2d-4721-a8a6-483df098a41e.sql` | 27/11/2025 | Remover constraint única de organization_id em webhook_configs |
| **065** | `20251127024537_24dfc65d-f72e-4570-b3c8-cbb3e4627698.sql` | 27/11/2025 | Adicionar name e description em webhook_configs |
| **066** | `20251127185057_6d0be40d-9a28-409c-b569-41f700d3dee8.sql` | 27/11/2025 | Criar tabelas de distribuição de leads: `lead_distribution_configs`, `agent_distribution_settings`, `lead_distribution_history` |
| **067** | `20251128192358_06f1c7dd-e674-4462-afc9-6312938aff85.sql` | 28/11/2025 | Adicionar source_type e source_identifiers em lead_distribution_configs |
| **068** | `20251128194537_6185388d-3bbc-4b9f-a712-10296dd0326a.sql` | 28/11/2025 | Adicionar team_id e eligible_agents em lead_distribution_configs |
| **069** | `20251128200026_322a4447-27f7-4566-819b-370dc2eb1868.sql` | 28/11/2025 | Criar tabela teams e team_members |
| **070** | `20251128200528_14f3a0f4-a5a2-4dc1-bd41-8fa99a66b7d7.sql` | 28/11/2025 | Atualizar FK de team_id em lead_distribution_configs |

---

### 📅 SEÇÃO 8: GOOGLE CALENDAR & FUNIS (071-080)

| # | Arquivo Original | Data | Descrição |
|---|-----------------|------|-----------|
| **071** | `20251128202336_5d8051fe-4e4b-4505-88ff-4ca34b7db0d9.sql` | 28/11/2025 | Adicionar avatar_url em teams |
| **072** | `20251128223601_9c06821c-f4fe-40fe-9fbc-9b9e44f0e34f.sql` | 28/11/2025 | Criar tabela team_goals |
| **073** | `20251128223616_175d788e-81cb-4e31-921d-a624530d1ff4.sql` | 28/11/2025 | Criar bucket team-avatars |
| **074** | `20251129201626_b3671fb3-c2ad-4865-9955-d70cc98f76f0.sql` | 29/11/2025 | Aumentar precisão da coluna valor para numeric(15,2) |
| **075** | `20251130181434_5c52b1a2-108f-48f2-b47c-3c32468ee717.sql` | 30/11/2025 | Criar tabelas Kanban: `kanban_boards`, `kanban_columns`, `kanban_cards` |
| **076** | `20251130181446_82f6345c-ebc2-4495-afe8-22cd8b3b35bf.sql` | 30/11/2025 | Criar tabelas de funil: `sales_funnels`, `funnel_stages`, `funnel_stage_history` |
| **077** | `20251130185349_15fafea5-03d5-44e3-a589-b135924816ed.sql` | 30/11/2025 | Adicionar funnel_id e funnel_stage_id em leads |
| **078** | `20251130191447_7f515c77-efc4-4ac1-8791-00a3ecff2647.sql` | 30/11/2025 | Adicionar campos stage_type, is_final, max_days_in_stage em funnel_stages |
| **079** | `20251130192456_3988fdbd-fc53-4bb3-9b3e-c2c49c06c528.sql` | 30/11/2025 | Criar trigger create_default_funnel_for_organization |
| **080** | `20251202005646_329794f3-74cc-44da-822d-c296ed165f31.sql` | 02/12/2025 | Criar tabela `google_calendar_integrations` com RLS |

---

### 🎯 SEÇÃO 9: METAS & AUTOMAÇÃO (081-090)

| # | Arquivo Original | Data | Descrição |
|---|-----------------|------|-----------|
| **081** | `20251202020532_2ff36bfb-644e-4a0f-9e63-339b5103f96d.sql` | 02/12/2025 | Adicionar funções encriptação: `encrypt_oauth_token()`, `decrypt_oauth_token()` |
| **082** | `20251202021407_026795bc-88d8-44c9-97ed-cd2c080a0581.sql` | 02/12/2025 | Adicionar coluna calendar_event_link em kanban_cards |
| **083** | `20251202233114_6ef39d7f-98ff-412c-8778-be2404a57c79.sql` | 02/12/2025 | Adicionar lead_id em kanban_cards |
| **084** | `20251203003214_fb3d775c-2b8c-42da-97e8-cab41a1d8cd9.sql` | 03/12/2025 | Adicionar timer_started_at em kanban_cards |
| **085** | `20251203003953_b5f3023e-e3bc-4264-84f8-7fdfd8fe80c9.sql` | 03/12/2025 | Criar tabela system_activities para logs de atividades |
| **086** | `20251203024820_0990f6de-31c3-4a88-9c20-dc4031cd51a8.sql` | 03/12/2025 | Criar triggers para log de mudanças de stage e atribuição de leads |
| **087** | `20251203025830_b9598d51-9f04-456c-8a5c-de08282d7847.sql` | 03/12/2025 | Criar trigger para log de mudanças em team_members |
| **088** | `20251203212006_26bb0cc8-a0cf-42bb-9c20-978ac11aea23.sql` | 03/12/2025 | Criar tabela automation_rules e automation_logs |
| **089** | `20251204003153_c2c23fc2-3e9b-4f06-b4ce-a5450a47d8f3.sql` | 04/12/2025 | Remover política RESTRICTIVE de google_calendar_integrations |
| **090** | `20251204005443_c85377d4-8143-44ae-9405-09fb30c174ff.sql` | 04/12/2025 | Adicionar coluna ad_accounts em facebook_integrations |

---

### 💰 SEÇÃO 10: COMISSÕES & PRODUÇÃO (091-100)

| # | Arquivo Original | Data | Descrição |
|---|-----------------|------|-----------|
| **091** | `20251204200109_8741e6a8-f80e-4f1a-b5bf-1c2bbbd5d462.sql` | 04/12/2025 | Criar tabela funnel_source_mappings |
| **092** | `20251204200440_3fc9ff05-1f25-4099-a727-ab7ad7426d7e.sql` | 04/12/2025 | Criar tabela funnel_automation_rules |
| **093** | `20251204202419_0d864e34-86e7-4032-9367-a1c415028aee.sql` | 04/12/2025 | Adicionar campos default_value e required_fields em funnel_stages |
| **094** | `20251204202433_5ea3e89f-076d-4ab3-9657-324141173735.sql` | 04/12/2025 | Adicionar coluna stage_config em funnel_stages |
| **095** | `20251204225453_8501cf86-b362-4878-a49b-3bf8cb6c9641.sql` | 04/12/2025 | Criar tabela commission_configs |
| **096** | `20251204233417_554009b6-8ef0-44d5-bc80-71bf335a63cb.sql` | 04/12/2025 | Criar tabela commissions |
| **097** | `20251204234143_57f8cd47-ba26-4f79-9f99-22baae3aeafd.sql` | 04/12/2025 | Criar trigger generate_commission_on_won |
| **098** | `20251204234857_42986cbf-f1fe-49a8-b732-3f9bc78ea0af.sql` | 04/12/2025 | Criar trigger update_team_goals_on_sale |
| **099** | `20251204235823_143fdd40-84a9-4718-8214-4feda2a901a2.sql` | 04/12/2025 | Criar tabela production_blocks para controle de produção mensal |
| **100** | `20251205001826_1a46f48f-5640-4ecd-8e52-17a220137cf2.sql` | 05/12/2025 | Adicionar campos de comparação mensal em production_blocks |

---

### 🔧 SEÇÃO 11: FIXES & MELHORIAS (101-110)

| # | Arquivo Original | Data | Descrição |
|---|-----------------|------|-----------|
| **101** | `20251205013004_45f5099b-fa62-484f-b96f-8c9884e3eebc.sql` | 05/12/2025 | Criar função `get_google_calendar_tokens_for_user()` |
| **102** | `20251205014641_70a319dc-3967-4c86-8604-d607cfff09aa.sql` | 05/12/2025 | Atualizar RLS de google_calendar_integrations para restringir ao proprietário |
| **103** | `20251205031241_f38d0609-8e07-40c7-bfd6-b5819bd55656.sql` | 05/12/2025 | Criar tabela meta_pixel_integrations e meta_conversion_logs |
| **104** | `20251205032937_7c6149bd-d371-49ee-b43c-729afc8d2498.sql` | 05/12/2025 | Atualizar RLS de meta_pixel_integrations |
| **105** | `20251206074626_71c422b9-0332-4ae1-9f01-b4281f2423b6.sql` | 06/12/2025 | Adicionar button_click_sound_enabled em profiles |
| **106** | `20251207135846_c97ce400-f916-46d7-a409-07c1e091a74c.sql` | 07/12/2025 | Criar funções masked para segurança: `get_google_calendar_integrations_masked()`, `get_facebook_integrations_masked()` |
| **107** | `20251207143807_2f527a0c-0c50-447f-9371-733760584227.sql` | 07/12/2025 | Criar `get_organization_members_masked()` |
| **108** | `20251207203843_c1c7c498-1eb5-45ab-91d0-83298c5da115.sql` | 07/12/2025 | Criar `get_webhook_configs_masked()` |
| **109** | `20251207211229_0b30e994-4745-4eda-a8ce-ca53d03278bb.sql` | 07/12/2025 | Criar `get_meta_pixel_integrations_masked()` |
| **110** | `20251208084235_d96fa9b3-8b2d-4f2f-b0a5-179f23a43301.sql` | 08/12/2025 | Adicionar quoted_message_id em mensagens_chat para respostas |

---

### 📱 SEÇÃO 12: WHATSAPP & CHAT (111-120)

| # | Arquivo Original | Data | Descrição |
|---|-----------------|------|-----------|
| **111** | `20251208093636_68fe990e-e3b3-43b6-bd1a-d1b6c4dabf44.sql` | 08/12/2025 | Criar tabela message_reactions |
| **112** | `20251209181444_0dc99598-0705-4d64-837c-37719713ef70.sql` | 09/12/2025 | Criar tabela pinned_messages |
| **113** | `20251209181719_c7934a62-421d-40a7-a32c-446580954e23.sql` | 09/12/2025 | Criar tabela google_calendar_tokens para tokens seguros |
| **114** | `20251209192609_a715f4d2-eeca-445d-a556-e587d8c4c713.sql` | 09/12/2025 | Criar webhook_queue para processamento assíncrono |
| **115** | `20251209193122_750f58dd-4297-4b45-a073-2e730ee25f13.sql` | 09/12/2025 | Adicionar campos de tracking de duplicatas em leads |
| **116** | `20251209193136_ce9a3861-fe95-4f2b-bd0e-a94fd07ad692.sql` | 09/12/2025 | Criar bucket shields |
| **117** | `20251209193446_fbdea734-5f01-44b6-8492-60c00c8a8599.sql` | 09/12/2025 | Adicionar idade em leads |
| **118** | `20251209193822_594aa3f6-e9ef-4ede-a071-20ddd5a7f8bc.sql` | 09/12/2025 | Atualizar políticas de storage para shields |
| **119** | `20251209193838_5ac33896-7ca6-4f8c-9db5-f1954dfedac2.sql` | 09/12/2025 | Tornar bucket chat-media privado |
| **120** | `20251209213813_073ab882-7baa-4716-b87e-2e7108771b05.sql` | 09/12/2025 | Atualizar RLS de google_calendar_integrations |

---

### 🔒 SEÇÃO 13: TOKENS SEGUROS (121-127)

| # | Arquivo Original | Data | Descrição |
|---|-----------------|------|-----------|
| **121** | `20251209222431_13e56c41-6189-45df-ab80-7565f41341c4.sql` | 09/12/2025 | Migrar tokens do Google Calendar para tabela segura |
| **122** | `20251209224636_5dbad4ab-01b5-4574-a2b5-7be4c0c93c21.sql` | 09/12/2025 | Atualizar funções secure para Google Calendar |
| **123** | `20251209224649_a604fea0-d6d8-4201-93c8-0e3ccccea5ea.sql` | 09/12/2025 | Remover colunas access_token e refresh_token de google_calendar_integrations |
| **124** | `20251211004004_05a052e6-4080-4572-843b-3bdcd496898b.sql` | 11/12/2025 | Migrar tokens para tabela segura `google_calendar_tokens` |
| **125** | `20251211004212_8be6f320-4357-42e9-9113-966e8b22e12b.sql` | 11/12/2025 | Atualizar função `get_google_calendar_tokens_secure()` |
| **126** | `20251211004452_4380849b-70a0-4a74-b4d0-fcc324ba1ce3.sql` | 11/12/2025 | Criar tabela `facebook_integration_tokens` e funções `update_facebook_tokens_secure()`, `get_facebook_tokens_secure()` |
| **127** | `20251211113346_3ac825c1-a44d-4fb9-90b7-201168a79f84.sql` | 11/12/2025 | Recriar políticas RLS de profiles com RESTRICTIVE para negar acesso não autenticado |

---

## 🗄️ Tabelas Criadas (49 tabelas)

| # | Tabela | Migração | Descrição |
|---|--------|----------|-----------|
| 1 | `leads` | 001 | Leads/contatos do sistema |
| 2 | `mensagens_chat` | 001 | Mensagens do chat WhatsApp |
| 3 | `whatsapp_instances` | 002 | Instâncias WhatsApp conectadas |
| 4 | `app_config` | 004 | Configurações globais do app |
| 5 | `organizations` | 011 | Organizações (multi-tenant) |
| 6 | `organization_members` | 011 | Membros das organizações |
| 7 | `lead_activities` | 022 | Histórico de atividades de leads |
| 8 | `profiles` | 024 | Perfis de usuários |
| 9 | `lead_tags` | 029 | Tags para categorizar leads |
| 10 | `lead_tag_assignments` | 029 | Associação leads-tags |
| 11 | `webhook_logs` | 036 | Logs de webhooks WhatsApp |
| 12 | `user_roles` | 037 | Roles de sistema (super_admin) |
| 13 | `goals` | 046 | Metas individuais |
| 14 | `items` | 045 | Produtos e serviços |
| 15 | `notifications` | 048 | Notificações do sistema |
| 16 | `form_webhook_logs` | 052 | Logs de webhooks de formulários |
| 17 | `lead_items` | 053 | Produtos associados a leads |
| 18 | `facebook_integrations` | 054 | Integrações Facebook |
| 19 | `facebook_webhook_logs` | 057 | Logs de webhooks Facebook |
| 20 | `webhook_configs` | 062 | Configurações de webhooks |
| 21 | `lead_distribution_configs` | 066 | Configurações de distribuição |
| 22 | `agent_distribution_settings` | 066 | Configurações de agentes |
| 23 | `lead_distribution_history` | 066 | Histórico de distribuição |
| 24 | `teams` | 069 | Equipes |
| 25 | `team_members` | 069 | Membros das equipes |
| 26 | `team_goals` | 072 | Metas das equipes |
| 27 | `kanban_boards` | 075 | Quadros Kanban |
| 28 | `kanban_columns` | 075 | Colunas Kanban |
| 29 | `kanban_cards` | 075 | Cards/Tarefas Kanban |
| 30 | `sales_funnels` | 076 | Funis de vendas |
| 31 | `funnel_stages` | 076 | Etapas dos funis |
| 32 | `funnel_stage_history` | 076 | Histórico de movimentações |
| 33 | `google_calendar_integrations` | 080 | Integrações Google Calendar |
| 34 | `system_activities` | 085 | Log de atividades do sistema |
| 35 | `automation_rules` | 088 | Regras de automação |
| 36 | `automation_logs` | 088 | Logs de execução de automações |
| 37 | `funnel_source_mappings` | 091 | Mapeamento de fontes para funis |
| 38 | `funnel_automation_rules` | 092 | Automações por etapa do funil |
| 39 | `commission_configs` | 095 | Configurações de comissões |
| 40 | `commissions` | 096 | Comissões geradas |
| 41 | `production_blocks` | 099 | Blocos de produção mensal |
| 42 | `meta_pixel_integrations` | 103 | Integrações Meta Pixel |
| 43 | `meta_conversion_logs` | 103 | Logs de conversões Meta |
| 44 | `message_reactions` | 111 | Reações às mensagens |
| 45 | `pinned_messages` | 112 | Mensagens fixadas |
| 46 | `google_calendar_tokens` | 113 | Tokens seguros do Calendar |
| 47 | `webhook_queue` | 114 | Fila de processamento de webhooks |
| 48 | `facebook_integration_tokens` | 126 | Tokens seguros do Facebook |

---

## ⚙️ Funções Criadas (35+ funções)

### Funções de Utilidade
| Função | Migração | Descrição |
|--------|----------|-----------|
| `update_updated_at_column()` | 001 | Atualiza timestamp updated_at |
| `get_user_organization_id()` | 011 | Retorna organization_id do usuário |
| `is_same_organization()` | 011 | Verifica se usuário pertence à organização |
| `get_user_organization_role()` | 013 | Retorna organização e role do usuário |

### Funções de Autenticação
| Função | Migração | Descrição |
|--------|----------|-----------|
| `handle_new_user()` | 011 | Cria organização ao criar usuário |
| `handle_new_user_profile()` | 024 | Cria perfil ao criar usuário |
| `set_lead_organization()` | 011 | Define organization_id do lead |
| `set_goal_organization()` | 046 | Define organization_id da meta |
| `set_instance_organization()` | 019 | Define organization_id da instância |

### Funções de Segurança
| Função | Migração | Descrição |
|--------|----------|-----------|
| `has_role()` | 037 | Verifica se usuário tem role |
| `is_super_admin()` | 037 | Verifica se é super admin |
| `encrypt_oauth_token()` | 081 | Criptografa tokens OAuth |
| `decrypt_oauth_token()` | 081 | Descriptografa tokens OAuth |

### Funções de Admin
| Função | Migração | Descrição |
|--------|----------|-----------|
| `list_all_users()` | 037 | Lista todos os usuários (super admin) |
| `count_main_users()` | 037 | Conta usuários principais |
| `get_user_details()` | 040 | Detalhes de usuário (super admin) |
| `get_organization_members()` | 040 | Membros da organização (super admin) |

### Funções Masked (Segurança)
| Função | Migração | Descrição |
|--------|----------|-----------|
| `get_google_calendar_integrations_masked()` | 106 | Integrações sem tokens |
| `get_facebook_integrations_masked()` | 106 | Integrações sem tokens |
| `get_organization_members_masked()` | 107 | Membros com email oculto |
| `get_webhook_configs_masked()` | 108 | Configs com token oculto |
| `get_meta_pixel_integrations_masked()` | 109 | Integrações com token oculto |

### Funções de Tokens Seguros
| Função | Migração | Descrição |
|--------|----------|-----------|
| `get_google_calendar_tokens_secure()` | 124 | Busca tokens Calendar |
| `update_google_calendar_tokens_secure()` | 124 | Atualiza tokens Calendar |
| `get_facebook_tokens_secure()` | 126 | Busca tokens Facebook |
| `update_facebook_tokens_secure()` | 126 | Atualiza tokens Facebook |

### Funções de Negócio
| Função | Migração | Descrição |
|--------|----------|-----------|
| `sync_responsavel_user_id()` | 060 | Sincroniza responsável |
| `generate_commission_on_won()` | 097 | Gera comissão ao ganhar |
| `update_team_goals_on_sale()` | 098 | Atualiza metas da equipe |
| `create_default_funnel_for_organization()` | 079 | Cria funil padrão |
| `notify_lead_assignment()` | 051 | Notifica atribuição de lead |
| `log_lead_stage_change()` | 086 | Log de mudança de stage |
| `log_lead_responsible_assignment()` | 086 | Log de atribuição |
| `log_team_member_change()` | 087 | Log de mudança em equipe |

---

## 🗃️ Storage Buckets Criados (5 buckets)

| Bucket | Migração | Público | Descrição |
|--------|----------|---------|-----------|
| `activity-attachments` | 023 | ❌ | Anexos de atividades |
| `chat-media` | 027 | ❌ | Mídias do chat (privado desde 119) |
| `avatars` | 047 | ✅ | Avatares de usuários |
| `team-avatars` | 073 | ✅ | Avatares de equipes |
| `shields` | 116 | ✅ | Escudos/badges |

---

## 📡 Tabelas com Realtime

| Tabela | Migração |
|--------|----------|
| `whatsapp_instances` | 003 |
| `leads` | 007 |
| `mensagens_chat` | 030 |
| `lead_tags` | 030 |
| `lead_tag_assignments` | 030 |

---

## 🔐 Enums Criados

| Enum | Migração | Valores |
|------|----------|---------|
| `organization_role` | 011 | `owner`, `admin`, `member` |
| `app_role` | 037 | `super_admin`, `owner`, `admin`, `member` |

---

## 📋 Como Executar

> ⚠️ **Atenção**: As migrações são executadas automaticamente pelo Supabase na ordem dos timestamps.

Para executar manualmente em um banco novo:

```bash
# 1. Instalar Supabase CLI
npm install -g supabase

# 2. Inicializar projeto
supabase init

# 3. Executar migrações
supabase db push

# Ou executar migração específica:
supabase migration up --target 20251211113346
```

---

**Última atualização**: 02/01/2026
**Total de migrações**: 127
**Versão do schema**: v127
