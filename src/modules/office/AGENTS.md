# modules/office — office selection

Shown after login and before the game.

| File | Role |
|------|------|
| `ui/screens/OfficeSelectScreen.tsx` | `GET /office` lists offices. The backend creates the default office (the Aura_Assets map) for every company and upgrades offices seeded before the asset pipeline, so the list is normally never empty. The Create and Reset buttons call `POST /office/seed` and `POST /office/reseed`, which are ORG_ADMIN only, so they are shown only to admins; reseed wipes the company's offices. **Enter office** runs `socketService.connect(token)`, then emits `office:join` and waits up to 10 s for `office:state`. That fills the game store (`setLocalPlayerId`, `setOffice`, `setAllPlayers`), and `App` then switches to `GameContainer`. |
| `ui/components/OfficeCard.tsx` | Presentational card. |
| `ui/components/InviteModal.tsx` | ORG_ADMIN invite creation through `useAuthStore().createInvite`. Shows `inviteUrl`, which the backend builds from its `APP_URL` setting. |

## Notes

- `GameContainer` emits `office:join` again on every socket (re)connect and also loads furniture there. Do not move furniture
  loading into this screen, because reconnects would miss it.
- Planned: office creation and editing UI. Today every company has the one default office.
