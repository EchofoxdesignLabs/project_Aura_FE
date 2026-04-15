# Phase 9: HUD & React Overlays

## Overview

Phase 9 implements the persistent User Interface (HUD) that floats above the spatial environment. The HUD provides contextual awareness (current zone, online presence, minimap) and future interaction points (media controls) without interfering with the underlying Phaser game engine.

## Architecture

The HUD operates on a strict separation of concerns:

- **Phaser (z-0):** Handles 60fps rendering, physics, and movement.
- **React HUD (z-10):** Handles UI rendering and state display.

To ensure the UI does not block game interactions, the main `<HUD />` container uses `pointer-events-none`. Only specific interactive components (like buttons or badges) re-enable `pointer-events-auto`.

## Data Strategy (Zustand)

The HUD is entirely store-driven. It subscribes to specific slices of our Zustand stores rather than reading from Phaser directly.

- **ZoneBadge:** Subscribes to `gameStore.currentZone`.
- **UserPill:** Subscribes to `authStore.user`.
- **PresenceCounter:** Subscribes to `gameStore.players`. To optimize React rendering, the selector strictly monitors the _count_ (`Object.keys(state.players).length`), ignoring high-frequency coordinate updates.
- **MediaToolbar:** Subscribes to `mediaStore`. Currently, it acts as a placeholder. The buttons are hard-disabled until `isMediaInitialized` becomes true (planned for Phase 10).

## Minimap Implementation

The `Minimap` component requires special handling to prevent React performance issues.

Since player coordinates change at 60fps, binding them to React state would cause severe re-render thrashing. Instead:

1. The component renders a static `<canvas>`.
2. A `requestAnimationFrame` loop continuously queries `useGameStore.getState()` directly.
3. The loop clears and redraws the office bounds, zones, and player dots natively on the canvas.
4. `OfficeScene.update` pushes the local player's velocity-driven coordinates back into the store so the minimap can track local movement in real-time.
