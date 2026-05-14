import { sfuManager } from '@core/services/sfu/sfu.manager';
import { useGameStore } from '@core/store/game.store';

const PROXIMITY_RADIUS = 6; // tiles
const FULL_VOLUME_RADIUS = 1.5; // tiles
const CHECK_INTERVAL = 500;

export class ProximitySystem {
  private intervalId: number | null = null;

  public start(): void {
    if (this.intervalId !== null) {
      return;
    }

    console.log('[ProximitySystem] Started');
    this.intervalId = window.setInterval(() => this.checkProximity(), CHECK_INTERVAL);
  }

  public stop(): void {
    if (this.intervalId === null) {
      return;
    }

    window.clearInterval(this.intervalId);
    this.intervalId = null;
    console.log('[ProximitySystem] Stopped');
  }

  private checkProximity(): void {
    const state = useGameStore.getState();
    if (state.inMeeting || !state.localPlayerId) {
      return;
    }

    const localPlayer = state.players[state.localPlayerId];
    if (!localPlayer) {
      return;
    }

    for (const [userId, player] of Object.entries(state.players)) {
      if (userId === state.localPlayerId) {
        continue;
      }

      const dx = localPlayer.x - player.x;
      const dy = localPlayer.y - player.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > PROXIMITY_RADIUS) {
        sfuManager.setAudioVolume(userId, 0);
        continue;
      }

      const volume =
        distance <= FULL_VOLUME_RADIUS
          ? 1
          : 1 -
            (distance - FULL_VOLUME_RADIUS) /
              (PROXIMITY_RADIUS - FULL_VOLUME_RADIUS);

      sfuManager.setAudioVolume(userId, volume);
    }
  }
}

export const proximitySystem = new ProximitySystem();
