# Phase 7 - Login and Office Selection

## Objective

Phase 7 now provides a usable onboarding flow instead of a login-only placeholder. The original implementation had the right routing direction, but the visuals were weak and there was no path to create a company from the frontend. The refreshed phase delivers:

- a polished auth landing experience
- company registration from the UI using `POST /auth/register-company`
- automatic admin sign-in right after successful registration
- a cleaner office selection screen that feels connected to the auth experience

## What Changed

### 1. Global UI foundation

- `src/index.css` now uses the Tailwind v4-friendly `@import "tailwindcss"` entrypoint.
- Shared background helpers were added for gradients, grid texture, and atmospheric lighting.
- The base app typography and page styling were refreshed so screens do not render like raw HTML.

### 2. Shared UI primitives

- `src/core/ui/Button.tsx` was upgraded with stronger variants, loading affordances, and better focus treatment.
- `src/core/ui/Input.tsx` now supports optional hints and improved validation styling.
- `src/core/ui/Card.tsx` now provides a cleaner glass-panel treatment for auth and office surfaces.

### 3. Auth flow

- `src/modules/auth/ui/screens/LoginScreen.tsx` is now a split onboarding layout with two modes:
  - `Sign In`
  - `Create Workspace`
- `src/modules/auth/ui/components/LoginForm.tsx` now includes a clear route to registration.
- `src/modules/auth/ui/components/RegisterForm.tsx` was added for:
  - company name
  - company domain
  - admin name
  - admin email
  - admin password
- `src/core/store/auth.store.ts` now includes:
  - `registerCompany(payload)`
  - `clearError()`

Registration flow:

1. Submit `POST /auth/register-company`
2. If registration succeeds, immediately call `POST /auth/login`
3. Persist the admin session and route into office selection

### 4. Office selection flow

- `src/modules/office/ui/screens/OfficeSelectScreen.tsx` was rebuilt with:
  - a stronger header and organization context
  - better loading states
  - clearer error messaging
  - a more intentional empty state for first-time setup
- `src/modules/office/ui/components/OfficeCard.tsx` now presents each office like a real workspace selection card instead of a bare button shell
- office entry now tracks the specific office being connected and sets the local player id before Phase 8

### 5. Phase 7 destination state

- `src/modules/spatial/ui/GameContainer.tsx` is still a placeholder, but it now looks like a deliberate checkpoint after a successful realtime join

## How to Test

### 1. Start services

- Start the backend repo `D:\Echofox\project-aura`
- Make sure API is running on port `3000`
- Make sure realtime is running on port `3001`
- Start the frontend with `npm.cmd run dev`

### 2. Verify styling

- Open `http://localhost:5173`
- The auth screen should render with a dark atmospheric background, glass panels, spacing, and styled controls
- If the screen still looks like plain HTML, restart the Vite dev server so the global CSS change is picked up

### 3. Verify sign in

- Stay in `Sign In`
- Enter valid admin credentials
- On success, the app should move to office selection
- On invalid credentials, a styled error banner should appear

### 4. Verify sign up

- Switch to `Create Workspace`
- Enter a company name, domain, admin name, admin email, and password with at least 8 characters
- Submit the form
- Expected result:
  - the company is created
  - the app automatically signs in as the new admin
  - the app routes to office selection

### 5. Verify office seeding

- If there are no offices, the empty state should offer `Create Default Office`
- Click it
- The office list should refresh with a seeded office card

### 6. Verify office entry

- Click `Enter Office` on a card
- The selected card should show a connecting state
- The frontend should connect to realtime, emit `office:join`, receive `office:state`, and route to the placeholder game container

### 7. Verify logout

- From office selection, click `Sign Out`
- You should return to the auth screen and the session should be cleared

## Notes

- This is still a Phase 7 onboarding shell, not the final design language for the whole product.
- The sign-up path is organization-level, not employee self-service signup.
- Phaser rendering, avatar presence, and movement still belong to Phase 8.
