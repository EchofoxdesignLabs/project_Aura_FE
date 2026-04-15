# Phase 8 Testing Guide

This document outlines the manual verification steps required to ensure the Spatial Engine (Phase 8) is functioning correctly.

## Prerequisites

- Backend API running on port `3000`.
- Backend Realtime Gateway running on port `3001` (Redis running).
- Frontend Vite server running on port `5173`.

## Manual Verification Scenarios

### 1. Office Initialization

- **Action:** Log in and click "Enter Office" on a valid office card.
- **Expected Result:** The `GameContainer` should mount. The Phaser canvas should render a dark grid with distinct colored zones (e.g., Lobby, Meeting, Private Desk). The local player avatar should spawn in the center. The debug overlay should display 1 connected player.

### 2. Local Movement and Constraints

- **Action:** Use WASD or Arrow keys to move the avatar. Move diagonally. Walk into the edges of the map.
- **Expected Result:** Movement should be smooth. Diagonal movement should not be faster than moving in straight lines. The avatar should be blocked by the world boundaries and unable to walk off the grid. The camera should smoothly follow the local avatar.

### 3. Multiplayer Synchronization & State Diffing (Late Joiner Test)

- **Action:** Open a second browser tab (or incognito window), log in as a different user, and enter the same office.
- **Expected Result:** \* The second user should instantly see the first user standing in their current location.
  - The first user should instantly see the second user spawn in.
  - Both avatars should have their correct respective names displayed.
  - The debug overlay on both screens should show 2 players. This verifies `PlayerManager` is successfully subscribing to Zustand diffs.

### 4. Movement Sync and Lerp

- **Action:** Move User A while watching User B's screen.
- **Expected Result:** User B should see User A moving smoothly. There should be no extreme teleporting or jittering, verifying that the 15fps throttle and the `PlayerSprite` lerp factor are interacting correctly.

### 5. Zone Transitions

- **Action:** Walk the avatar into a colored "Meeting" or "Private Desk" zone.
- **Expected Result:** Check the React DevTools or state logs. The `gameStore.currentZone` should update with the zone's ID, name, and type. Walking out of the zone should reset it to `null`.

### 6. Meeting Handshake Stub

- **Action:** Walk both User A and User B into the same Meeting zone.
- **Expected Result:** The `gameStore.inMeeting` flag should turn `true`, and `meetingParticipants` should populate with both user IDs. (Visual UI for this will arrive in Phase 11).

### 7. Lifecycle Cleanup

- **Action:** As User A, refresh the page or click a browser back button to unmount the game.
- **Expected Result:** User B should see User A's avatar disappear from the canvas immediately (handled by `PlayerManager` detecting the store deletion). The backend console should log the disconnect, confirming no ghost sockets remain active.
