# Phase 8: The Spatial Engine

## Summary

Phase 8 introduces the core spatial environment using Phaser 3. It replaces the temporary checkpoint screen with a fully functional 2D canvas where users are represented as avatars. This phase establishes the foundation for movement, multiplayer synchronization, and zone awareness, acting as the bedrock for the upcoming media and overlay features.

## Architecture Notes

The primary architectural goal of this phase was establishing a strict boundary between the React application layer (UI and state) and the Phaser game layer (high-frequency rendering), while maintaining the Single Responsibility Principle within the engine itself.

- **Single Source of Truth:** `gameStore` (Zustand) remains the absolute authority on who is in the office and where they are.
- **Decoupled Networking:** `NetworkManager` is completely ignorant of Phaser. It listens to Socket.IO events and strictly updates the `gameStore`.
- **Decoupled Entity Management:** `PlayerManager` acts as the bridge between the state and the scene. It subscribes to changes in `gameStore.players` and diffs the state. When a player joins, moves, or leaves in the store, the manager reacts by spawning, lerping, or destroying the respective `PlayerSprite`.
- **Pure View Controller:** `OfficeScene` is strictly responsible for drawing the static environment (grid, zones), initializing the subsystem managers (`InputManager`, `NetworkManager`, `PlayerManager`), and binding the camera to the local player.
- **Strict Cleanup:** The `GameContainer` component owns the lifecycle. On unmount (e.g., user leaves the office), it forcefully destroys the Phaser instance, disconnects the Socket.IO client, and resets the `gameStore` to prevent ghost connections and memory leaks.

## What Changed

### Core Systems Added

- **`GameContainer.tsx` (Updated):** Now serves as the Phaser bootloader. It mounts the canvas, reserves absolute-positioned layers for Phase 9 UI overlays, and handles tear-down logic.
- **`OfficeScene.ts`:** The primary simulation loop. It draws the office grid, renders zone boundaries based on the state snapshot, and orchestrates the subsystems.
- **`PlayerSprite.ts`:** The visual entity representing a user. Uses a deterministic hash for colors. Local instances move instantaneously, while remote instances utilize linear interpolation (lerp) to mask network latency.
- **`PlayerManager.ts`:** Handles the entity lifecycle. Subscribes to Zustand, maintains a Map of active `PlayerSprites`, and executes the lerp update loop for remote players.
- **`InputManager.ts`:** Isolates keyboard state. Normalizes WASD and Arrow key inputs so diagonal movement matches cardinal movement speeds.
- **`NetworkManager.ts` (Updated):** Throttles outbound positional data to approximately 15fps to prevent server flooding. Inbound events update the Zustand store directly.

## State Flow Example (Player Movement)

1. User A presses 'W'.
2. `InputManager` returns a negative Y velocity.
3. `OfficeScene` applies velocity to User A's physics body.
4. `OfficeScene` passes new X/Y to `NetworkManager.emitMove()`.
5. Server receives movement and broadcasts `player:moved` to the room.
6. User B's `NetworkManager` receives `player:moved` and updates `gameStore`.
7. User B's `PlayerManager` detects the store change and sets the new target X/Y for User A's sprite.
8. User B's `PlayerSprite` smoothly lerps to the new position over subsequent frames managed by `PlayerManager.update()`.
