# Admin Client List, Auth & Navigation Redesign

**Date:** 2026-04-08
**Status:** Approved

## Overview

Three changes to the CRM admin panel to improve client management, tighten access control, and fix navigation behavior.

---

## 1. Client List — Owners Only

**Problem:** The "Clientes" tab lists ALL users (owners + collaborators) in a flat list.

**Solution:** Show only organization owners (role = 'owner') in the client list. Collaborators are visible inside each owner's detail page.

### Changes

**New RPC `safe_list_owner_users(p_token)`:**
- Returns users where `organization_members.role = 'owner'`
- Includes organization name alongside user data
- Uses same admin token validation as existing RPCs

**AdminDashboard.tsx — Tab "Clientes":**
- Replace `safe_list_all_users` call with `safe_list_owner_users`
- Add "Organizacao" column to the table
- Table columns: EMAIL, ORGANIZACAO, DATA DE CADASTRO, PLANO, STATUS, ACOES
- Metric cards remain the same (filtered to owners only)
- Clicking a row navigates to `/admin/user/:id` (unchanged)

**AdminUserDetails.tsx — no changes needed:**
- Already displays all organization members when viewing a user

---

## 2. Remove Signup from Login Modal + Admin Account Creation

**Problem:** Anyone can create accounts via the login modal. Account creation should be restricted to admin dashboard only.

### 2a. Login Modal Changes

**login-1.tsx:**
- Remove signup mode toggle ("Criar conta" / "Entrar" link)
- Remove "Nome Completo" field
- Remove signup-related state (`isLogin` toggle logic)
- Remove `onSignup` prop from `Login1Props`
- Remaining UI: Email, Password, "Entrar" button, Google login, "Esqueceu a senha?"

**Auth.tsx:**
- Remove `handleSignup` handler
- Stop passing `onSignup` to `Login1`
- `signUp` from `useAuth()` no longer used on this page

### 2b. New "Criar Conta" Tab in Admin Dashboard

**AdminDashboard.tsx — 5th tab "Criar Conta":**
- Form fields: Nome Completo, Email, Senha (min 8 chars), Confirmar Senha
- "Criar Conta" button
- Calls new Edge Function `admin-create-user`

**New Edge Function `admin-create-user`:**
- Validates admin token via `p_token`
- Creates user via `supabase.auth.admin.createUser()` with `email_confirm: true`
- Creates profile entry
- Creates organization with the new user as owner
- Returns created user data

**Front-end validations:**
- All fields required
- Valid email format
- Password min 8 characters
- Password and confirmation must match
- Toast notifications for success/error

---

## 3. Navigation — URL Params for Back Button

**Problem:** Clicking "Voltar" from user detail resets to Dashboard tab, losing the Clientes context.

**Solution:** Use URL search params to persist tab/filters, and pass state during navigation.

### Changes

**AdminDashboard.tsx:**
- Read `tab`, `page`, `search`, `plan` from URL search params on mount
- Update URL params when tab/filters change (no full reload, just `replaceSearchParams`)
- Default tab remains "dashboard" when no param is present
- Supported params: `tab` (dashboard|pedidos|clientes|admins|criar-conta), `page`, `search`, `plan`

**Navigation to user detail:**
- When clicking a user row, pass current filter state via `navigate()`:
  ```
  navigate(`/admin/user/${userId}`, {
    state: { tab, page, search, plan }
  })
  ```

**AdminUserDetails.tsx — Back button:**
- Read `location.state` for `{ tab, page, search, plan }`
- Build return URL from state params
- Fallback: `/admin` (no state)
- Navigate to `/admin?tab=clientes&page=X&search=Y&plan=Z`

---

## Files Modified

| File | Change |
|------|--------|
| `src/pages/AdminDashboard.tsx` | Owner-only client list, new Criar Conta tab, URL params |
| `src/pages/AdminUserDetails.tsx` | Back button with state-based navigation |
| `src/pages/Auth.tsx` | Remove signup handler |
| `src/components/ui/login-1.tsx` | Remove signup mode, remove onSignup prop |
| `supabase/functions/admin-create-user/index.ts` | New Edge Function |
| Supabase migration | New RPC `safe_list_owner_users` |

## Edge Cases

- **Owner deleted:** If an owner is removed, their org's collaborators become orphaned. The RPC only lists current owners, so they won't appear.
- **User already exists:** Edge Function must check if email is already registered and return a clear error.
- **Direct URL access:** `/admin?tab=clientes` must work when pasted directly in the browser — read params on mount.
- **No state on back:** If someone navigates directly to `/admin/user/:id` (bookmark), back button falls back to `/admin`.
