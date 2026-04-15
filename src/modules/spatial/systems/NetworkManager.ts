import { socketService } from '@core/services/socket.service';
import { useGameStore } from '@core/store/game.store';

export class NetworkManager {
  private lastEmitTime = 0;
  
  // Throttle outbound movement to ~15 updates per second (1000ms / 15 ≈ 66ms)
  private readonly EMIT_INTERVAL = 66;

  public init(): void {
    // Player Events
    socketService.on('player:joined', (player) => {
      console.log('[NetworkManager] player:joined', player.userId);
      useGameStore.getState().addPlayer(player);
    });

    socketService.on('player:left', ({ userId }) => {
      console.log('[NetworkManager] player:left', userId);
      useGameStore.getState().removePlayer(userId);
    });

    socketService.on('player:moved', ({ userId, x, y }) => {
      useGameStore.getState().updatePlayerPosition(userId, x, y);
    });

    // Zone Events
    socketService.on('zone:entered', (payload) => {
      useGameStore.getState().setCurrentZone({
        id: payload.zoneId,
        name: payload.zoneName,
        type: payload.zoneType
      });
    });

    socketService.on('zone:left', () => {
      useGameStore.getState().setCurrentZone(null);
    });

    // Meeting Events
    socketService.on('meeting:join', ({ zoneId, participants }) => {
      useGameStore.getState().enterMeeting(zoneId, participants);
    });

    socketService.on('meeting:peer-joined', ({ userId }) => {
      useGameStore.getState().addMeetingParticipant(userId);
    });

    socketService.on('meeting:peer-left', ({ userId }) => {
      useGameStore.getState().removeMeetingParticipant(userId);
    });
  }

  public emitMove(x: number, y: number): void {
    const now = Date.now();
    if (now - this.lastEmitTime < this.EMIT_INTERVAL) {
      return;
    }
    
    this.lastEmitTime = now;
    socketService.emit('player:move', { x, y });
  }

  public destroy(): void {
    socketService.off('player:joined');
    socketService.off('player:left');
    socketService.off('player:moved');
    socketService.off('zone:entered');
    socketService.off('zone:left');
    socketService.off('meeting:join');
    socketService.off('meeting:peer-joined');
    socketService.off('meeting:peer-left');
  }
}