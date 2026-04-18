# Plano de Correção: Integração WhatsApp + Evolution API

> **Para agentes automatizados:** HABILIDADE REQUERIDA: Use `superpowers:subagent-driven-development` (recomendado) ou `superpowers:executing-plans` para implementar este plano tarefa por tarefa. Os passos usam sintaxe de checkbox (`- [ ]`) para rastreamento.

**Objetivo:** Corrigir vulnerabilidades de segurança, eliminar código duplicado, centralizar configuração e melhorar a estabilidade da integração CRM ↔ Evolution API.

**Arquitetura:** Criar um módulo compartilhado `_shared/evolution-config.ts` com funções utilitárias para configuração, normalização de URL e criação de cliente Supabase. Depois refatorar cada Edge Function para usar esse módulo, eliminando o IP hardcoded, a lógica duplicada e a vulnerabilidade de API key. Por fim, otimizar o frontend.

**Stack:** Supabase Edge Functions (Deno), TypeScript, React, TanStack Query, Supabase Realtime

---

## Estrutura de Arquivos

### Arquivos a criar:
- `supabase/functions/_shared/evolution-config.ts` — Configuração centralizada da Evolution API (URL, API key, normalização, helpers)
- `supabase/functions/_shared/cors.ts` — Headers CORS padronizados

### Arquivos a modificar:
- `supabase/functions/whatsapp-message-webhook/index.ts` — Corrigir API key do payload, client duplicado, refatorar handlers
- `supabase/functions/send-whatsapp-message/index.ts` — Usar módulo compartilhado, corrigir status codes, adicionar sufixo @s.whatsapp.net
- `supabase/functions/send-whatsapp-media/index.ts` — Usar módulo compartilhado
- `supabase/functions/check-whatsapp-status/index.ts` — Usar módulo compartilhado, status consistente
- `supabase/functions/create-whatsapp-instance/index.ts` — Usar módulo compartilhado
- `supabase/functions/delete-whatsapp-instance/index.ts` — Usar módulo compartilhado
- `supabase/functions/disconnect-whatsapp-instance/index.ts` — Usar módulo compartilhado
- `supabase/functions/fetch-profile-picture/index.ts` — Usar módulo compartilhado
- `supabase/functions/set-whatsapp-presence/index.ts` — Usar módulo compartilhado
- `supabase/functions/send-whatsapp-reaction/index.ts` — Usar módulo compartilhado
- `supabase/functions/cleanup-whatsapp-orphans/index.ts` — Usar módulo compartilhado
- `supabase/functions/cleanup-invalid-instances/index.ts` — Usar módulo compartilhado
- `supabase/functions/test-webhook-evolution/index.ts` — Usar módulo compartilhado
- `supabase/functions/fix-webhook-config/index.ts` — Usar módulo compartilhado
- `supabase/functions/fix-webhook-config-v2/index.ts` — Usar módulo compartilhado
- `supabase/functions/send-scheduled-reminders/index.ts` — Usar módulo compartilhado
- `supabase/functions/process-automation-rules/index.ts` — Usar módulo compartilhado
- `supabase/functions/fetch-presence-status/index.ts` — Usar módulo compartilhado
- `src/components/WhatsAppConnection.tsx` — Reduzir polling agressivo
- `src/pages/Chat.tsx` — Garantir formato JID correto ao enviar mensagens

---

## Tarefa 1: Criar módulo compartilhado de configuração

**Arquivos:**
- Criar: `supabase/functions/_shared/evolution-config.ts`
- Criar: `supabase/functions/_shared/cors.ts`

- [ ] **Passo 1: Criar arquivo CORS padronizado**

Criar o arquivo `supabase/functions/_shared/cors.ts` com o conteúdo:

```typescript
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-customer-id',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
};

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}
```

- [ ] **Passo 2: Criar módulo de configuração da Evolution API**

Criar o arquivo `supabase/functions/_shared/evolution-config.ts` com o conteúdo:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

// ========================================
// CONFIGURAÇÃO CENTRALIZADA DA EVOLUTION API
// ========================================
// NÃO há mais fallback para IP hardcoded.
// Se EVOLUTION_API_URL não estiver configurada, a função falha com erro claro.

/**
 * Busca a URL da Evolution API a partir da variável de ambiente.
 * Retorna erro se não estiver configurada.
 */
