# Exclusão em cascata de colaborador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quando o owner exclui um colaborador na seção Colaboradores, fazer cascata correta: hard-delete do auth, desatribuir leads (preservando texto em fechados), limpar equipes/lideranças/roletas, com preview numérico do impacto antes da confirmação.

**Architecture:** Nova edge function `delete-organization-member` (executa cascata sob JWT do owner com service-role); nova RPC SQL `preview_organization_member_deletion` (lê contadores antes do dialog); patch em `Colaboradores.tsx` (handlers + AlertDialog); patch em duas edge functions de roleta para não redistribuir leads fechados (won/lost).

**Tech Stack:** Supabase (Postgres + Edge Functions Deno), React + TypeScript, shadcn/ui (AlertDialog), TanStack Query.

**Spec:** [docs/superpowers/specs/2026-04-30-collaborator-deletion-cascade-design.md](../specs/2026-04-30-collaborator-deletion-cascade-design.md)

**Note about testing:** Este projeto **não tem infra de testes unitários** (sem vitest/jest, nenhum arquivo `*.test.tsx` em `src/`, sem script `test` em `package.json`). Verificações usam SQL direto (Supabase SQL Editor ou `psql`), `curl` para edge functions, e teste manual no browser para o front. Onde digo "verifique", o engenheiro deve **rodar o comando** e **confirmar o output** antes de marcar o passo concluído.

**Note about deploys:** O usuário autorizou Claude a fazer deploys de Edge Functions (memória `feedback_deploy.md`). Comandos de deploy via Supabase CLI fazem parte dos passos.

---

## File Map

**Novos:**
- `supabase/migrations/20260430120000_preview_member_deletion.sql` — RPC `preview_organization_member_deletion`
- `supabase/functions/delete-organization-member/index.ts` — edge function de exclusão em cascata

**Modificados:**
- `src/pages/Colaboradores.tsx` — `handleDeleteColaborador`, `confirmDeleteColaborador`, AlertDialog, novos states
- `supabase/functions/auto-redistribute-leads/index.ts` — patch query da Phase 2 para excluir won/lost
- `supabase/functions/redistribute-unassigned-leads/index.ts` — mesmo patch

**Não tocar:**
- `supabase/functions/admin-panel-rpc/index.ts` — fluxo do admin master, fora do escopo
- `supabase/functions/redistribute-collaborator-leads/index.ts` — função manual continua existindo, não muda
- `src/contexts/AuthContext.tsx` — login já falha quando `auth.users` é deletado (cred inválida nativa do Supabase)

---

## Task 1: Migration — RPC `preview_organization_member_deletion`

**Files:**
- Create: `supabase/migrations/20260430120000_preview_member_deletion.sql`

- [ ] **Step 1.1: Criar arquivo de migration vazio**

```bash
touch supabase/migrations/20260430120000_preview_member_deletion.sql
```

- [ ] **Step 1.2: Escrever a função SQL**

Conteúdo de `supabase/migrations/20260430120000_preview_member_deletion.sql`:

```sql
-- Preview do impacto da exclusão de um colaborador.
-- Retorna contadores que o front mostra no AlertDialog antes da confirmação.
-- SECURITY DEFINER porque o owner precisa ler counts em tabelas com RLS restrito.
-- A checagem de auth.uid() = owner garante que apenas owners chamam.

CREATE OR REPLACE FUNCTION public.preview_organization_member_deletion(
  p_member_id uuid,
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_target_user_id uuid;
  v_target_role text;
  v_member_name text;
  v_active_leads int;
  v_closed_leads int;
  v_teams_as_leader int;
  v_roulettes_in int;
  v_closed_stage_ids uuid[];
BEGIN
  -- 1. Caller deve ser owner da org
  SELECT role INTO v_caller_role
  FROM public.organization_members
  WHERE user_id = auth.uid() AND organization_id = p_organization_id;

  IF v_caller_role IS NULL OR v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Apenas o owner pode excluir colaboradores' USING ERRCODE = '42501';
  END IF;

  -- 2. Buscar membro alvo
  SELECT om.user_id, om.role,
         COALESCE(p.full_name, om.display_name, om.email, 'Colaborador')
    INTO v_target_user_id, v_target_role, v_member_name
  FROM public.organization_members om
  LEFT JOIN public.profiles p ON p.user_id = om.user_id
  WHERE om.id = p_member_id AND om.organization_id = p_organization_id;

  IF v_target_user_id IS NULL AND v_target_role IS NULL THEN
    -- membro não existe nessa org; mas user_id pode ser null para convites pendentes,
    -- então também checamos por v_target_role
    RAISE EXCEPTION 'Membro não encontrado nesta organização' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Não permitir excluir owner
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Não é permitido excluir o proprietário' USING ERRCODE = '42501';
  END IF;

  -- 4. Calcular contadores (só se há user_id; convite pendente retorna zeros)
  IF v_target_user_id IS NOT NULL THEN
    -- estágios won/lost
    SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_closed_stage_ids
    FROM public.funnel_stages
    WHERE stage_type IN ('won', 'lost');

    -- leads ativos
    SELECT COUNT(*) INTO v_active_leads
    FROM public.leads
    WHERE responsavel_user_id = v_target_user_id
      AND organization_id = p_organization_id
      AND (funnel_stage_id IS NULL OR NOT (funnel_stage_id = ANY(v_closed_stage_ids)));

    -- leads fechados (won/lost)
    SELECT COUNT(*) INTO v_closed_leads
    FROM public.leads
    WHERE responsavel_user_id = v_target_user_id
      AND organization_id = p_organization_id
      AND funnel_stage_id = ANY(v_closed_stage_ids);

    -- equipes onde é líder
    SELECT COUNT(*) INTO v_teams_as_leader
    FROM public.teams
    WHERE leader_id = v_target_user_id AND organization_id = p_organization_id;

    -- roletas em que aparece em eligible_agents (text[])
    SELECT COUNT(*) INTO v_roulettes_in
    FROM public.lead_distribution_configs
    WHERE organization_id = p_organization_id
      AND v_target_user_id::text = ANY(eligible_agents);
  ELSE
    v_active_leads := 0;
    v_closed_leads := 0;
    v_teams_as_leader := 0;
    v_roulettes_in := 0;
  END IF;

  RETURN jsonb_build_object(
    'member_name', v_member_name,
    'active_leads', v_active_leads,
    'closed_leads', v_closed_leads,
    'teams_as_leader', v_teams_as_leader,
    'roulettes_in', v_roulettes_in,
    'has_auth_user', v_target_user_id IS NOT NULL
  );
END;
$$;

-- Permitir que usuários autenticados executem (a checagem de owner está dentro)
GRANT EXECUTE ON FUNCTION public.preview_organization_member_deletion(uuid, uuid) TO authenticated;
```

