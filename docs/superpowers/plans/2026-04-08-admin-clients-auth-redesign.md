# Admin Client List, Auth & Navigation Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict client list to owners only, remove signup from login modal and add admin account creation, fix back button navigation.

**Architecture:** Three independent changes touching different parts of the codebase. A new Supabase RPC `safe_list_owner_users` filters owners server-side. The login modal loses its signup mode. A new Edge Function `admin-create-user` handles account creation. URL params preserve tab/filter state for the back button.

**Tech Stack:** React, TypeScript, Supabase (RPC + Edge Functions), React Router, Tailwind CSS

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/functions/admin-create-user/index.ts` | Edge Function: creates user, profile, org |
| Create | Migration SQL (applied via Supabase MCP) | New RPCs: `safe_list_owner_users`, `admin_list_owners_fn` |
| Modify | `src/pages/AdminDashboard.tsx` | Owner-only client list, Criar Conta tab, URL params |
| Modify | `src/pages/AdminUserDetails.tsx` | Back button with state-based navigation |
| Modify | `src/pages/Auth.tsx` | Remove signup handler |
| Modify | `src/components/ui/login-1.tsx` | Remove signup mode, remove onSignup prop |

---

### Task 1: Create `safe_list_owner_users` RPC (Migration)

**Files:**
- Create: Supabase migration (applied via `mcp__plugin_supabase_supabase__apply_migration`)

- [ ] **Step 1: Apply migration with two new RPCs**

The first RPC `safe_list_owner_users` is a direct-call RPC (token-validated) for AdminDashboard. The second `admin_list_owners_fn` is a service-role RPC for the admin-panel-rpc proxy.

```sql
-- Direct-call RPC (token validated) for AdminDashboard
CREATE OR REPLACE FUNCTION public.safe_list_owner_users(p_token TEXT)
RETURNS TABLE(
  id UUID,
  email TEXT,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  email_confirmed_at TIMESTAMPTZ,
  organization_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN
    RAISE EXCEPTION 'Token inválido';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at,
    o.name AS organization_name
  FROM auth.users u
  INNER JOIN public.organization_members om ON om.user_id = u.id AND om.role = 'owner'
  INNER JOIN public.organizations o ON o.id = om.organization_id
  ORDER BY u.created_at DESC;
END;
$$;

-- Service-role RPC for admin-panel-rpc proxy
CREATE OR REPLACE FUNCTION public.admin_list_owners_fn()
RETURNS TABLE(
  id UUID,
  email TEXT,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  email_confirmed_at TIMESTAMPTZ,
  organization_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at,
    o.name AS organization_name
  FROM auth.users u
  INNER JOIN public.organization_members om ON om.user_id = u.id AND om.role = 'owner'
  INNER JOIN public.organizations o ON o.id = om.organization_id
  ORDER BY u.created_at DESC;
END;
$$;

-- Grant execute to service_role only (for admin_list_owners_fn)
GRANT EXECUTE ON FUNCTION public.admin_list_owners_fn() TO service_role;
```

Apply via: `mcp__plugin_supabase_supabase__apply_migration` with name `add_safe_list_owner_users_rpc`.

- [ ] **Step 2: Verify the RPC works**

Run via `mcp__plugin_supabase_supabase__execute_sql`:
```sql
SELECT count(*) FROM public.organization_members WHERE role = 'owner';
```
Confirm there are owner records to query.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/
git commit -m "feat: add safe_list_owner_users RPC migration spec"
```

---

### Task 2: Create `admin-create-user` Edge Function

**Files:**
- Create: `supabase/functions/admin-create-user/index.ts`

- [ ] **Step 1: Write the Edge Function**

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, x-admin-token, content-type",
      },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Validate admin token
    const adminToken = req.headers.get("x-admin-token");
    if (!adminToken) {
      return new Response(JSON.stringify({ error: "Token admin obrigatório" }), { status: 401 });
    }

    const { data: validToken, error: tokenError } = await adminClient.rpc("validate_admin_token", {
      p_token: adminToken,
    });
    if (tokenError || !validToken) {
      return new Response(JSON.stringify({ error: "Token inválido ou expirado" }), { status: 401 });
    }

    // Parse body
    const body = await req.json();
    const { name, email, password } = body;

    if (!name || !email || !password) {
      return new Response(JSON.stringify({ error: "Nome, email e senha são obrigatórios" }), { status: 400 });
    }
    if (password.length < 8) {
      return new Response(JSON.stringify({ error: "A senha deve ter pelo menos 8 caracteres" }), { status: 400 });
    }

    // Check if email already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const emailExists = (existingUsers?.users || []).some(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (emailExists) {
      return new Response(JSON.stringify({ error: "Este email já está cadastrado" }), { status: 409 });
    }

    // Create auth user (email auto-confirmed)
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name },
    });

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), { status: 400 });
    }

    const userId = authData.user.id;

    // Create profile
    const { error: profileError } = await adminClient
      .from("profiles")
      .upsert({
        id: userId,
        full_name: name,
        updated_at: new Date().toISOString(),
      });

    if (profileError) {
      console.error("[admin-create-user] Profile error:", profileError);
    }

    // Create organization
    const { data: orgData, error: orgError } = await adminClient
      .from("organizations")
      .insert({ name: `Organização de ${name}` })
      .select("id")
      .single();

    if (orgError || !orgData) {
      return new Response(JSON.stringify({ error: "Erro ao criar organização: " + (orgError?.message || "desconhecido") }), { status: 500 });
    }

    // Add user as owner of the organization
    const { error: memberError } = await adminClient
      .from("organization_members")
      .insert({
        user_id: userId,
        organization_id: orgData.id,
        role: "owner",
      });

    if (memberError) {
      return new Response(JSON.stringify({ error: "Erro ao adicionar como owner: " + memberError.message }), { status: 500 });
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: { id: userId, email, name },
        organization_id: orgData.id,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", "Connection": "keep-alive" },
      }
    );
  } catch (err) {
    console.error("[admin-create-user] Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Erro interno" }), { status: 500 });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/admin-create-user/
