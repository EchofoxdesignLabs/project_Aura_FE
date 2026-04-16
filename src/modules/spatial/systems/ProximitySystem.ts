import { useGameStore } from '@core/store/game.store';
import { webRTCManager } from '@core/services/webrtc/webrtc.manager';

const PROXIMITY_RADIUS = 300;
const FULL_VOLUME_RADIUS = 50;
const CHECK_INTERVAL = 500;

export class ProximitySystem {
  private intervalId: number | null = null;
  private connectedPeers: Set<string> = new Set();

  public start(): void {
    if (this.intervalId !== null) return;
    console.log('[ProximitySystem] Started');
    this.intervalId = window.setInterval(() => this.checkProximity(), CHECK_INTERVAL);
  }

  public stop(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[ProximitySystem] Stopped');
    }
    this.disconnectAll();
  }

  private checkProximity(): void {
    const state = useGameStore.getState();
    
    // Stop proximity checks if the user is in a meeting room
    if (state.inMeeting || !state.localPlayerId) return;

    const localPlayer = state.players[state.localPlayerId];
    if (!localPlayer) return;

    const peersInRange = new Set<string>();

    for (const [userId, player] of Object.entries(state.players)) {
      if (userId === state.localPlayerId) continue;

      const dx = localPlayer.x - player.x;
      const dy = localPlayer.y - player.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= PROXIMITY_RADIUS) {
        peersInRange.add(userId);
        
        if (!this.connectedPeers.has(userId)) {
          this.connectedPeers.add(userId);
          webRTCManager.connectToPeer(userId);
        }

        let volume = 1;
        if (distance > FULL_VOLUME_RADIUS) {
          volume = 1 - ((distance - FULL_VOLUME_RADIUS) / (PROXIMITY_RADIUS - FULL_VOLUME_RADIUS));
        }
        webRTCManager.setAudioVolume(userId, volume);
      }
    }

    for (const userId of this.connectedPeers) {
      if (!peersInRange.has(userId)) {
        this.connectedPeers.delete(userId);
        webRTCManager.disconnectPeer(userId);
      }
    }
  }

  private disconnectAll(): void {
    for (const userId of this.connectedPeers) {
      webRTCManager.disconnectPeer(userId);
    }
    this.connectedPeers.clear();
  }
}

export const proximitySystem = new ProximitySystem();