export function getEvolutionApiUrl(): string {
  const url = Deno.env.get('EVOLUTION_API_URL')?.trim() || '';
  if (!url || !/^https?:\/\//.test(url)) {
    throw new Error('EVOLUTION_API_URL não configurada ou inválida. Configure a variável de ambiente no Supabase.');
  }
  return normalizeUrl(url);
}

/**
 * Busca a API key da Evolution API a partir da variável de ambiente.
 * Retorna erro se não estiver configurada.
 */
export function getEvolutionApiKey(): string {
  const key = Deno.env.get('EVOLUTION_API_KEY')?.trim() || '';
  if (!key) {
    throw new Error('EVOLUTION_API_KEY não configurada. Configure a variável de ambiente no Supabase.');
  }
  return key;
}

/**
 * Normaliza uma URL da Evolution API:
 * - Remove /manager no final
 * - Remove barras finais
 * - Remove espaços
 */
export function normalizeUrl(url: string): string {
  let normalized = url.trim();
  normalized = normalized.replace(/\/manager\/?$/i, '');
  normalized = normalized.replace(/\/+$/, '');

  // Remover barras duplas EXCETO no protocolo (https:// ou http://)
  normalized = normalized.replace(/(https?:\/\/)|(\/\/)/g, (match) => {
    return match.includes('://') ? match : '/';
  });

  return normalized;
}

/**
 * Mapeia o estado retornado pela Evolution API para o status usado no banco.
 * Estados possíveis da Evolution: "open", "close", "connecting", "qr"
 * Status no banco: "CONNECTED", "DISCONNECTED", "WAITING_QR", "CREATING"
 */
export function mapEvolutionState(state: string | undefined | null): string {
  if (!state) return 'DISCONNECTED';

  const normalized = state.toLowerCase().trim();

  if (normalized === 'open' || normalized === 'connected') return 'CONNECTED';
  if (normalized === 'connecting' || normalized === 'qr') return 'WAITING_QR';
  if (normalized === 'close' || normalized === 'disconnected') return 'DISCONNECTED';

  return 'DISCONNECTED';
}

/**
 * Verifica se um estado da Evolution API indica que está conectado.
 */
export function isConnectedState(state: string | undefined | null): boolean {
  if (!state) return false;
  const normalized = state.toLowerCase().trim();
  return normalized === 'open' || normalized === 'connected';
}

/**
 * Formata um número de telefone para o formato JID do WhatsApp.
 * Remove todos os caracteres não numéricos e adiciona @s.whatsapp.net
 */
export function formatPhoneToJid(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits || digits.length < 8) {
    throw new Error(`Número de telefone inválido: "${phone}"`);
  }
  return `${digits}@s.whatsapp.net`;
}

/**
 * Extrai apenas os dígitos de um telefone/JID.
 * Remove sufixos como @s.whatsapp.net, @lid, @g.us, @c.us
 */
export function extractPhoneNumber(jidOrPhone: string): string {
  return jidOrPhone
    .replace(/@s\.whatsapp\.net|@lid|@g\.us|@c\.us/g, '')
    .replace(/\D/g, '')
    .trim();
}

/**
 * Cria um cliente Supabase admin (service role).
 * Deve ser criado uma vez por função, não múltiplas vezes.
 */
export function createSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !key) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar configurados.');
  }

  return createClient(url, key);
}
```

- [ ] **Passo 3: Commit**

```bash
git add supabase/functions/_shared/evolution-config.ts supabase/functions/_shared/cors.ts
git commit -m "feat: criar módulo compartilhado de configuração Evolution API e CORS"
```

---

## Tarefa 2: Corrigir vulnerabilidade de API key no webhook (P0)

**Arquivos:**
- Modificar: `supabase/functions/whatsapp-message-webhook/index.ts`

- [ ] **Passo 1: Substituir a linha que extrai API key do payload**

No arquivo `supabase/functions/whatsapp-message-webhook/index.ts`, na linha 162, substituir:

```typescript
// ANTES (VULNERÁVEL):
const apiKey = payload.apikey;
```

por:

```typescript
// DEPOIS (SEGURO): Usar API key da variável de ambiente, nunca do payload
const apiKey = Deno.env.get('EVOLUTION_API_KEY') || '';
```

- [ ] **Passo 2: Adicionar importação do módulo compartilhado no topo do arquivo**

Substituir as linhas 1-2:

```typescript
// ANTES:
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";
```

por:

```typescript
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  getEvolutionApiUrl,
  getEvolutionApiKey,
  mapEvolutionState,
  isConnectedState,
  extractPhoneNumber,
  createSupabaseAdmin,
} from "../_shared/evolution-config.ts";
```

- [ ] **Passo 3: Remover o objeto `corsHeaders` local (linhas 4-8)**

Remover as linhas:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
```