git commit -m "feat: add admin-create-user Edge Function"
```

---

### Task 3: Update AdminDashboard — Owner-Only Client List + URL Params + Criar Conta Tab

**Files:**
- Modify: `src/pages/AdminDashboard.tsx`

This is the largest task. Three changes in AdminDashboard:
1. Replace `safe_list_all_users` with `safe_list_owner_users` in Clientes tab
2. Add URL params for tab/filter persistence
3. Add "Criar Conta" tab with form

- [ ] **Step 1: Update imports and add useSearchParams**

At line 2, change:
```typescript
// FROM:
import { useNavigate } from "react-router-dom";
// TO:
import { useNavigate, useSearchParams } from "react-router-dom";
```

Add `UserPlus` to the lucide imports at line 18:
```typescript
import {
  Users, Shield, ChevronLeft, ChevronRight, TrendingUp, DollarSign,
  Trash2, Search, Download, ShoppingCart, CheckCircle, Clock, BarChart3,
  Eye, LogOut, UserPlus
} from "lucide-react";
```

- [ ] **Step 2: Update User interface to include organization_name**

At line 29-35, update the interface:
```typescript
interface User {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  organization_name?: string | null;
}
```

- [ ] **Step 3: Add useSearchParams and Criar Conta state**

Inside the component, after line 89 (`const navigate = useNavigate();`), add:
```typescript
const [searchParams, setSearchParams] = useSearchParams();
```

After line 116 (the filter states), add state for Criar Conta:
```typescript
// Criar Conta state
const [newUserName, setNewUserName] = useState("");
const [newUserEmail, setNewUserEmail] = useState("");
const [newUserPassword, setNewUserPassword] = useState("");
const [newUserConfirmPassword, setNewUserConfirmPassword] = useState("");
const [creatingUser, setCreatingUser] = useState(false);
```

- [ ] **Step 4: Replace loadData to use safe_list_owner_users**

In the `loadData` function (line 186-233), replace `safe_list_all_users` with `safe_list_owner_users`:

```typescript
const [countResult, usersResult, subsResult] = await Promise.all([
  supabase.rpc('safe_count_main_users', { p_token: token }),
  supabase.rpc('safe_list_owner_users', { p_token: token }),
  supabase.rpc('safe_get_all_subscriptions', { p_token: token }),
]);
```

- [ ] **Step 5: Add handleCreateUser function**

After the `handleLogout` function (line 281), add:
```typescript
const handleCreateUser = async () => {
  if (!newUserName || !newUserEmail || !newUserPassword || !newUserConfirmPassword) {
    toast.error("Preencha todos os campos");
    return;
  }
  if (newUserPassword.length < 8) {
    toast.error("A senha deve ter pelo menos 8 caracteres");
    return;
  }
  if (newUserPassword !== newUserConfirmPassword) {
    toast.error("As senhas não conferem");
    return;
  }
  setCreatingUser(true);
  try {
    const token = getAdminToken();
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      headers: { 'x-admin-token': token || '' },
      body: { name: newUserName, email: newUserEmail, password: newUserPassword },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    toast.success(`Conta criada com sucesso para ${newUserEmail}`);
    setNewUserName("");
    setNewUserEmail("");
    setNewUserPassword("");
    setNewUserConfirmPassword("");
    loadData(); // Refresh the client list
  } catch (err: any) {
    toast.error(err.message || "Erro ao criar conta");
  } finally {
    setCreatingUser(false);
  }
};
```

- [ ] **Step 6: Add URL params sync — read on mount, update on change**

Add a useEffect after the existing `useEffect(() => { loadData(); loadAdmins(); }, [])` to read tab from URL:

```typescript
// Read tab from URL params on mount
useEffect(() => {
  const tab = searchParams.get('tab');
  if (tab) {
    // Tabs component will read this via its value prop
  }
}, [searchParams]);
```

Then change the `<Tabs>` component at line 366 from:
```tsx
<Tabs defaultValue="dashboard" className="w-full">
```
to:
```tsx
<Tabs value={searchParams.get('tab') || 'dashboard'} onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })} className="w-full">
```

- [ ] **Step 7: Update navigate calls to pass state**

In the Clientes tab table rows (line 637 and 656), update the navigate calls to pass filter state:
```tsx
onClick={() => navigate(`/admin/user/${u.id}`, {
  state: { tab: 'clientes', page: currentPage, search: clientSearch, plan: clientPlanFilter }
})}
```

Also update the Pedidos tab navigate call (line 543):
```tsx
onClick={() => navigate(`/admin/user/${u.id}`, {
  state: { tab: 'pedidos' }
})}
```

- [ ] **Step 8: Add ORGANIZACAO column to Clientes table**

In the Clientes tab table header (around line 626-633), add after the EMAIL header:
```tsx
<TableHead className="text-gray-500 font-medium">ORGANIZAÇÃO</TableHead>
```

In the table body rows (around line 638), add after the email cell:
```tsx
<TableCell className="text-gray-700 text-sm">{u.organization_name || '-'}</TableCell>
```

- [ ] **Step 9: Add "Criar Conta" TabsTrigger**

After the admins TabsTrigger (line 371), add:
```tsx
<TabsTrigger value="criar-conta" className="text-gray-600 data-[state=active]:text-gray-900 data-[state=active]:border-gray-900">
  <UserPlus className="w-4 h-4 mr-2" />
  Criar Conta
