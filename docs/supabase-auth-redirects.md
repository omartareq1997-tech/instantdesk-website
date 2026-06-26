# Supabase Auth Redirect Allowlist

Add these URLs in Supabase Dashboard -> Authentication -> URL Configuration -> Redirect URLs:

- `https://instantdesk.pl/reset-password`
- `https://instantdesk.pl/auth/callback`
- `http://localhost:3000/reset-password`
- `http://localhost:3001/reset-password`
- `http://localhost:3000/auth/callback`
- `http://localhost:3001/auth/callback`

The app sends password reset requests with:

```ts
redirectTo: `${window.location.origin}/reset-password`
```

That means local development automatically uses the current localhost origin, and production automatically uses the deployed `instantdesk.pl` origin.
