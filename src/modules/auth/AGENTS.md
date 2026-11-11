# modules/auth — sign-in, registration, invites

UI-only module. All state and REST calls live in `@core/store/auth.store`.

| File | Role |
|------|------|
| `ui/screens/LoginScreen.tsx` | Toggles between the login and register forms. |
| `ui/components/LoginForm.tsx` | Calls `useAuthStore().login`, which hits `POST /auth/login`. |
| `ui/components/RegisterForm.tsx` | Calls `registerCompany` with `{ companyName, companyDomain, adminEmail, adminPassword, adminName, avatarConfig? }`, which hits `POST /auth/register-company` and then logs in automatically. |
| `ui/screens/InviteAcceptScreen.tsx` | Reads the token from `/invite/:token`, validates it with `GET /auth/invites/:token`, then `acceptInvite` (`POST /auth/invites/:token/accept`) creates the account and logs in. It reuses `AvatarPicker` from the spatial module. |

## Notes

- Backend validation: the company domain must look like `example.com`, the admin password needs at least 8 characters, and the invite password at least 6.
  Show the server's message, which `ApiError` already flattens.
- After a successful invite accept, the URL still reads `/invite/...`. `App.tsx` checks the path before auth, so clear it
  with `history.replaceState` when you touch this flow.
- Route detection uses `window.location.pathname`. If a router is introduced (react-router or hash routing for Electron),
  this module is the first consumer.