- [ ] **Step 1.3: Aplicar migration no Supabase remoto**

```bash
npx supabase db push
```

Output esperado: `Applying migration 20260430120000_preview_member_deletion.sql...` e nenhuma mensagem de erro. Se falhar com "remote migration versions not found" ou conflito, rodar `npx supabase migration list` para diagnosticar antes de prosseguir.

- [ ] **Step 1.4: Verificar a RPC com SQL Editor**

No Supabase SQL Editor (logado como owner de uma org com colaboradores), rodar:

```sql
-- substituir pelos IDs reais da org de teste
SELECT public.preview_organization_member_deletion(
  '<member_id_de_teste>'::uuid,
  '<organization_id_de_teste>'::uuid
);
```

Output esperado: jsonb com chaves `member_name`, `active_leads`, `closed_leads`, `teams_as_leader`, `roulettes_in`, `has_auth_user`. Os valores numéricos devem bater com o estado real do banco (validar 1-2 contadores via SELECT direto na tabela).

Caso de erro a testar: passar `member_id` de outra org ou um owner — deve levantar exceção `42501`.

- [ ] **Step 1.5: Commit**

```bash
git add supabase/migrations/20260430120000_preview_member_deletion.sql
git commit -m "feat(rpc): preview_organization_member_deletion para preview de impacto

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Edge Function `delete-organization-member` — esqueleto + auth

**Files:**
- Create: `supabase/functions/delete-organization-member/index.ts`

- [ ] **Step 2.1: Criar pasta + arquivo do edge function**

```bash
mkdir -p supabase/functions/delete-organization-member
touch supabase/functions/delete-organization-member/index.ts
```

- [ ] **Step 2.2: Escrever esqueleto com CORS, parsing e validação de auth**

Conteúdo inicial de `supabase/functions/delete-organization-member/index.ts`:

```ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // 1. Validar JWT do caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authErr } = await adminClient.auth.getUser(jwt);
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: "JWT inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Parse body
    const { member_id, organization_id } = await req.json();
    if (!member_id || !organization_id) {
      return new Response(JSON.stringify({ error: "member_id e organization_id são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Caller é owner da org?
    const { data: callerMember } = await adminClient
      .from("organization_members")
      .select("role")
      .eq("user_id", caller.id)
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (!callerMember || callerMember.role !== "owner") {
      return new Response(JSON.stringify({ error: "Apenas o owner pode excluir colaboradores" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Buscar membro alvo
    const { data: target } = await adminClient
      .from("organization_members")
      .select("id, user_id, role")
      .eq("id", member_id)
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (!target) {
      return new Response(JSON.stringify({ error: "Membro não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (target.role === "owner") {
      return new Response(JSON.stringify({ error: "Não é permitido excluir o proprietário" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (target.user_id === caller.id) {
      return new Response(JSON.stringify({ error: "Não é permitido excluir a si mesmo" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // TODO: Steps 1-6 da cascata serão implementados em tarefas seguintes
    return new Response(JSON.stringify({ error: "Cascata ainda não implementada" }), {
      status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[delete-organization-member] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 2.3: Deploy parcial e teste de auth**

```bash
npx supabase functions deploy delete-organization-member
```

- [ ] **Step 2.4: Testar negação de auth com curl**

Buscar `SUPABASE_URL` (ex.: do `.env` ou painel) e rodar:

```bash
# Sem header de auth — deve retornar 401
curl -i -X POST "<SUPABASE_URL>/functions/v1/delete-organization-member" \
  -H "Content-Type: application/json" \
  -d '{"member_id":"00000000-0000-0000-0000-000000000000","organization_id":"00000000-0000-0000-0000-000000000000"}'
```

Output esperado: `HTTP/2 401` e body `{"error":"Não autenticado"}`.

- [ ] **Step 2.5: Commit (esqueleto)**

```bash
git add supabase/functions/delete-organization-member/index.ts
git commit -m "feat(edge): delete-organization-member (esqueleto: auth + preconditions)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Edge Function — passos 1-3 da cascata (equipes e roletas)

**Files:**
- Modify: `supabase/functions/delete-organization-member/index.ts`

- [ ] **Step 3.1: Substituir o `// TODO: Steps 1-6 da cascata` pelos passos 1-3**

Localizar o bloco `// TODO: Steps 1-6 da cascata serão implementados em tarefas seguintes` e o `return` de `501` que o segue. Substituir por:

```ts
    const targetUserId = target.user_id; // pode ser null se convite pendente
    const summary = {
      active_leads_unassigned: 0,
      closed_leads_preserved: 0,
      teams_as_leader_cleared: 0,
      roulettes_cleaned: 0,
      auth_deleted: false,
    };

    if (targetUserId) {
      // Passo 1: limpar liderança em equipes (set leader_id = NULL)
      const { count: leaderCount, error: leaderErr } = await adminClient
        .from("teams")
        .update({ leader_id: null })
        .eq("leader_id", targetUserId)
        .eq("organization_id", organization_id)
        .select("*", { count: "exact", head: true });
      if (leaderErr) throw new Error(`Step 1 (teams.leader_id): ${leaderErr.message}`);
      summary.teams_as_leader_cleared = leaderCount ?? 0;

      // Passo 2: remover de team_members (apenas equipes desta org)
      const { data: teamRows } = await adminClient
        .from("teams")
        .select("id")
        .eq("organization_id", organization_id);
      const teamIds = (teamRows ?? []).map((t: { id: string }) => t.id);
      if (teamIds.length > 0) {
        const { error: tmErr } = await adminClient
          .from("team_members")
          .delete()
          .eq("user_id", targetUserId)
          .in("team_id", teamIds);
        if (tmErr) throw new Error(`Step 2 (team_members): ${tmErr.message}`);
      }

      // Passo 3: remover das roletas (eligible_agents é text[])
      const { data: configs, error: cfgErr } = await adminClient
        .from("lead_distribution_configs")
        .select("id, eligible_agents")
        .eq("organization_id", organization_id);
      if (cfgErr) throw new Error(`Step 3 (lead_distribution_configs read): ${cfgErr.message}`);

      for (const cfg of configs ?? []) {
        const agents: string[] = Array.isArray(cfg.eligible_agents) ? cfg.eligible_agents : [];
        if (agents.includes(targetUserId)) {
          const novo = agents.filter((id) => id !== targetUserId);
          const { error: updErr } = await adminClient
            .from("lead_distribution_configs")
            .update({ eligible_agents: novo })
            .eq("id", cfg.id);
          if (updErr) throw new Error(`Step 3 (config ${cfg.id} update): ${updErr.message}`);
          summary.roulettes_cleaned++;
        }
      }
    }

    // TODO: Passos 4-6 (leads + delete member + auth)
    return new Response(JSON.stringify({ success: true, partial: true, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
```

- [ ] **Step 3.2: Deploy parcial**

```bash
npx supabase functions deploy delete-organization-member
```

- [ ] **Step 3.3: Verificar com membro de teste**

Pré-condição: ter um colaborador de teste (`Teste Maria`) que é líder de 1 equipe, membro de 1 outra, e está em `eligible_agents` de 1 roleta.

Pegar JWT do owner via `supabase.auth.getSession()` no devtools do app, e chamar:

```bash
curl -X POST "<SUPABASE_URL>/functions/v1/delete-organization-member" \
  -H "Authorization: Bearer <OWNER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"member_id":"<test_member_id>","organization_id":"<test_org_id>"}'
```

Output esperado: `{"success":true,"partial":true,"summary":{"active_leads_unassigned":0,"closed_leads_preserved":0,"teams_as_leader_cleared":1,"roulettes_cleaned":1,"auth_deleted":false}}`.

Verificar no SQL Editor:
```sql
SELECT id, leader_id FROM teams WHERE organization_id = '<test_org_id>';
-- esperar leader_id = NULL na equipe que tinha a Maria como líder

SELECT id, eligible_agents FROM lead_distribution_configs WHERE organization_id = '<test_org_id>';
-- esperar que o user_id da Maria não esteja mais no array

SELECT * FROM team_members WHERE user_id = '<maria_user_id>';
-- esperar 0 linhas
```

**Importante:** Maria ainda existe em `organization_members` e em `auth.users` neste ponto (passos 4-6 ainda não rodaram). Isso é esperado.

- [ ] **Step 3.4: Commit**

```bash
git add supabase/functions/delete-organization-member/index.ts
git commit -m "feat(edge): delete-organization-member passos 1-3 (equipes e roletas)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Edge Function — passos 4-5 (leads ativos e fechados)

**Files:**
- Modify: `supabase/functions/delete-organization-member/index.ts`

- [ ] **Step 4.1: Adicionar passos 4a, 4b, 4c (leads) antes do `// TODO: Passos 4-6`**

Localizar `// TODO: Passos 4-6 (leads + delete member + auth)` e substituir por:

```ts
      // Passo 4a: identificar estágios won/lost
      const { data: closedStages, error: stagesErr } = await adminClient
        .from("funnel_stages")
        .select("id")
        .in("stage_type", ["won", "lost"]);
      if (stagesErr) throw new Error(`Step 4a (funnel_stages): ${stagesErr.message}`);
      const closedStageIds = (closedStages ?? []).map((s: { id: string }) => s.id);

      // Passo 4b: leads ativos — zerar responsavel_user_id E responsavel (texto)
      // Filtro: funnel_stage_id IS NULL ou NOT IN (won/lost)
      let activeQuery = adminClient
        .from("leads")
        .update({ responsavel_user_id: null, responsavel: null })
        .eq("organization_id", organization_id)
        .eq("responsavel_user_id", targetUserId);
      if (closedStageIds.length > 0) {
        // Postgrest .not('column','in',`(uuid1,uuid2)`) — leads em won/lost ficam de fora
        activeQuery = activeQuery.not("funnel_stage_id", "in", `(${closedStageIds.join(",")})`);
      }
      const { count: activeCount, error: activeErr } = await activeQuery
        .select("*", { count: "exact", head: true });
      if (activeErr) throw new Error(`Step 4b (active leads): ${activeErr.message}`);
      summary.active_leads_unassigned = activeCount ?? 0;

      // Passo 4c: leads fechados — zerar SÓ responsavel_user_id; campo "responsavel" (texto) preserva nome
      if (closedStageIds.length > 0) {
        const { count: closedCount, error: closedErr } = await adminClient
          .from("leads")
          .update({ responsavel_user_id: null })
          .eq("organization_id", organization_id)
          .eq("responsavel_user_id", targetUserId)
          .in("funnel_stage_id", closedStageIds)
          .select("*", { count: "exact", head: true });
        if (closedErr) throw new Error(`Step 4c (closed leads): ${closedErr.message}`);
        summary.closed_leads_preserved = closedCount ?? 0;
      }
    }

    // TODO: Passos 5-6 (delete member + auth)
    return new Response(JSON.stringify({ success: true, partial: true, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
```

**Atenção:** este passo move o `}` que fechava o `if (targetUserId)` para depois do bloco 4c. Verifique a indentação após colar. O bloco fechado deve incluir os passos 1-3 do Task 3 + os 4a-4c novos. Os passos 5-6 ficam fora do `if` (são executados mesmo quando user_id é null).

- [ ] **Step 4.2: Deploy**

```bash
npx supabase functions deploy delete-organization-member
```

- [ ] **Step 4.3: Verificar com membro de teste**

Pré-condição: o colaborador de teste tem 5 leads em estágio normal e 2 leads em won. Anote o nome dele (campo `responsavel` texto) — vamos verificar que persiste em fechados.

Repetir o curl do Step 3.3. Resposta esperada: `summary.active_leads_unassigned: 5, summary.closed_leads_preserved: 2`.

Verificar:
```sql
SELECT id, responsavel_user_id, responsavel, funnel_stage_id
FROM leads WHERE organization_id = '<test_org_id>'
ORDER BY funnel_stage_id;
-- Para os 5 ativos: responsavel_user_id = NULL, responsavel = NULL
-- Para os 2 fechados (won): responsavel_user_id = NULL, responsavel = '<nome da Maria>'
```

- [ ] **Step 4.4: Commit**

```bash
git add supabase/functions/delete-organization-member/index.ts
git commit -m "feat(edge): delete-organization-member passos 4a-4c (leads ativos e fechados)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Edge Function — passos 5-6 (delete member + auth)

**Files:**
- Modify: `supabase/functions/delete-organization-member/index.ts`

- [ ] **Step 5.1: Substituir `// TODO: Passos 5-6` pelos passos finais**

Localizar `// TODO: Passos 5-6 (delete member + auth)` (e o return de `partial: true` que o segue). Substituir por:

```ts
    // Passo 5: deletar o vínculo organization_members
    const { error: memDelErr } = await adminClient
      .from("organization_members")
      .delete()
      .eq("id", member_id);
    if (memDelErr) throw new Error(`Step 5 (organization_members delete): ${memDelErr.message}`);

    // Passo 6: hard-delete do usuário em auth.users (só se tiver user_id)
    if (targetUserId) {
      const { error: authDelErr } = await adminClient.auth.admin.deleteUser(targetUserId);
      if (authDelErr) {
        // Não rollback — o vínculo já foi removido. Log e retorna sucesso parcial.
        console.error(`[delete-organization-member] Step 6 falhou:`, authDelErr);
        return new Response(JSON.stringify({
          success: true,
          summary: { ...summary, auth_deleted: false },
          warning: `Vínculo removido, mas auth.users não foi deletado: ${authDelErr.message}. Use o admin panel para finalizar.`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      summary.auth_deleted = true;
    }

    return new Response(JSON.stringify({ success: true, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
```

- [ ] **Step 5.2: Deploy**

```bash
npx supabase functions deploy delete-organization-member
```

- [ ] **Step 5.3: Verificação completa golden path**

Pré-condição: criar **novo** colaborador de teste (`Teste João`), repetir setup de 5 leads ativos + 2 won + líder de 1 equipe + membro de 2 + em 1 roleta.

Curl:
```bash
curl -X POST "<SUPABASE_URL>/functions/v1/delete-organization-member" \
  -H "Authorization: Bearer <OWNER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"member_id":"<joao_member_id>","organization_id":"<test_org_id>"}'
```

Resposta esperada:
```json
{
  "success": true,
  "summary": {
    "active_leads_unassigned": 5,
    "closed_leads_preserved": 2,
    "teams_as_leader_cleared": 1,
    "roulettes_cleaned": 1,
    "auth_deleted": true
  }
}
```

Verificar no SQL Editor:
```sql
SELECT * FROM organization_members WHERE id = '<joao_member_id>';
-- 0 linhas

SELECT * FROM auth.users WHERE id = '<joao_user_id>';
-- 0 linhas
```

E tentar logar com o e-mail/senha do João no app — deve falhar com "credenciais inválidas".

- [ ] **Step 5.4: Commit**

```bash
git add supabase/functions/delete-organization-member/index.ts
git commit -m "feat(edge): delete-organization-member passos 5-6 (delete member + auth)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Patch `auto-redistribute-leads` Phase 2 (excluir leads won/lost)

**Files:**
- Modify: `supabase/functions/auto-redistribute-leads/index.ts:140-167`

- [ ] **Step 6.1: Localizar e modificar a query da Phase 2**

Em `supabase/functions/auto-redistribute-leads/index.ts`, linha ~159, **substituir**:

```ts
        // Buscar leads sem dono nesta org (limitado para evitar timeout)
        const { data: unassignedLeads } = await supabase
          .from('leads')
          .select('id')
          .eq('organization_id', orgId)
          .is('responsavel_user_id', null)
          .limit(UNASSIGNED_LIMIT);
```

por:

```ts
        // Buscar IDs de stages won/lost (não devem ser redistribuídos)
        const { data: closedStages } = await supabase
          .from('funnel_stages')
          .select('id')
          .in('stage_type', ['won', 'lost']);
        const closedStageIds = (closedStages || []).map((s: { id: string }) => s.id);

        // Buscar leads sem dono que NÃO estejam em won/lost (limitado para evitar timeout)
        let query = supabase
          .from('leads')
          .select('id')
          .eq('organization_id', orgId)
          .is('responsavel_user_id', null)
          .limit(UNASSIGNED_LIMIT);
        if (closedStageIds.length > 0) {
          query = query.not('funnel_stage_id', 'in', `(${closedStageIds.join(',')})`);
        }
        const { data: unassignedLeads } = await query;
```

- [ ] **Step 6.2: Deploy**

```bash
npx supabase functions deploy auto-redistribute-leads
```

- [ ] **Step 6.3: Verificar via logs**

A função roda em cron (provavelmente a cada minuto via `pg_cron` ou agendador externo). Aguardar 1-2 minutos e checar logs:

```bash
npx supabase functions logs auto-redistribute-leads --tail
```

Confirmar que não há erros novos. O log deve continuar mostrando `[PHASE 2] Org <orgId>: N lead(s) sem dono` mas N agora **exclui** leads em won/lost.

Setup específico para validar: garantir que o estado do banco do Task 5 ainda tem 2 leads won com `responsavel_user_id IS NULL`. Após 2 ciclos do cron, esses 2 leads devem **continuar** sem dono. Verificar:

```sql
SELECT id, responsavel_user_id, funnel_stage_id
FROM leads
WHERE responsavel = '<nome do João>'
  AND organization_id = '<test_org_id>';
-- esperar responsavel_user_id IS NULL nos 2 leads won (não foram redistribuídos)
```

- [ ] **Step 6.4: Commit**

```bash
git add supabase/functions/auto-redistribute-leads/index.ts
git commit -m "fix(auto-redistribute): nao redistribuir leads em estagio won/lost

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Patch `redistribute-unassigned-leads`

**Files:**
- Modify: `supabase/functions/redistribute-unassigned-leads/index.ts`

- [ ] **Step 7.1: Localizar a query equivalente**

Ler `supabase/functions/redistribute-unassigned-leads/index.ts` e identificar as linhas que fazem `.is('responsavel_user_id', null)` (mencionado em linhas 38 e 48 — provavelmente uma para count e outra para fetch).

- [ ] **Step 7.2: Adicionar o mesmo filtro de stage**

Para **cada** ocorrência de `.is('responsavel_user_id', null)` que retorna leads (não apenas count), aplicar o mesmo padrão do Task 6:

```ts
// Antes (exemplo da linha 38):
const { data: unassignedLeads } = await supabase
  .from('leads')
  .select('id, ...')
  .eq('organization_id', organization_id)
  .is('responsavel_user_id', null);

// Depois:
const { data: closedStages } = await supabase
  .from('funnel_stages')
  .select('id')
  .in('stage_type', ['won', 'lost']);
const closedStageIds = (closedStages || []).map((s: { id: string }) => s.id);

let query = supabase
  .from('leads')
  .select('id, ...')
  .eq('organization_id', organization_id)
  .is('responsavel_user_id', null);
if (closedStageIds.length > 0) {
  query = query.not('funnel_stage_id', 'in', `(${closedStageIds.join(',')})`);
}
const { data: unassignedLeads } = await query;
```

Aplicar na linha que **retorna leads para distribuir** (não a linha que faz count para preview/relatório). A linha 38 parece ser o fetch principal; a 48 pode ser um count — só patchar a 48 se ela também alimentar a distribuição.

- [ ] **Step 7.3: Deploy**

```bash
npx supabase functions deploy redistribute-unassigned-leads
```

- [ ] **Step 7.4: Verificar via chamada manual**

Se o app tem um botão "Redistribuir leads sem dono", clicar nele com o setup do Task 5 (2 leads won sem dono). Esses 2 leads **não** devem ser redistribuídos. Confirmar via SQL:

```sql
SELECT id, responsavel_user_id, funnel_stage_id
FROM leads
WHERE responsavel = '<nome do João>'
  AND organization_id = '<test_org_id>';
-- continuam responsavel_user_id IS NULL
```

Caso o app não tenha esse botão exposto, chamar a função via curl:
```bash
curl -X POST "<SUPABASE_URL>/functions/v1/redistribute-unassigned-leads" \
  -H "Authorization: Bearer <OWNER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"organization_id":"<test_org_id>"}'
```

- [ ] **Step 7.5: Commit**

```bash
git add supabase/functions/redistribute-unassigned-leads/index.ts
git commit -m "fix(redistribute-unassigned): nao redistribuir leads em estagio won/lost

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Frontend — adicionar state e tipos para preview

**Files:**
- Modify: `src/pages/Colaboradores.tsx`

- [ ] **Step 8.1: Adicionar interface e states**

Em `src/pages/Colaboradores.tsx`, logo após a interface `Colaborador` (linha ~28-39), adicionar:

```ts
interface DeletePreview {
  member_name: string;
  active_leads: number;
  closed_leads: number;
  teams_as_leader: number;
  roulettes_in: number;
  has_auth_user: boolean;
}
```

E dentro do componente `Colaboradores` junto aos outros `useState` (logo após `colaboradorToDelete`, linha ~52), adicionar:

```ts
const [deletePreview, setDeletePreview] = useState<DeletePreview | null>(null);
const [previewLoading, setPreviewLoading] = useState(false);
```

- [ ] **Step 8.2: Commit (state isolado, ainda sem comportamento)**

```bash
git add src/pages/Colaboradores.tsx
git commit -m "refactor(colaboradores): adicionar state para preview de exclusao

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Frontend — reescrever `handleDeleteColaborador` para carregar preview

**Files:**
- Modify: `src/pages/Colaboradores.tsx:400-411`

- [ ] **Step 9.1: Substituir o handler existente**

Em `src/pages/Colaboradores.tsx`, localizar `const handleDeleteColaborador = (colaborador: Colaborador) => {` (linha ~400) e substituir o **corpo inteiro** da função por:

```ts
  const handleDeleteColaborador = async (colaborador: Colaborador) => {
    if (userRole !== 'owner') {
      toast({ title: "Acesso negado", description: "Apenas o proprietário da organização pode excluir colaboradores", variant: "destructive" });
      return;
    }
    if (colaborador.user_id === currentUserId) {
      toast({ title: "Ação não permitida", description: "Você não pode excluir sua própria conta", variant: "destructive" });
      return;
    }
    if (!organizationId) return;

    // Abre o dialog imediatamente em estado de loading
    setColaboradorToDelete(colaborador);
    setDeletePreview(null);
    setPreviewLoading(true);
    setDeleteDialogOpen(true);

    const { data, error } = await supabase.rpc('preview_organization_member_deletion', {
      p_member_id: colaborador.id,
      p_organization_id: organizationId,
    });

    setPreviewLoading(false);
    if (error) {
      toast({
        title: "Erro ao calcular impacto",
        description: error.message || "Não foi possível carregar o preview",
        variant: "destructive",
      });
      setDeleteDialogOpen(false);
      setColaboradorToDelete(null);
      return;
    }
    setDeletePreview(data as DeletePreview);
  };
```

Mudanças vs. versão antiga:
- Função vira `async`
- Após validações locais, abre o dialog em loading
- Chama a RPC nova
- Em erro, fecha o dialog e mostra toast
- Em sucesso, popula `deletePreview`

- [ ] **Step 9.2: Verificação parcial (typecheck e lint)**

```bash
npm run lint
```

Output esperado: 0 erros novos relacionados a este arquivo. O arquivo não tem typecheck via vite, mas TS strict do editor não deve reclamar.

- [ ] **Step 9.3: Commit**

```bash
git add src/pages/Colaboradores.tsx
git commit -m "refactor(colaboradores): handleDelete carrega preview via RPC

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Frontend — reescrever `confirmDeleteColaborador`

**Files:**
- Modify: `src/pages/Colaboradores.tsx:413-428`

- [ ] **Step 10.1: Substituir o handler de confirmação**

Em `src/pages/Colaboradores.tsx`, localizar `const confirmDeleteColaborador = async () => {` (linha ~413) e substituir o **corpo inteiro** por:

```ts
  const confirmDeleteColaborador = async () => {
    if (!colaboradorToDelete || !organizationId) return;
    setIsMutating(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-organization-member', {
        body: {
          member_id: colaboradorToDelete.id,
          organization_id: organizationId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const s = data?.summary;
      const desc = s
        ? `${colaboradorToDelete.full_name || colaboradorToDelete.email} foi excluído. ${s.active_leads_unassigned} lead(s) voltaram para a roleta.`
        : `${colaboradorToDelete.full_name || colaboradorToDelete.email} foi excluído.`;

      toast({ title: "Colaborador removido", description: desc });

      if (data?.warning) {
        toast({ title: "Atenção", description: data.warning, variant: "destructive" });
      }

      invalidateData();
      setDeleteDialogOpen(false);
      setColaboradorToDelete(null);
      setDeletePreview(null);
    } catch (err: any) {
      toast({
        title: "Erro ao excluir",
        description: err?.message || "Não foi possível excluir o colaborador",
        variant: "destructive",
      });
    } finally {
      setIsMutating(false);
    }
  };
```

Mudanças vs. versão antiga:
- Substitui o `supabase.from('organization_members').delete()` direto por chamada da edge function
- Mostra toast com contagem de leads que voltaram para a roleta
- Mostra toast de warning adicional se a edge function retornou um (caso degenerado do passo 6)
- Reseta `deletePreview`

- [ ] **Step 10.2: Lint**

```bash
npm run lint
```

- [ ] **Step 10.3: Commit**

```bash
git add src/pages/Colaboradores.tsx
git commit -m "refactor(colaboradores): confirmDelete chama edge function de cascata

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Frontend — reescrever AlertDialog com preview

**Files:**
- Modify: `src/pages/Colaboradores.tsx:1038-1058`

- [ ] **Step 11.1: Importar `Loader2` se não estiver — já está nos imports da linha 18.**

(Verificar visualmente; se faltar, adicionar `Loader2` na lista de imports do `lucide-react`.)

- [ ] **Step 11.2: Substituir o JSX do dialog de exclusão**

Localizar o bloco `{/* Delete Confirmation */}` (linha ~1038) e substituir o `<Dialog>...</Dialog>` inteiro por:

```tsx
      {/* Delete Confirmation com preview */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open);
        if (!open) {
          setColaboradorToDelete(null);
          setDeletePreview(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Excluir {deletePreview?.member_name || colaboradorToDelete?.full_name || colaboradorToDelete?.email || 'colaborador'} da organização
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2">
                {previewLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Calculando impacto...</span>
                  </div>
                ) : deletePreview ? (
                  <>
                    <p className="text-foreground font-medium">Esta ação fará:</p>
                    <ul className="list-disc pl-5 space-y-1.5 text-sm">
                      <li>
                        <strong>{deletePreview.active_leads}</strong> lead(s) ativo(s) voltarão para a roleta automaticamente
                      </li>
                      <li>
                        <strong>{deletePreview.closed_leads}</strong> lead(s) fechado(s) (vendidos/perdidos) ficarão sem responsável atribuído, mas o nome é preservado nos relatórios
                      </li>
                      <li>
                        Removid{deletePreview.member_name?.toLowerCase().endsWith('a') ? 'a' : 'o'} da liderança de <strong>{deletePreview.teams_as_leader}</strong> equipe(s)
                      </li>
                      <li>
                        Removid{deletePreview.member_name?.toLowerCase().endsWith('a') ? 'a' : 'o'} de <strong>{deletePreview.roulettes_in}</strong> roleta(s)
                      </li>
                      {deletePreview.has_auth_user && (
                        <li>
                          Acesso (e-mail e senha) <strong>excluído permanentemente</strong>
                        </li>
                      )}
                    </ul>
                    <p className="text-destructive font-medium pt-1">Esta ação não pode ser desfeita.</p>
                  </>
                ) : (
                  <p>Tem certeza que deseja remover este colaborador? Esta ação não pode ser desfeita.</p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isMutating}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteColaborador}
              disabled={isMutating || previewLoading}
            >
              {isMutating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Excluir definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

Mudanças vs. versão antiga:
- Título dinâmico com nome do membro
- Body condicional: loading / preview / fallback genérico
- Lista numerada de impactos com counts da RPC
- Botão de confirmação desabilitado durante preview ou mutação
- Reseta state ao fechar

- [ ] **Step 11.3: Lint**

```bash
npm run lint
```

- [ ] **Step 11.4: Iniciar dev server e teste manual**

```bash
npm run dev
```

Abrir o app, ir em **Gestão de Colaboradores**, clicar no ícone de excluir (`UserX`) de um colaborador de teste:

- [ ] Dialog abre imediatamente com texto "Calculando impacto..." e spinner
- [ ] Após ~500ms, dialog mostra os 5 itens de impacto com números reais
- [ ] Botão "Excluir definitivamente" está habilitado e em vermelho
- [ ] Clicar em "Cancelar" fecha o dialog sem efeito (o membro ainda está na lista)
- [ ] Clicar em "Excluir definitivamente" → toast "Colaborador removido. N leads voltaram para a roleta." + membro some da lista

Verificar no SQL Editor o estado pós-exclusão (mesmo padrão do Task 5).

- [ ] **Step 11.5: Commit**

```bash
git add src/pages/Colaboradores.tsx
git commit -m "feat(colaboradores): AlertDialog mostra preview do impacto da exclusao

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Verificação end-to-end (golden path completo)

Testes manuais finais. Não há código a escrever — só execução e verificação contra o spec.

- [ ] **Step 12.1: Setup de dados de teste**

No SQL Editor, criar (ou usar) uma org de teste. Pelo app:
1. Owner cria colaborador "Teste Vivian" pelo formulário "Novo Colaborador"
2. Owner adiciona 5 leads e atribui à Vivian (5 leads em estágios `lead/contato/qualificado` — não won/lost)
3. Owner move 2 leads para o estágio `won` (mantendo Vivian como responsável)
4. Owner cria equipe "Time A", define Vivian como líder
5. Owner cria equipe "Time B", adiciona Vivian como membro (não líder)
6. Owner adiciona Vivian em `eligible_agents` da roleta padrão (via UI da página Roleta)

- [ ] **Step 12.2: Executar exclusão pelo app**

Clicar no ícone `UserX` ao lado da Vivian. Dialog deve mostrar:
- "Excluir Vivian da organização"
- 5 leads ativos
- 2 leads fechados
- Líder de 1 equipe
- Em 1 roleta
- Acesso será excluído

Clicar em "Excluir definitivamente". Toast deve aparecer: "5 leads voltaram para a roleta."

- [ ] **Step 12.3: Verificar estado pós-exclusão**

```sql
-- 1. Vivian sumiu de organization_members
SELECT * FROM organization_members WHERE id = '<vivian_member_id>';
-- 0 rows

-- 2. Vivian sumiu de auth.users
SELECT * FROM auth.users WHERE email = 'vivian@teste.com';
-- 0 rows

-- 3. 5 leads ativos: responsavel_user_id NULL, responsavel NULL
SELECT id, funnel_stage_id, responsavel_user_id, responsavel
FROM leads WHERE organization_id = '<test_org_id>'
  AND funnel_stage_id IN (SELECT id FROM funnel_stages WHERE stage_type NOT IN ('won','lost'));
-- 5 rows com NULL/NULL

-- 4. 2 leads won: responsavel_user_id NULL, responsavel = 'Vivian'
SELECT id, responsavel_user_id, responsavel
FROM leads WHERE organization_id = '<test_org_id>'
  AND funnel_stage_id IN (SELECT id FROM funnel_stages WHERE stage_type = 'won');
-- 2 rows com NULL / 'Vivian'

-- 5. Time A: leader_id NULL
SELECT id, name, leader_id FROM teams WHERE organization_id = '<test_org_id>';
-- Time A: leader_id NULL

-- 6. Vivian saiu de team_members
SELECT * FROM team_members WHERE user_id = '<vivian_user_id>';
-- 0 rows

-- 7. Roleta: eligible_agents sem o user_id da Vivian
SELECT id, eligible_agents FROM lead_distribution_configs WHERE organization_id = '<test_org_id>';
-- array sem o user_id
```

- [ ] **Step 12.4: Verificar redistribuição automática**

Aguardar 1-2 minutos (o cron `auto-redistribute-leads` roda nesse intervalo). Repetir a query 3:

```sql
SELECT id, responsavel_user_id, responsavel, funnel_stage_id
FROM leads WHERE organization_id = '<test_org_id>';
```

Esperado:
- 5 leads ativos: agora com `responsavel_user_id` apontando para outros agentes da roleta (não-NULL)
- 2 leads won: continuam `responsavel_user_id IS NULL` (não foram redistribuídos), `responsavel = 'Vivian'`

- [ ] **Step 12.5: Tentar logar como Vivian**

Sair do app, tentar logar com `vivian@teste.com` + senha original. Esperado: erro "credenciais inválidas" (auth foi deletado).

- [ ] **Step 12.6: Verificar reaproveitamento do e-mail**

No painel de colaboradores, criar um novo colaborador com o **mesmo e-mail** `vivian@teste.com`. Esperado: cadastro funciona normalmente (e-mail livre após hard-delete).

- [ ] **Step 12.7: (Opcional) Teste de caso degenerado — convite pendente**

Criar convite via "Novo Colaborador" para um e-mail que **nunca** vai aceitar. Quando esse `organization_members.user_id IS NULL`, excluí-lo deve funcionar — preview retorna zeros, edge function pula passo 6 (auth) e retorna `auth_deleted: false` no summary.

---

---

## Task 13: Patch `update-organization-member` para banir usuário no toggle "Status Ativo"

**Files:**
- Modify: `supabase/functions/update-organization-member/index.ts:184-185`

**Context:** O toggle "Status Ativo" no modal de edição (linhas 1017-1024 de `Colaboradores.tsx`) hoje só atualiza `organization_members.is_active`. A função não bane o auth user, então o usuário continua logando normalmente. Spec exige que `is_active=false` bloqueie acesso de fato. Solução: usar `auth.admin.updateUserById(user_id, { ban_duration })` para banir/desbanir simultaneamente.

- [ ] **Step 13.1: Adicionar bloco de ban/unban antes do return final**

Em `supabase/functions/update-organization-member/index.ts`, localizar o final do bloco `if (targetMember.user_id) { ... }` (fechamento na linha ~185), e **antes** do `return new Response(...)` final (linha ~187), inserir:

```ts
    // Se o is_active foi alterado, banir/desbanir o usuário no Supabase Auth.
    // Sem isso, marcar "Inativo" só esconde da lista mas o user continua logando.
    if (is_active !== undefined && targetMember.user_id) {
      const banDuration = is_active ? 'none' : '876000h'; // 100 anos ≈ permanente
      const { error: banError } = await adminClient.auth.admin.updateUserById(
        targetMember.user_id,
        { ban_duration: banDuration }
      );
      if (banError) {
        console.error('Error setting ban_duration:', banError);
        // Rollback do is_active para evitar estado inconsistente
        await adminClient
          .from('organization_members')
          .update({ is_active: !is_active })
          .eq('id', memberId);
        return new Response(JSON.stringify({ error: `Erro ao aplicar bloqueio de acesso: ${banError.message}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
```

**Importante:** o bloco fica **fora** do `if (Object.keys(authUpdates).length > 0)` porque o ban roda mesmo quando email/senha não estão sendo alterados.

- [ ] **Step 13.2: Deploy**

```bash
npx supabase functions deploy update-organization-member
```

- [ ] **Step 13.3: Verificar via app**

1. Logar como owner. Editar um colaborador de teste (`Teste Pedro`), desligar o switch "Status Ativo", salvar. Toast deve aparecer: "Colaborador atualizado com sucesso".
2. Sair do app. Tentar logar como Pedro com e-mail/senha original. Esperado: erro de login (mensagem nativa do Supabase para usuário banido — ex.: `User is banned` ou `Invalid login credentials` dependendo da versão).
3. Logar de volta como owner. Editar Pedro, religar o switch. Salvar.
4. Sair. Logar como Pedro. Esperado: login funciona normalmente.

Verificação SQL:
```sql
-- Quando inativo: banned_until > now()
SELECT id, email, banned_until FROM auth.users WHERE id = '<pedro_user_id>';
-- Quando ativo: banned_until IS NULL ou < now()
```

- [ ] **Step 13.4: Commit**

```bash
git add supabase/functions/update-organization-member/index.ts
git commit -m "fix(update-member): banir auth user quando is_active=false

O toggle Status Ativo agora bane o usuario no Supabase Auth via
ban_duration. Inativo bloqueia login imediatamente (no proximo
refresh de token); religar o toggle remove o ban.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Resumo dos commits esperados

1. `feat(rpc): preview_organization_member_deletion para preview de impacto`
2. `feat(edge): delete-organization-member (esqueleto: auth + preconditions)`
3. `feat(edge): delete-organization-member passos 1-3 (equipes e roletas)`
4. `feat(edge): delete-organization-member passos 4a-4c (leads ativos e fechados)`
5. `feat(edge): delete-organization-member passos 5-6 (delete member + auth)`
6. `fix(auto-redistribute): nao redistribuir leads em estagio won/lost`
7. `fix(redistribute-unassigned): nao redistribuir leads em estagio won/lost`
8. `refactor(colaboradores): adicionar state para preview de exclusao`
9. `refactor(colaboradores): handleDelete carrega preview via RPC`
10. `refactor(colaboradores): confirmDelete chama edge function de cascata`
11. `feat(colaboradores): AlertDialog mostra preview do impacto da exclusao`
12. `fix(update-member): banir auth user quando is_active=false`

Total: 12 commits, sem testes unitários (projeto não tem infra). Verificação manual em cada deploy via SQL/curl/browser conforme passos.