Já importado do módulo compartilhado.

- [ ] **Passo 4: Substituir a lógica de URL hardcoded por getEvolutionApiUrl()**

Substituir o bloco (aproximadamente linhas 161-168):

```typescript
// CORREÇÃO CRÍTICA: Usar URL do secret em vez do payload (que pode estar incorreto)
let serverUrl = Deno.env.get('EVOLUTION_API_URL') || payload.server_url;
const apiKey = payload.apikey;

// Validar e corrigir URL da Evolution API
if (!serverUrl || !/^https?:\/\//.test(serverUrl)) {
  console.log('⚠️ EVOLUTION_API_URL inválida. Usando URL padrão.');
  serverUrl = 'http://161.97.148.99:8080';
}
```

por:

```typescript
let serverUrl: string;
let apiKey: string;
try {
  serverUrl = getEvolutionApiUrl();
  apiKey = getEvolutionApiKey();
} catch (configError: any) {
  console.error('❌ Erro de configuração:', configError.message);
  return new Response(
    JSON.stringify({ success: false, error: configError.message }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
  );
}
```

- [ ] **Passo 5: Substituir criações duplicadas de Supabase client**

O webhook cria `createClient` nas linhas ~190, ~259, ~484, ~1133. Substituir TODAS por uma única criação no início do handler de mensagens.

Logo após a validação de evento (linha ~152, dentro do `try` principal), adicionar:

```typescript
const supabase = createSupabaseAdmin();
```

E remover todas as outras ocorrências de `createClient(Deno.env.get('SUPABASE_URL')!, ...)` no arquivo. O bloco que cria o client para o evento QRCODE (linha ~192) deve usar a mesma variável `supabase` que será criada no início.

- [ ] **Passo 6: Substituir lógica de mapeamento de estado duplicada**

No bloco `connection.update` (aproximadamente linhas 263-280), substituir:

```typescript
if (normalizedState === 'open' || normalizedState === 'connected') {
  newStatus = 'CONNECTED';
}
```

por:

```typescript
newStatus = mapEvolutionState(normalizedState);
```

Da mesma forma, nas verificações de estado da Evolution API dentro do double-check (linhas ~316-318), substituir:

```typescript
if (realState === 'open' || realState === 'CONNECTED') {
```

por:

```typescript
if (isConnectedState(realState)) {
```

E nas verificações de auto-reconexão (linhas ~372-374):

```typescript
if (currentState === 'open' || currentState === 'CONNECTED') {
```

por:

```typescript
if (isConnectedState(currentState)) {
```

E nas URLs hardcoded dentro da auto-reconexão (linhas ~294-298, ~344):

```typescript
// ANTES:
let evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || '';
const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || '';
if (!evolutionApiUrl || !/^https?:\/\//.test(evolutionApiUrl)) {
  evolutionApiUrl = 'http://161.97.148.99:8080';
}
```

por:

```typescript
let evolutionApiUrl: string;
let evolutionApiKey: string;
try {
  evolutionApiUrl = getEvolutionApiUrl();
  evolutionApiKey = getEvolutionApiKey();
} catch {
  // Se não conseguir obter config, a auto-reconexão falhará silenciosamente
  return;
}
```

- [ ] **Passo 7: Substituir extração de número de telefone por helper**

Substituir o bloco de extração de telefone (aproximadamente linhas 582-602):

```typescript
let senderPhone = '';
const remoteJid = messageKey.remoteJid || '';

if (messageKey.senderPn) {
  senderPhone = messageKey.senderPn;
} else if (remoteJid.includes('@s.whatsapp.net')) {
  senderPhone = remoteJid;
} else if (messageKey.participant) {
  senderPhone = messageKey.participant;
} else if (messageKey.senderLid) {
  senderPhone = messageKey.senderLid;
} else {
  senderPhone = remoteJid;
}
```

por:

```typescript
const remoteJid = messageKey.remoteJid || '';
let senderPhone = messageKey.senderPn || messageKey.participant || messageKey.senderLid || remoteJid;
```

