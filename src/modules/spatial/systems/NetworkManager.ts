import { socketService } from '@core/services/socket.service';
import { useGameStore } from '@core/store/game.store';
import { useMediaStore } from '@core/store/media.store';
import { webRTCManager } from '@core/services/webrtc/webrtc.manager';

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
      const state = useGameStore.getState();
      // The backend does not emit a dedicated meeting:leave event to the leaving client.
      // It only sends zone:left + meeting:peer-left to other participants.
      // So we must detect and exit meeting mode here.
      if (state.inMeeting) {
        state.leaveMeeting();
      }
      state.setCurrentZone(null);
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

    // Phase 10: WebRTC Signaling Events
    socketService.on('signal:offer', ({ fromUserId, offer }) => {
      webRTCManager.handleOffer(fromUserId, offer);
    });

    socketService.on('signal:answer', ({ fromUserId, answer }) => {
      webRTCManager.handleAnswer(fromUserId, answer);
    });

    socketService.on('signal:ice-candidate', ({ fromUserId, candidate }) => {
      webRTCManager.handleIceCandidate(fromUserId, candidate);
    });

    // Screen Share Events
    socketService.on('screenshare:start', ({ userId }) => {
      console.log('[NetworkManager] screenshare:start', userId);
      useMediaStore.getState().addScreenSharingUser(userId);
    });

    socketService.on('screenshare:stop', ({ userId }) => {
      console.log('[NetworkManager] screenshare:stop', userId);
      useMediaStore.getState().removeScreenSharingUser(userId);
    });

    // Peer Media State Sync
    socketService.on('media:state', ({ userId, state }) => {
      useMediaStore.getState().updatePeerMediaState(userId, state);
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
    // Player Events
    socketService.off('player:joined');
    socketService.off('player:left');
    socketService.off('player:moved');
    
    // Zone Events
    socketService.off('zone:entered');
    socketService.off('zone:left');
    
    // Meeting Events
    socketService.off('meeting:join');
    socketService.off('meeting:peer-joined');
    socketService.off('meeting:peer-left');
    
    // Phase 10: Cleanup Signaling Events
    socketService.off('signal:offer');
    socketService.off('signal:answer');
    socketService.off('signal:ice-candidate');

    // Screen Share Events
    socketService.off('screenshare:start');
    socketService.off('screenshare:stop');
  }
}