
# Plan: Fix TypeScript Types for Supabase Migration

## Problem Summary

After disabling Lovable Cloud, the TypeScript types file (`src/integrations/supabase/types.ts`) is out of sync with your actual Supabase database. The `user_roles` table exists in the database but is missing from the types, causing build errors.

**Build Errors:**
- `TS2589: Type instantiation is excessively deep and possibly infinite`
- `TS2769: Argument of type '"user_roles"' is not assignable to parameter of type 'never'`

---

## Solution

Add the `user_roles` table definition to the TypeScript types file and align the admin verification logic to use a consistent table.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/integrations/supabase/types.ts` | Add `user_roles` table type definition |
| `src/pages/AdminDashboard.tsx` | Update to use `users` table (consistent with AdminLogin) |

---

## Technical Details

### 1. Update Types File

Add the `user_roles` table to the `Tables` section in `types.ts`:

```typescript
user_roles: {
  Row: {
    id: string
    user_id: string
    role: Database["public"]["Enums"]["app_role"]
    created_at: string
  }
  Insert: {
    id?: string
    user_id: string
    role: Database["public"]["Enums"]["app_role"]
    created_at?: string
  }
  Update: {
    id?: string
    user_id?: string
    role?: Database["public"]["Enums"]["app_role"]
    created_at?: string
  }
  Relationships: []
}
```

### 2. Align Admin Verification (Recommended Alternative)

Looking at the code, there are two tables being used inconsistently:
- `AdminLogin.tsx` uses the `users` table with a `role` column
- `AdminDashboard.tsx` uses the `user_roles` table

**Option A - Use `users` table (simpler):**
Update `AdminDashboard.tsx` to query the `users` table like `AdminLogin.tsx` does:

```typescript
// Change from:
const { data: roleData } = await supabase
  .from("user_roles")
  .select("role")
  .eq("user_id", session.user.id)
  .eq("role", "admin")
  .maybeSingle();

// To:
const { data: roleData } = await supabase
  .from("users")
  .select("role")
  .eq("id", session.user.id)
  .eq("role", "admin")
  .maybeSingle();
```

**Option B - Use `user_roles` table (follows best security practices):**
Update `AdminLogin.tsx` to also use `user_roles` and update the types file.

---

## Recommendation

**Use Option A** for now - update `AdminDashboard.tsx` to use the `users` table. This:
1. Fixes the build error immediately
2. Is consistent with how `AdminLogin.tsx` already works
3. Uses the table that already exists in your types file

The `users` table already has the `role` column and is properly typed.

---

## Implementation Steps

1. **Modify `AdminDashboard.tsx`** (lines 27-33):
   - Change `from("user_roles")` to `from("users")`
   - Change `.eq("user_id", session.user.id)` to `.eq("id", session.user.id)`

2. **Test the login flow** to verify admin access works correctly

---

## After Implementation

1. Navigate to `/admin/login`
2. Use the password reset flow if needed (already implemented)
3. Log in with your admin credentials
4. Verify you can access the Admin Dashboard

---

## Long-term: Regenerate Types from Supabase

Once you have your Supabase CLI configured with your project, run:

```bash
supabase gen types typescript --project-id your-project-id > src/integrations/supabase/types.ts
```

This will generate accurate types matching your actual database schema.
