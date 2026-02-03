
# Plan: Add Password Reset Functionality

## Problem
After disabling Lovable Cloud, you're unable to log in with "Invalid login credentials" error. The auth system is working, but the password needs to be reset.

## Solution
Add a "Forgot Password" link to the login page that sends a password reset email via Supabase Auth.

---

## Changes

### 1. Update AdminLogin.tsx

Add a password reset flow with these changes:

- Add a new state `showResetForm` to toggle between login and reset views
- Add a `handlePasswordReset` function that calls `supabase.auth.resetPasswordForEmail()`
- Add UI for the reset form (email input + submit button)
- Add a "Forgot password?" link below the login form
- After reset email is sent, show a success message

### 2. Create ResetPassword.tsx (New Page)

A new page to handle the password reset callback:

- Route: `/admin/reset-password`
- Captures the reset token from the URL
- Displays a form to enter new password
- Calls `supabase.auth.updateUser()` to set new password
- Redirects to login on success

### 3. Update App.tsx

Add the new route for password reset:

```text
/admin/reset-password → ResetPassword component
```

---

## Technical Details

**Password Reset Email Flow:**
1. User clicks "Forgot password?" on login page
2. User enters email, clicks "Send Reset Link"
3. Supabase sends email with reset link pointing to `/admin/reset-password`
4. User clicks link, lands on reset page with token in URL hash
5. User enters new password and submits
6. `supabase.auth.updateUser({ password })` saves new password
7. User redirected to login page

**Key Code (AdminLogin.tsx):**
```typescript
const handlePasswordReset = async () => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/admin/reset-password`,
  });
  
  if (error) throw error;
  
  toast({
    title: "Check your email",
    description: "We've sent you a password reset link.",
  });
};
```

**Key Code (ResetPassword.tsx):**
```typescript
// Listen for auth state change with PASSWORD_RECOVERY event
supabase.auth.onAuthStateChange(async (event) => {
  if (event === "PASSWORD_RECOVERY") {
    // Show password reset form
  }
});

const handleSubmit = async () => {
  const { error } = await supabase.auth.updateUser({ 
    password: newPassword 
  });
  
  if (!error) {
    navigate("/admin/login");
  }
};
```

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/pages/AdminLogin.tsx` | Modify - Add forgot password link and reset email form |
| `src/pages/ResetPassword.tsx` | Create - New page for setting new password |
| `src/App.tsx` | Modify - Add `/admin/reset-password` route |

---

## After Implementation

1. Go to `/admin/login`
2. Click "Forgot password?"
3. Enter `ryan@oldhawthorne.com`
4. Check your email for the reset link
5. Click the link and set a new password
6. Log in with your new password