E a limpeza do número (aproximadamente linha 619):

```typescript
const phoneNumber = senderPhone.replace(/@s\.whatsapp\.net|@lid|@g\.us|@c\.us/g, '').trim();
```

por:

```typescript
const phoneNumber = extractPhoneNumber(senderPhone);
```

- [ ] **Passo 8: Commit**

```bash
git add supabase/functions/whatsapp-message-webhook/index.ts
git commit -m "fix: corrigir vulnerabilidade de API key e usar módulo compartilhado no webhook"
```

---

## Tarefa 3: Refatorar send-whatsapp-message com módulo compartilhado

**Arquivos:**
- Modificar: `supabase/functions/send-whatsapp-message/index.ts`

- [ ] **Passo 1: Substituir imports e remover código duplicado**

Substituir as linhas 1-2:

```typescript
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";
```

por:

```typescript
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  getEvolutionApiUrl,
  getEvolutionApiKey,
  normalizeUrl,
  isConnectedState,
  createSupabaseAdmin,
} from "../_shared/evolution-config.ts";
```

Remover o bloco `corsHeaders` local (linhas 4-8).

- [ ] **Passo 2: Substituir validação de credenciais hardcoded**

Substituir o bloco (aproximadamente linhas 64-72):

```typescript
let evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || '';
const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
// ...validação manual com fallback hardcoded...
```

por:

```typescript
let evolutionApiUrl: string;
let evolutionApiKey: string;
try {
  evolutionApiUrl = getEvolutionApiUrl();
  evolutionApiKey = getEvolutionApiKey();
} catch (configError: any) {
  return new Response(
    JSON.stringify({ success: false, error: configError.message }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
  );
}
```

- [ ] **Passo 3: Substituir normalização de URL manual**

Substituir o bloco (aproximadamente linhas 149-166):

```typescript
let cleanBaseUrl = evolutionApiUrl.trim();
cleanBaseUrl = cleanBaseUrl.replace(/\/+$/, '');
cleanBaseUrl = cleanBaseUrl.replace(/\/manager\/?$/i, '');
// ...
```

por:

```typescript
const cleanBaseUrl = normalizeUrl(evolutionApiUrl);
```

- [ ] **Passo 4: Adicionar sufixo @s.whatsapp.net ao número**

Após a linha que limpa o número (aproximadamente linha 45):

```typescript
const cleanNumber = remoteJid.replace(/\D/g, '');
```

Adicionar:

```typescript
// Garantir formato JID completo para a Evolution API
const jid = cleanNumber.includes('@') ? cleanNumber : `${cleanNumber}@s.whatsapp.net`;
```

E no corpo da requisição (linha ~228), trocar:

```typescript
number: cleanNumber,
```

por:

```typescript
number: jid,
```

- [ ] **Passo 5: Corrigir status codes HTTP**

Substituir os retornos de erro que usam `status: 200` por códigos adequados. Especificamente:

- Erro de parâmetros obrigatórios: `status: 400`
- Credenciais não configuradas: `status: 500`
- Instância não encontrada: `status: 404`
- Instância desconectada: `status: 503`
- Timeout: `status: 504`
- Erro genérico Evolution API: `status: 502`

No catch final, manter `status: 500`.

- [ ] **Passo 6: Substituir criação do Supabase client**

Substituir (linha ~90):

```typescript
const supabase = createClient(supabaseUrl, supabaseKey);
```

por:

```typescript
const supabase = createSupabaseAdmin();
```

- [ ] **Passo 7: Commit**

```bash
git add supabase/functions/send-whatsapp-message/index.ts
git commit -m "refactor: usar módulo compartilhado e corrigir status codes no send-whatsapp-message"
```

---

## Tarefa 4: Refatorar check-whatsapp-status

**Arquivos:**
- Modificar: `supabase/functions/check-whatsapp-status/index.ts`

- [ ] **Passo 1: Substituir imports e remover código duplicado**

Substituir as linhas 1-2:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';
```

por:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';
import { corsHeaders } from '../_shared/cors.ts';
import {
  getEvolutionApiUrl,
  getEvolutionApiKey,
  mapEvolutionState,
  isConnectedState,
  normalizeUrl,
} from '../_shared/evolution-config.ts';
```

Remover o bloco `corsHeaders` local (linhas 4-6).

- [ ] **Passo 2: Substituir validação de credenciais**

