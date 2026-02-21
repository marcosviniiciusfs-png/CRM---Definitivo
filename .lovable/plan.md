

# Pricing Standalone, Owner Bypass, Google Calendar Restriction, and Fixes

## 1. Pricing Page Outside CRM (No Sidebar)

Currently `/pricing` is wrapped in `DashboardLayout` which shows the sidebar. We need to remove `DashboardLayout` from the pricing route so it renders as a standalone page.

**File: `src/App.tsx`**
- Change line 120 from `<ProtectedRoute><DashboardLayout><LazyPage><Pricing /></LazyPage></DashboardLayout></ProtectedRoute>` to `<ProtectedRoute><LazyPage><Pricing /></LazyPage></ProtectedRoute>`

**File: `src/pages/Pricing.tsx`**
- Add a standalone header with the Kairoz logo and a "Sair" (logout) button
- Add a banner/message like "Assine um plano para acessar o CRM completo"
- Style it as a self-contained full-page layout (no sidebar dependency)

## 2. Fix "Em breve" Badge in Sidebar

The screenshot shows the badge is overflowing and breaking layout on items like "Roleta de Lea..." and "Chat".

**File: `src/components/AppSidebar.tsx`**
- Reduce badge size: use `text-[9px] px-1 py-0 h-4 leading-tight` instead of the current larger styling
- Ensure `flex-shrink-0` on the badge so text truncates instead of badge overflowing
- Use `overflow-hidden` on the parent container and `truncate` on the item text
- The badge should be compact and inline, not wrapping

## 3. Owner Bypass (mateusabcck@gmail.com always has full access)

**File: `supabase/functions/check-subscription/index.ts`**
- After authenticating the user, check if the email is `mateusabcck@gmail.com`
- If yes, return `subscribed: true` with `plan_id: 'elite'` and max collaborators 30, bypassing the database check
- This ensures the CRM owner always has complete access regardless of subscription status

## 4. Remove Google Calendar for Non-Owner Users

**File: `src/components/DashboardLayout.tsx`**
- Import `useAuth` and get the current user email
- Only render the Google Calendar button and modal if `user?.email === 'mateusabcck@gmail.com'`
- All other users will not see the calendar icon in the header

## 5. Admin Dashboard - Change User Access Level Without Subscription

The current Admin Dashboard already has the "Usuarios Admin" tab for managing super_admin roles. The user wants to be able to change CRM-level access (roles within organizations) from the admin panel even if the target user has no active subscription.

**File: `src/pages/AdminDashboard.tsx`**
- This is about managing `organization_members` roles from the admin panel
- The current admin panel navigates to `/admin/user/:userId` (AdminUserDetails) for individual user management
- Verify that AdminUserDetails allows role changes without subscription checks

**File: `src/pages/AdminUserDetails.tsx`**
- Check existing role-change logic and ensure it does not gate behind subscription status

## 6. Verify Password Change Functionality

**File: `src/pages/Settings.tsx`**
- The password change logic (lines 178-230) uses `signInWithPassword` to verify current password, then `updateUser` to set new password
- Fix the stale `PLAN_NAMES` map (line 19-23) which still references old Stripe product IDs -- update to `star`, `pro`, `elite`
- The password change logic itself looks correct (verify current, update new)

**File: `supabase/functions/admin-reset-password/index.ts`**
- Already exists for admin-initiated password resets via email link
- Verify it's functional (uses Resend API for email delivery)

**File: `src/pages/Colaboradores.tsx`**
- Check if collaborator password changes use the `update-organization-member` edge function and confirm it handles password updates

## Technical Summary

| File | Action |
|------|--------|
| `src/App.tsx` | Remove `DashboardLayout` wrapper from `/pricing` route |
| `src/pages/Pricing.tsx` | Add standalone header, CTA message about needing subscription |
| `src/components/AppSidebar.tsx` | Fix "Em breve" badge sizing - make compact and responsive |
| `supabase/functions/check-subscription/index.ts` | Add owner email bypass (always return elite access) |
| `src/components/DashboardLayout.tsx` | Conditionally show Google Calendar only for owner email |
| `src/pages/Settings.tsx` | Update PLAN_NAMES to new plan IDs (star/pro/elite) |
| `src/pages/AdminDashboard.tsx` | Verify role management works without subscription gate |
| `src/pages/AdminUserDetails.tsx` | Ensure role changes dont require subscription |