</TabsTrigger>
```

- [ ] **Step 10: Add Criar Conta TabsContent**

After the admins `TabsContent` closing tag (line 742), add:
```tsx
{/* ══════════ TAB 5: CRIAR CONTA ══════════ */}
<TabsContent value="criar-conta" className="space-y-6">
  <div className="max-w-lg mx-auto">
    <Card className="bg-white border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <UserPlus className="w-5 h-5" />
          Criar Nova Conta de Usuário
        </CardTitle>
        <p className="text-sm text-gray-500">
          Crie uma conta para um novo cliente do CRM. A conta será criada como owner de sua própria organização.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new-user-name" className="text-sm text-gray-700">Nome Completo</Label>
          <Input id="new-user-name" type="text" placeholder="Nome do cliente"
            value={newUserName} onChange={e => setNewUserName(e.target.value)}
            className="bg-white border-gray-200 text-gray-900" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-user-email" className="text-sm text-gray-700">Email</Label>
          <Input id="new-user-email" type="email" placeholder="email@exemplo.com"
            value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)}
            className="bg-white border-gray-200 text-gray-900" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-user-pass" className="text-sm text-gray-700">Senha</Label>
          <Input id="new-user-pass" type="password" placeholder="Mínimo 8 caracteres"
            value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)}
            className="bg-white border-gray-200 text-gray-900" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-user-confirm-pass" className="text-sm text-gray-700">Confirmar Senha</Label>
          <Input id="new-user-confirm-pass" type="password" placeholder="Repita a senha"
            value={newUserConfirmPassword} onChange={e => setNewUserConfirmPassword(e.target.value)}
            className="bg-white border-gray-200 text-gray-900" />
        </div>
        <Button onClick={handleCreateUser} disabled={creatingUser} className="w-full bg-gray-900 text-white hover:bg-gray-800">
          {creatingUser ? "Criando conta..." : "Criar Conta"}
        </Button>
      </CardContent>
    </Card>
  </div>
