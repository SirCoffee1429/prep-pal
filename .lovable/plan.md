
# Plan: Restore Backend to Work with Lovable Cloud

## Problem Summary

The admin authentication is broken because the code references a `users` table that doesn't exist in the database. The actual database has a `user_roles` table with proper RLS policies and a `has_role` helper function.

| Current Code | Actual Database |
|--------------|-----------------|
| Queries `users` table | Has `user_roles` table |
| Checks `role` column on `users` | Uses `user_id` + `role` in `user_roles` |
| Insert creates user record with role | Should insert into `user_roles` only |

## Existing Database Setup (Already Correct)

Your Lovable Cloud database already has the proper security-first setup:

```text
Table: user_roles
- id (uuid, primary key)
- user_id (uuid, references auth.users)
- role (app_role enum: 'admin' | 'staff')
- created_at (timestamp)

Function: has_role(_user_id, _role)
- Returns boolean
- Security definer (bypasses RLS safely)
```

## Changes Required

### 1. Fix AdminLogin.tsx

**Sign Up Flow** (lines 46-55):
- Change from inserting into `users` table
- Insert into `user_roles` with the authenticated user's ID

**Login Flow** (lines 73-78):
- Change from querying `users` table
- Query `user_roles` to verify admin role

### 2. Fix AdminDashboard.tsx

**Auth Check** (lines 28-33):
- Change from querying `users` table
- Query `user_roles` to verify admin role

### 3. Add Admin Role for Your Account

After the code fix, you'll need to add your user ID to the `user_roles` table. Since there's already one admin entry in the database (user_id: `9c6f2246-2689-4928-84ff-5cc724d5b6eb`), we need to either:
- Create a new account and it will get the admin role automatically
- Or I can check if you have an existing auth account and add the role

## Technical Details

### AdminLogin.tsx Changes

```typescript
// SIGNUP: Insert role into user_roles (not users)
const { error: roleError } = await supabase
  .from("user_roles")
  .insert({ user_id: signInData.user.id, role: "admin" });

// LOGIN: Check role in user_roles (not users)
const { data: roleData } = await supabase
  .from("user_roles")
  .select("role")
  .eq("user_id", data.user.id)
  .eq("role", "admin")
  .maybeSingle();
```

### AdminDashboard.tsx Changes

```typescript
// AUTH CHECK: Query user_roles (not users)
const { data: roleData } = await supabase
  .from("user_roles")
  .select("role")
  .eq("user_id", session.user.id)
  .eq("role", "admin")
  .maybeSingle();
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/AdminLogin.tsx` | Update signup insert and login query to use `user_roles` |
| `src/pages/AdminDashboard.tsx` | Update auth check query to use `user_roles` |

## Expected Outcome

After these changes:
1. New admin signups will correctly insert into `user_roles`
2. Login will verify admin role from `user_roles`
3. Dashboard access will be properly protected
4. The existing `has_role` function and RLS policies will work correctly

## Post-Implementation Step

Once the code is fixed, you can sign up with a new admin account or I can help add your existing user to the `user_roles` table.
