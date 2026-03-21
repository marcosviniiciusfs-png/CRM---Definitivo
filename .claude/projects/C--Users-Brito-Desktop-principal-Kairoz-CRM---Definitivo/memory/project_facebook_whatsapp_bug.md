---
name: facebook_whatsapp_integration_bugs
description: Bugs críticos encontrados e corrigidos nas integrações Facebook e WhatsApp (março 2026)
type: project
---

Bugs críticos corrigidos nas integrações Facebook/WhatsApp.

**Why:** Leads do Facebook pararam de chegar após mudanças no WhatsApp. WhatsApp não recebia mensagens.

**How to apply:** Se houver regressão nas integrações Facebook/WhatsApp, verificar estes pontos primeiro.

## Bug 1 — WhatsApp: Auth check rejeitava todos os eventos

- **Arquivo**: `supabase/functions/whatsapp-message-webhook/index.ts` linha 141
- **Causa**: `if (!webhookSecret || ...)` — quando `EVOLUTION_WEBHOOK_SECRET` não está definida, `!webhookSecret = true` e TODOS os eventos são rejeitados com 401
- **Fix**: `if (webhookSecret && (!authHeader || authHeader !== webhookSecret))` — só valida quando o secret está configurado

## Bug 2 — WhatsApp: Race condition no create-whatsapp-instance

- **Arquivo**: `supabase/functions/create-whatsapp-instance/index.ts` linha ~307
- **Causa**: Cleanup em background usava `.delete().eq('user_id', ...)` apagando a nova instância recém-criada
- **Fix**: Salvar nomes das instâncias antigas no início do cleanup e usar `.in('instance_name', oldInstanceNames)`

## Bug 3 — Facebook: Token ausente não marcava needs_reconnect

- **Arquivo**: `supabase/functions/facebook-leads-webhook/index.ts` linha ~301
- **Causa**: Quando token estava ausente, apenas logava e continuava — frontend não sabia que integração precisava reconexão
- **Fix**: Atualizar `expires_at = now()` para que `get_facebook_integrations_masked` retorne `needs_reconnect = true`

## Causa raiz do Facebook — Cascade delete de integrações

- **Migration problemática**: `20260318040000_fix_single_org_isolation.sql`
- **O que aconteceu**: Deletou organizações "órfãs". `facebook_integrations` tem `ON DELETE CASCADE` em `organization_id`. Integrações foram apagadas junto com as orgs deletadas.
- **Solução**: Usuários afetados precisam reconectar o Facebook manualmente (dados perdidos por CASCADE)
- **Migration de reparo**: `20260327000000_fix_facebook_integration_recovery.sql` — marca integrações sem token como expiradas e recria `get_facebook_integrations_masked` com lógica mais robusta
