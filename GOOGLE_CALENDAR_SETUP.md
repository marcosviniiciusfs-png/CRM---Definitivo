# 📅 Configuração do Google Calendar

Este guia explica como configurar a integração do Google Calendar no CRM.

## 🔑 Pré-requisitos

Para usar a integração do Google Calendar, você precisa:

1. Uma conta Google (Gmail)
2. Acesso ao Google Cloud Console
3. As credenciais GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET já foram configuradas

## 🚀 Configuração no Google Cloud Console

### Passo 1: Criar Projeto no Google Cloud

1. Acesse [Google Cloud Console](https://console.cloud.google.com/)
2. Clique em "Selecionar projeto" no topo
3. Clique em "NOVO PROJETO"
4. Dê um nome ao projeto (ex: "CRM Kairoz Calendar")
5. Clique em "Criar"

### Passo 2: Habilitar Google Calendar API

1. No menu lateral, vá em "APIs e serviços" > "Biblioteca"
2. Pesquise por "Google Calendar API"
3. Clique na API e depois em "ATIVAR"

### Passo 3: Configurar Tela de Consentimento OAuth

1. No menu lateral, vá em "APIs e serviços" > "Tela de consentimento OAuth"
2. Escolha "Externo" e clique em "Criar"
3. Preencha as informações obrigatórias:
   - **Nome do app**: Nome do seu CRM
   - **E-mail de suporte do usuário**: Seu e-mail
   - **Domínio da página inicial do aplicativo**: Seu domínio (ex: https://kairozspace.com.br)
   - **E-mail do desenvolvedor**: Seu e-mail
4. Clique em "Salvar e continuar"
5. Em "Escopos", clique em "Adicionar ou remover escopos"
6. Adicione o escopo: `https://www.googleapis.com/auth/calendar`
7. Clique em "Atualizar" e depois em "Salvar e continuar"
8. Em "Usuários de teste", adicione os e-mails dos usuários que poderão testar
9. Clique em "Salvar e continuar"

### Passo 4: Criar Credenciais OAuth 2.0

1. No menu lateral, vá em "APIs e serviços" > "Credenciais"
2. Clique em "CRIAR CREDENCIAIS" > "ID do cliente OAuth"
3. Escolha "Aplicativo da Web"
4. Configure:
   - **Nome**: CRM Calendar Integration
   - **Origens JavaScript autorizadas**: 
     - `https://www.kairozcrm.com.br`
     - `https://sale-shine-flow.lovable.app` (para testes)
   - **URIs de redirecionamento autorizados**:
     - `https://api.kairozcrm.com.br/functions/v1/google-calendar-oauth-callback`
5. Clique em "Criar"
6. Copie o **ID do cliente** e o **Segredo do cliente**

### Passo 5: Configurar Secrets (Já feito ✅)

As credenciais já foram configuradas como secrets:
- `GOOGLE_CLIENT_ID`: ID do cliente OAuth
- `GOOGLE_CLIENT_SECRET`: Segredo do cliente OAuth

## 📖 Como Usar

### Conectar Google Calendar

1. Vá em **Configurações** > **Integrações**
2. Clique em **Mais Integrações**
3. Clique no card **Google Calendar**
4. Clique em **Conectar Google Calendar**
5. Você será redirecionado para autorizar o acesso ao seu Google Calendar
6. Após autorizar, você será redirecionado de volta ao CRM

### Agendar Evento com Lead

1. Abra a página de **Leads**
2. Clique em um lead para ver os detalhes
3. Clique no botão **Agendar** no topo do modal
4. Preencha as informações do evento:
   - Título
   - Descrição (opcional)
   - Data e horário
   - Duração
5. Clique em **Criar Evento**
6. O evento será criado no seu Google Calendar
7. Se o lead tiver e-mail, um convite será enviado automaticamente

## 🎯 Recursos da Integração

- ✅ Criar eventos no Google Calendar
- ✅ Agendar reuniões com leads
- ✅ Enviar convites por e-mail automaticamente
- ✅ Vincular eventos aos leads no CRM
- ✅ Renovação automática de tokens

## 🔧 Solução de Problemas

### Erro: "Google Calendar não conectado"

**Solução**: Vá em Configurações > Integrações > Mais Integrações > Google Calendar e clique em "Conectar Google Calendar"

### Erro: "Não foi possível criar evento"

**Possíveis causas**:
1. Token expirado - O sistema tentará renovar automaticamente
2. Calendário não encontrado - Verifique se o calendário "primary" existe
3. Sem permissões - Verifique se os escopos foram configurados corretamente

### Erro: "Credenciais do Google não configuradas"

**Solução**: Verifique se os secrets GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET estão configurados no Supabase.

## 📚 Outras Integrações Disponíveis

O modal "Mais Integrações" também exibe outras integrações que estarão disponíveis em breve:

- 📧 **Gmail**: Envie e-mails diretamente do CRM
- 🎥 **Google Meet**: Gere links de reunião automaticamente
- 📊 **Google Sheets**: Exporte dados e crie relatórios
- 💬 **Slack**: Notificações em tempo real
- 💳 **Mercado Pago**: Links de pagamento
- 📷 **Instagram Direct**: Receba mensagens do Instagram
- 📝 **Notion**: Sincronize tarefas do Kanban

## 🎉 Pronto!

Sua integração com o Google Calendar está configurada e pronta para uso!