</TabsContent>
```

- [ ] **Step 11: Commit**

```bash
git add src/pages/AdminDashboard.tsx
git commit -m "feat: owner-only client list, Criar Conta tab, URL params navigation"
```

---

### Task 4: Fix Back Button in AdminUserDetails

**Files:**
- Modify: `src/pages/AdminUserDetails.tsx`

- [ ] **Step 1: Add useLocation import**

At line 2, change:
```typescript
// FROM:
import { useParams, useNavigate } from "react-router-dom";
// TO:
import { useParams, useNavigate, useLocation } from "react-router-dom";
```

- [ ] **Step 2: Read location state**

Inside the component, after line 55 (`const navigate = useNavigate();`), add:
```typescript
const location = useLocation();
const navState = location.state as { tab?: string; page?: number; search?: string; plan?: string } | null;
```

- [ ] **Step 3: Update the back button onClick**

At line 435, change:
```typescript
// FROM:
onClick={() => navigate("/admin")}
// TO:
onClick={() => {
  if (navState?.tab) {
    const params = new URLSearchParams({ tab: navState.tab });
    if (navState.page) params.set('page', String(navState.page));
    if (navState.search) params.set('search', navState.search);
    if (navState.plan) params.set('plan', navState.plan);
    navigate(`/admin?${params.toString()}`);
  } else {
    navigate("/admin");
  }
}}
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/AdminUserDetails.tsx
git commit -m "fix: back button returns to previous tab with preserved filters"
```

---

### Task 5: Remove Signup from Login Modal

**Files:**
- Modify: `src/components/ui/login-1.tsx`
- Modify: `src/pages/Auth.tsx`

- [ ] **Step 1: Simplify login-1.tsx — remove signup mode**

Replace the entire `Login1Props` interface (lines 8-18) with:
```typescript
interface Login1Props {
  logo: {
    src: string;
    alt: string;
  };
  onLogin: (email: string, password: string) => Promise<void>;
  onGoogleLogin: () => Promise<void>;
  onForgotPassword: (email: string) => Promise<void>;
  loading?: boolean;
}
```

Remove `onSignup` from the destructured props (line 23):
```typescript
// FROM:
const Login1 = ({
  logo,
  onLogin,
  onSignup,
  onGoogleLogin,
  onForgotPassword,
  loading = false,
}: Login1Props) => {
// TO:
const Login1 = ({
  logo,
  onLogin,
  onGoogleLogin,
  onForgotPassword,
  loading = false,
}: Login1Props) => {
```

Remove the `isLogin` state (line 28):
```typescript
// FROM:
const [isLogin, setIsLogin] = useState(true);
const [isForgotPassword, setIsForgotPassword] = useState(false);
// TO:
const [isForgotPassword, setIsForgotPassword] = useState(false);
```

Remove the `name` state (line 32):
```typescript
// FROM:
const [name, setName] = useState("");
// (remove this line entirely)
```

Simplify `handleSubmit` (lines 35-42):
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  await onLogin(email, password);
};
```

Remove the `switchMode` function entirely (lines 49-55).

Simplify `backToLogin` (lines 63-66) — remove `setEmail("")`:
```typescript
const backToLogin = () => {
  setIsForgotPassword(false);
};
```

In the login form, remove the `!isLogin` conditional name field (lines 135-145), remove the `cn` wrapper on the fields div (lines 130-133 simplified to just className="flex flex-col gap-4"), and remove the `{!isLogin && (...)}` block.

Simplify the submit button text (line 203):
```typescript
// FROM:
isLogin ? "Entrar" : "Cadastrar"
// TO:
"Entrar"
```

Simplify the Google button text (line 215):
```typescript
// FROM:
{isLogin ? "Entrar com Google" : "Cadastrar com Google"}
// TO:
"Entrar com Google"
```

Remove the "Esqueceu a senha" conditional (line 182) — always show it:
```typescript
<button
  type="button"
  onClick={goToForgotPassword}
  disabled={loading}
  className="text-sm text-gray-500 hover:text-gray-700 hover:underline self-end -mt-2 disabled:opacity-50"
>
  Esqueceu a senha?
</button>
```

Remove the entire "Switch mode" div (lines 220-231).

- [ ] **Step 2: Update Auth.tsx — remove signup handler**

Remove the `handleSignup` function entirely (lines 58-86).

Remove `signUp` from the destructured `useAuth()` at line 11:
```typescript
// FROM:
const { signUp, signIn, signInWithGoogle, resetPassword, user, loading: authLoading } = useAuth();
// TO:
const { signIn, signInWithGoogle, resetPassword, user, loading: authLoading } = useAuth();
```

Remove `onSignup={handleSignup}` from the `Login1` component (line 146):
```typescript
// FROM:
<Login1
  logo={{ src: kairozLogo, alt: "KairoZ" }}
  onLogin={handleLogin}
  onSignup={handleSignup}
  onGoogleLogin={handleGoogleLogin}
  onForgotPassword={handleForgotPassword}
  loading={loading}
/>
// TO:
<Login1
  logo={{ src: kairozLogo, alt: "KairoZ" }}
  onLogin={handleLogin}
  onGoogleLogin={handleGoogleLogin}
  onForgotPassword={handleForgotPassword}
  loading={loading}
/>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/login-1.tsx src/pages/Auth.tsx
git commit -m "feat: remove signup from login modal, login-only access"
```

---

### Task 6: End-to-End Verification

- [ ] **Step 1: Build the project**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 2: Verify no TypeScript errors in changed files**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Deploy the Edge Function**

Deploy `admin-create-user` to Supabase using the deploy tool or `supabase functions deploy admin-create-user`.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: admin clients auth redesign — owners-only list, admin account creation, navigation fix"
```
