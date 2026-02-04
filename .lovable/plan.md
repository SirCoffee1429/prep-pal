
# Plan: Fix AdminDashboard to Use `users` Table

## Problem

The build is failing because `AdminDashboard.tsx` references `user_roles` table which doesn't exist in the TypeScript types. Your database uses a `users` table instead.

**Build Error:**
```
src/pages/AdminDashboard.tsx(28,40): error TS2589: Type instantiation is excessively deep
Argument of type '"user_roles"' is not assignable to parameter of type 'never'
```

## Current State

| Component | Table Used | Column Used | Status |
|-----------|------------|-------------|--------|
| AdminLogin.tsx | `users` | `id` | Correct |
| AdminDashboard.tsx | `user_roles` | `user_id` | Wrong - needs fix |
| TypeScript Types | `users` | `id` | Correct |

## Solution

Update `AdminDashboard.tsx` to query the `users` table instead of `user_roles`, matching how `AdminLogin.tsx` works.

---

## Changes

### File: `src/pages/AdminDashboard.tsx`

**Lines 28-33 - Change the role verification query:**

```typescript
// FROM (current - broken):
const { data: roleData } = await supabase
  .from("user_roles")
  .select("role")
  .eq("user_id", session.user.id)
  .eq("role", "admin")
  .maybeSingle();

// TO (fixed):
const { data: roleData } = await supabase
  .from("users")
  .select("role")
  .eq("id", session.user.id)
  .eq("role", "admin")
  .maybeSingle();
```

**Key changes:**
1. Table: `user_roles` → `users`
2. Column: `user_id` → `id`

---

## Files Modified

| File | Change |
|------|--------|
| `src/pages/AdminDashboard.tsx` | Update role check to use `users` table |

---

## Verification

After this change:
1. Build errors will be resolved
2. Admin login flow will work end-to-end
3. Both AdminLogin and AdminDashboard will use the same `users` table consistently