Substituir o bloco (aproximadamente linhas 48-70):

```typescript
let evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || '';
const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY') || '';
// ...validação com fallback hardcoded...
```

por:

```typescript
let evolutionApiUrl: string;
let evolutionApiKey: string;
try {
  evolutionApiUrl = getEvolutionApiUrl();
  evolutionApiKey = getEvolutionApiKey();
} catch (configError: any) {
  return new Response(
    JSON.stringify({ error: configError.message }),
    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

const cleanApiUrl = normalizeUrl(evolutionApiUrl);
```

- [ ] **Passo 3: Substituir mapeamento de estado manual**

Substituir o bloco inteiro (aproximadamente linhas 198-281) que mapeia estados manualmente por:

```typescript
let newStatus = mapEvolutionState(state);

// PROTEÇÃO: Se a instância está CONNECTED no banco, verificar antes de marcar DISCONNECTED
if (newStatus === 'DISCONNECTED' && instanceData.status === 'CONNECTED') {
  console.log(`🔄 Instância CONNECTED com estado "${state}" — tentando restart antes de marcar DISCONNECTED...`);

  try {
    const restartResponse = await fetch(`${cleanApiUrl}/instance/restart/${instance_name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': evolutionApiKey },
    });

    if (restartResponse.ok) {
      await new Promise(resolve => setTimeout(resolve, 5000));

      const recheckResponse = await fetch(`${cleanApiUrl}/instance/connectionState/${instance_name}`, {
        method: 'GET',
        headers: { 'apikey': evolutionApiKey, 'Content-Type': 'application/json' },
      });

      if (recheckResponse.ok) {
        const recheckData = await recheckResponse.json();
        const recheckState = recheckData.instance?.state || recheckData.state || '';

        if (isConnectedState(recheckState)) {
          console.log(`✅ Restart bem-sucedido! Mantendo CONNECTED`);
          return new Response(
            JSON.stringify({ status: 'CONNECTED', message: 'Reconexão automática bem-sucedida' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }
  } catch (restartError) {
    console.warn(`⚠️ Erro no restart: ${restartError}`);
  }
}
```

- [ ] **Passo 4: Remover logs de credenciais sensíveis**

Remover as linhas (aproximadamente 52-53):

```typescript
console.log('EVOLUTION_API_URL presente:', !!evolutionApiUrl, 'valor:', evolutionApiUrl ? evolutionApiUrl.substring(0, 30) + '...' : 'VAZIO');
console.log('EVOLUTION_API_KEY presente:', !!evolutionApiKey, 'tamanho:', evolutionApiKey ? evolutionApiKey.length : 0);
```

Não é seguro logar valores de credenciais, mesmo parciais.

- [ ] **Passo 5: Commit**

```bash
git add supabase/functions/check-whatsapp-status/index.ts
git commit -m "refactor: usar módulo compartilhado no check-whatsapp-status"
```

---

## Tarefa 5: Refatorar send-whatsapp-media

**Arquivos:**
- Modificar: `supabase/functions/send-whatsapp-media/index.ts`

- [ ] **Passo 1: Substituir imports e remover código duplicado**

Substituir as linhas 1-2:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";
```

por:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  getEvolutionApiUrl,
  getEvolutionApiKey,
  normalizeUrl,
  formatPhoneToJid,
  createSupabaseAdmin,
} from "../_shared/evolution-config.ts";
```

Remover o bloco `corsHeaders` local (linhas 4-6).

- [ ] **Passo 2: Substituir configuração manual por helpers**

Substituir (aproximadamente linhas 50-71):

```typescript
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

let evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || 'http://161.97.148.99:8080';
const apiKey = Deno.env.get('EVOLUTION_API_KEY');
// ...
```

por:

```typescript
const supabase = createSupabaseAdmin();

let evolutionApiUrl: string;
let apiKey: string;
try {
  evolutionApiUrl = getEvolutionApiUrl();
  apiKey = getEvolutionApiKey();
} catch (configError: any) {
  return new Response(
    JSON.stringify({ success: false, error: configError.message }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
  );
}

const cleanApiUrl = normalizeUrl(evolutionApiUrl);
```

- [ ] **Passo 3: Garantir formato JID nos envios**

No bloco de áudio PTT (aproximadamente linha 90), substituir:

```typescript
number: remoteJid,
```

por:

```typescript
number: remoteJid.includes('@') ? remoteJid : formatPhoneToJid(remoteJid),
```

E no bloco de mídia genérica (aproximadamente linha 188), substituir:

```typescript
number: remoteJid,
```

por:

```typescript
number: remoteJid.includes('@') ? remoteJid : formatPhoneToJid(remoteJid),
```

- [ ] **Passo 4: Commit**

```bash
git add supabase/functions/send-whatsapp-media/index.ts
git commit -m "refactor: usar módulo compartilhado e JID correto no send-whatsapp-media"
```

---

## Tarefa 6: Refatorar create-whatsapp-instance

**Arquivos:**
- Modificar: `supabase/functions/create-whatsapp-instance/index.ts`

- [ ] **Passo 1: Substituir imports e remover código duplicado**

Substituir as linhas 1-2:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';
```

por:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';
import { corsHeaders } from '../_shared/cors.ts';
import {
  getEvolutionApiUrl,
  getEvolutionApiKey,
  normalizeUrl,
  createSupabaseAdmin,
} from '../_shared/evolution-config.ts';
```

Remover o bloco `corsHeaders` local (linhas 4-6).

- [ ] **Passo 2: Substituir configuração manual**

Substituir (aproximadamente linhas 152-153):

```typescript
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);
```

por:

```typescript
const supabase = createSupabaseAdmin();
```

- [ ] **Passo 3: Substituir validação de credenciais**

Substituir (aproximadamente linhas 166-172):

```typescript
let evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || '';
let evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

if (!evolutionApiUrl || !/^https?:\/\//.test(evolutionApiUrl)) {
  console.log('⚠️ EVOLUTION_API_URL inválida. Usando URL padrão.');
  evolutionApiUrl = 'http://161.97.148.99:8080';
}
```

por:

```typescript
let evolutionApiUrl: string;
let evolutionApiKey: string;
try {
  evolutionApiUrl = getEvolutionApiUrl();
  evolutionApiKey = getEvolutionApiKey();
} catch (configError: any) {
  throw new Error(configError.message);
}

// Manter fallback para banco de dados (app_config) como backup
```

Manter o bloco de fallback para `app_config` (linhas ~176-203) como está — ele serve como backup legítimo.

- [ ] **Passo 4: Substituir normalização de URL manual**

Substituir (linha ~212):

```typescript
const baseUrl = evolutionApiUrl.replace(/\/manager\/?$/, '').replace(/\/$/, '');
```

por:

```typescript
const baseUrl = normalizeUrl(evolutionApiUrl);
```

- [ ] **Passo 5: Commit**

```bash
git add supabase/functions/create-whatsapp-instance/index.ts
git commit -m "refactor: usar módulo compartilhado no create-whatsapp-instance"
```

---

## Tarefa 7: Refatorar Edge Functions menores (batch)

**Arquivos:**
- Modificar: `supabase/functions/delete-whatsapp-instance/index.ts`
- Modificar: `supabase/functions/disconnect-whatsapp-instance/index.ts`
- Modificar: `supabase/functions/fetch-profile-picture/index.ts`
- Modificar: `supabase/functions/set-whatsapp-presence/index.ts`
- Modificar: `supabase/functions/send-whatsapp-reaction/index.ts`
- Modificar: `supabase/functions/test-webhook-evolution/index.ts`

Para CADA arquivo, aplicar o mesmo padrão:

- [ ] **Passo 1: Aplicar padrão em delete-whatsapp-instance**

1. Substituir imports para adicionar módulo compartilhado
2. Remover `corsHeaders` local
3. Substituir `createClient(supabaseUrl, supabaseKey)` por `createSupabaseAdmin()`
4. Substituir bloco de URL hardcoded por `getEvolutionApiUrl()` + `normalizeUrl()`
5. Substituir `evolutionApiUrl.replace(/\/manager\/?$/, '').replace(/\/$/, '')` por `normalizeUrl(evolutionApiUrl)`

Exemplo do resultado final:

```typescript
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getEvolutionApiUrl, getEvolutionApiKey, normalizeUrl, createSupabaseAdmin } from "../_shared/evolution-config.ts";

// ... resto da função com createSupabaseAdmin(), getEvolutionApiUrl(), normalizeUrl() ...
```

- [ ] **Passo 2: Aplicar o mesmo padrão em disconnect-whatsapp-instance**

Mesmas substituições do Passo 1.

- [ ] **Passo 3: Aplicar o mesmo padrão em fetch-profile-picture**

Mesmas substituições. Adicionalmente, substituir (linha ~43-45):

```typescript
const formattedNumber = phone_number.includes('@')
  ? phone_number
  : `${phone_number.replace(/\D/g, '')}@s.whatsapp.net`;
```

por:

```typescript
import { formatPhoneToJid } from "../_shared/evolution-config.ts";
// ...
const formattedNumber = phone_number.includes('@') ? phone_number : formatPhoneToJid(phone_number);
```

- [ ] **Passo 4: Aplicar o mesmo padrão em set-whatsapp-presence**

Mesmas substituições. Manter o fallback para `app_config` (linhas ~63-83) como está.

- [ ] **Passo 5: Aplicar o mesmo padrão em send-whatsapp-reaction**

Mesmas substituições. Notar que este arquivo já usa `formatPhoneToJid` no formato `${cleanNumber}@s.whatsapp.net` (linha 110) — manter, mas pode importar do módulo:

```typescript
import { formatPhoneToJid } from "../_shared/evolution-config.ts";
// Substituir: const remoteJid = `${cleanNumber}@s.whatsapp.net`;
// Por: const remoteJid = formatPhoneToJid(cleanNumber);
```

- [ ] **Passo 6: Aplicar o mesmo padrão em test-webhook-evolution**

Mesmas substituições.

- [ ] **Passo 7: Commit**

```bash
git add supabase/functions/delete-whatsapp-instance/index.ts \
  supabase/functions/disconnect-whatsapp-instance/index.ts \
  supabase/functions/fetch-profile-picture/index.ts \
  supabase/functions/set-whatsapp-presence/index.ts \
  supabase/functions/send-whatsapp-reaction/index.ts \
  supabase/functions/test-webhook-evolution/index.ts
git commit -m "refactor: usar módulo compartilhado nas Edge Functions menores"
```

---

## Tarefa 8: Refatorar funções de limpeza e auxiliares (batch)

**Arquivos:**
- Modificar: `supabase/functions/cleanup-whatsapp-orphans/index.ts`
- Modificar: `supabase/functions/cleanup-invalid-instances/index.ts`
- Modificar: `supabase/functions/fix-webhook-config/index.ts`
- Modificar: `supabase/functions/fix-webhook-config-v2/index.ts`
- Modificar: `supabase/functions/send-scheduled-reminders/index.ts`
- Modificar: `supabase/functions/process-automation-rules/index.ts`
- Modificar: `supabase/functions/fetch-presence-status/index.ts`

Para CADA arquivo, aplicar o mesmo padrão das tarefas anteriores:

- [ ] **Passo 1: Aplicar padrão em cleanup-whatsapp-orphans**

1. Substituir imports para adicionar módulo compartilhado
2. Remover `corsHeaders` local
3. Substituir URL hardcoded por `getEvolutionApiUrl()` + `normalizeUrl()`
4. Substituir `createClient()` manual por `createSupabaseAdmin()`

- [ ] **Passo 2: Aplicar padrão em cleanup-invalid-instances**

Mesmas substituições.

- [ ] **Passo 3: Aplicar padrão em fix-webhook-config**

Mesmas substituições.

- [ ] **Passo 4: Aplicar padrão em fix-webhook-config-v2**

Mesmas substituições.

- [ ] **Passo 5: Aplicar padrão em send-scheduled-reminders**

Mesmas substituições.

- [ ] **Passo 6: Aplicar padrão em process-automation-rules**

Mesmas substituições.

- [ ] **Passo 7: Aplicar padrão em fetch-presence-status**

Mesmas substituições.

- [ ] **Passo 8: Commit**

```bash
git add supabase/functions/cleanup-whatsapp-orphans/index.ts \
  supabase/functions/cleanup-invalid-instances/index.ts \
  supabase/functions/fix-webhook-config/index.ts \
  supabase/functions/fix-webhook-config-v2/index.ts \
  supabase/functions/send-scheduled-reminders/index.ts \
  supabase/functions/process-automation-rules/index.ts \
  supabase/functions/fetch-presence-status/index.ts
git commit -m "refactor: usar módulo compartilhado nas funções de limpeza e auxiliares"
```

---

## Tarefa 9: Garantir formato JID no envio de mensagens do Chat

**Arquivos:**
- Modificar: `src/pages/Chat.tsx`

- [ ] **Passo 1: Verificar se send-whatsapp-message já lida com o formato**

A função `send-whatsapp-message` (após Tarefa 3) agora adiciona `@s.whatsapp.net` automaticamente se o número não contiver `@`. Portanto, o `Chat.tsx` NÃO precisa ser alterado — o telefone bruto (`5511999999999`) será formatado corretamente no backend.

Verificar se `selectedLead.telefone_lead` contém apenas dígitos (sem `@s.whatsapp.net`). Se sim, a correção da Tarefa 3 é suficiente.

- [ ] **Passo 2: Commit (se necessário)**

Se alguma alteração for necessária no Chat.tsx:

```bash
git add src/pages/Chat.tsx
git commit -m "fix: garantir formato JID correto ao enviar mensagens do chat"
```

---

## Tarefa 10: Reduzir polling agressivo no WhatsAppConnection

**Arquivos:**
- Modificar: `src/components/WhatsAppConnection.tsx`

- [ ] **Passo 1: Aumentar intervalo do polling geral de 30s para 60s**

Substituir (aproximadamente linha 489):

```typescript
}, 30000); // A cada 30 segundos
```

por:

```typescript
}, 60000); // A cada 60 segundos
```

O Realtime já notifica sobre mudanças de status. O polling é apenas um backup.

- [ ] **Passo 2: Aumentar intervalo do polling de QR de 10s para 15s**

Substituir (aproximadamente linha 701):

```typescript
}, 10000); // Verificar a cada 10 segundos para reduzir consumo de Edge Functions
```

por:

```typescript
}, 15000); // A cada 15 segundos — Realtime + polling como backup
```

- [ ] **Passo 3: Commit**

```bash
git add src/components/WhatsAppConnection.tsx
git commit -m "perf: reduzir polling agressivo no WhatsAppConnection"
```

---

## Tarefa 11: Verificação final e teste manual

**Arquivos:**
- Nenhum arquivo a modificar

- [ ] **Passo 1: Verificar que não há mais IPs hardcoded**

```bash
grep -r "161\.97\.148\.99" supabase/functions/
```

Esperado: NENHUM resultado.

- [ ] **Passo 2: Verificar que não há mais `payload.apikey`**

```bash
grep -r "payload\.apikey" supabase/functions/
```

Esperado: NENHUM resultado.

- [ ] **Passo 3: Verificar que todos os arquivos importam do módulo compartilhado**

```bash
grep -rl "getEvolutionApiUrl" supabase/functions/
```

Esperado: Todos os arquivos de WhatsApp devem aparecer.

- [ ] **Passo 4: Testar manualmente o fluxo de conexão**

1. Acessar Configurações > Integrações
2. Clicar em "Conectar" no WhatsApp
3. Verificar se o QR Code aparece corretamente
4. Escanear com o WhatsApp
5. Verificar se o status muda para "Conectado"

- [ ] **Passo 5: Testar envio e recebimento de mensagens**

1. Enviar uma mensagem de texto pelo Chat
2. Receber uma mensagem via WhatsApp
3. Verificar se mídia (imagem, áudio) é processada corretamente
4. Verificar se reações funcionam

- [ ] **Passo 6: Commit final**

```bash
git commit --allow-empty -m "chore: verificar integração WhatsApp após refatoração"
```

---

## Resumo das Mudanças

| Tarefa | Arquivos | Impacto |
|--------|----------|---------|
| 1 | 2 novos (`_shared/`) | Base para todas as outras |
| 2 | 1 (`whatsapp-message-webhook`) | P0: Vulnerabilidade de API key |
| 3 | 1 (`send-whatsapp-message`) | Status codes + JID |
| 4 | 1 (`check-whatsapp-status`) | Consistência de estado |
| 5 | 1 (`send-whatsapp-media`) | JID correto |
| 6 | 1 (`create-whatsapp-instance`) | Config centralizada |
| 7 | 6 Edge Functions menores | Eliminar duplicação |
| 8 | 7 funções auxiliares | Eliminar duplicação |
| 9 | 0-1 (`Chat.tsx`) | Verificação de JID |
| 10 | 1 (`WhatsAppConnection.tsx`) | Redução de polling |
| 11 | 0 (verificação) | Validação final |

**Total: ~21 arquivos, 2 novos, 19 modificados**
