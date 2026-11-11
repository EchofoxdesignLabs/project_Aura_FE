# modules/office — office selection

Shown after login and before the game.

| File | Role |
|------|------|
| `ui/screens/OfficeSelectScreen.tsx` | `GET /office` lists offices. The Seed and Reseed buttons call `POST /office/seed` and `POST /office/reseed`, which are POC endpoints, and reseed wipes the company's offices. **Enter office** runs `socketService.connect(token)`, then emits `office:join` and waits up to 10 s for `office:state`. That fills the game store (`setLocalPlayerId`, `setOffice`, `setAllPlayers`), and `App` then switches to `GameContainer`. |
| `ui/components/OfficeCard.tsx` | Presentational card. |
| `ui/components/InviteModal.tsx` | ORG_ADMIN invite creation through `useAuthStore().createInvite`. Shows `inviteUrl`, which the backend hard-codes to `http://localhost:5173/invite/...`, while the dev server runs on `:51173`. |

## Notes

- `GameContainer` emits `office:join` again on every socket (re)connect and also loads furniture there. Do not move furniture
  loading into this screen, because reconnects would miss it.
- Planned: office creation and editing UI. Today offices exist only through seeding.
