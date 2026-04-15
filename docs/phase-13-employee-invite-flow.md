# Phase 13 Frontend: Employee Invite Flow

This document details the frontend implementation for the Employee Invite Flow. It connects to the newly added `aura-api` endpoints to allow ORG_ADMINs to seamlessly bring employees into their company workspaces.

## Changes Made

### 1. Types & Contracts (`src/core/types.ts`)
- Added request and response types referencing the backend contracts. Include specific interfaces for creating invites, invite details, and accepting an invite.

### 2. State Management (`src/core/store/auth.store.ts`)
- Extended `useAuthStore` with two new actions: `createInvite` and `acceptInvite`.
- Appended `inviteLoading` and `inviteError` directly into the store to streamline error displaying without complicating screen-local logic.

### 3. Invitation Trigger (`src/modules/office/ui/screens/OfficeSelectScreen.tsx` & `InviteModal.tsx`)
- Displayed a conditionally rendered "**+ Invite Member**" button available strictly for `ORG_ADMIN`s in the `OfficeSelectScreen` header.
- Implemented `InviteModal.tsx`, a sleek glassmorphic drawer containing inputs for user email, role assignment (`EMPLOYEE` / `ORG_ADMIN`), and an optional message.
- Includes a direct "Copy Link" capability post-success.

### 4. Acceptance Screen (`src/modules/auth/ui/screens/InviteAcceptScreen.tsx`)
- Integrated a standalone generic acceptance splash screen decoupled from the application context.
- Parses the URL segment to fetch `/auth/invites/:token` metadata automatically inside `useEffect`.
- Handles password length criteria internally before triggering the `POST` acceptance event.

### 5. Application Routing (`src/App.tsx`)
- Hardcoded a lightweight deep-link interception catching paths starting with `/invite/` overriding normal logic to present the `InviteAcceptScreen`. No reliance on `react-router` needed initially.

---

## How to Test on Frontend

### Prerequisites
Make sure the backend API (`aura-api` on port `3000`) and Realtime gateway (`aura-realtime` on port `3001`) are running, along with your Docker containers (Postgres & Redis). Next, begin the frontend:

```bash
cd D:\Echofox\project-aura-fe
npm run dev
```

### Flow Walkthrough

1. **Test Admin Visibility**:
   - Create a workspace or log in as an `ORG_ADMIN`.
   - Access the `OfficeSelectScreen`. Note the "+ Invite Member" button in the header.

2. **Generate the Invite**:
   - Click "+ Invite Member" to open the modal.
   - Enter a target email address, select "Employee", and optionally add a message.
   - Click "Generate Invite Link".
   - Confirm it renders the generated token URL. Click "Copy Link".

3. **Verify the Public Acceptance Flow**:
   - Open an incognito window alongside your current session.
   - Paste the copied link (e.g., `http://localhost:5173/invite/<TOKEN>`).
   - Observe the splash screen, displaying the invite target, proper company name, role designation, and inviter's name.

4. **Complete The Setup**:
   - Input your desired username and verify a compliant, matching password.
   - Click "Join". This will immediately dispatch the `POST` acceptance logic, returning an `access_token` and storing it automatically in `localStorage`.
   - The user is automatically forwarded inline to the `OfficeSelectScreen` with an active authenticated state.

5. **Test Validation & Guarding**:
   - Intentionally attempt to use the token URL once more. Verify it results in a splash-screen error: "This invite link is invalid or has expired."
   - Attempt logging in via the initial user terminal as an `EMPLOYEE`. Note they do not have access or visibility over the "+ Invite Member" button.

---

## Areas for Improvement

1. **Email Integration**: The front end only supports rendering the invite URL and manual copy-pasting for POC purposes. In a live production variant, a "Send" confirmation without a raw link dump is standard (email delivery happens backend).
2. **Password Strength Feedback**: `InviteAcceptScreen` could further integrate an active password strength meter rather than simply erroring if `< 8` chars to better ensure user compliance.
3. **Form Error Polish**: Zod validation via `react-hook-form` wasn't enforced across the modal input state. Expanding the forms to validate inputs live would minimize 400 Bad Request triggers sent to the backend.
4. **Resend / Management Tools**: An admin dashboard listing out "Sent Invites" allowing the UI to call the revocation endpoint (`PATCH /auth/invites/<TOKEN>/revoke`) was not built for Phase 13. Admins rely purely on immediate link sharing. Creating an "Active Invites" view would improve practical use cases.
