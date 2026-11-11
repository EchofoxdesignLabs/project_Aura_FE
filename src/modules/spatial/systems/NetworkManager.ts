import { socketService } from '@core/services/socket.service';
import { useGameStore } from '@core/store/game.store';
import { useMediaStore } from '@core/store/media.store';
import type { DeskGoToMineResponse, ZoneSnapshot } from '@core/types';
import { useBuilderStore } from '../../builder/state/builder.store';

interface SentPosition {
  x: number;
  y: number;
  seatId: string | null;
}

export class NetworkManager {
  private lastEmitTime = 0;
  /** The last position sent to the server; moves equal to it are not resent. */
  private lastSent: SentPosition | null = null;
  /** The newest position held back by the throttle, sent when the window ends. */
  private pendingMove: SentPosition | null = null;
  private trailingMoveTimer: number | null = null;

  // Throttle outbound movement to ~15 updates per second (1000ms / 15 ≈ 66ms)
  private readonly EMIT_INTERVAL = 66;

  /**
   * Every office:state (first join or a rejoin after reconnect) puts the
   * server's copy of us at the spawn point, so resend our real position on
   * the next frame even if we have not moved.
   */
  private readonly handleOfficeStateForMovement = (): void => {
    this.lastSent = null;
  };

  public init(): void {
    socketService.on('office:state', this.handleOfficeStateForMovement);

    // Player Events
    socketService.on('player:joined', (player) => {
      console.log('[NetworkManager] player:joined', player.userId);
      useGameStore.getState().addPlayer(player);
    });

    socketService.on('player:left', ({ userId }) => {
      console.log('[NetworkManager] player:left', userId);
      useGameStore.getState().removePlayer(userId);
    });

    socketService.on('player:moved', ({ userId, x, y, seatId }) => {
      useGameStore.getState().updatePlayerPosition(userId, x, y, seatId ?? null);
    });

    // Desk zones follow desk furniture, so placing, moving or removing a desk resends the zones.
    socketService.on('zones:updated', ({ zones }) => {
      useGameStore.getState().setZones(zones);
    });

    socketService.on('player:avatar-updated', ({ userId, avatarConfig }) => {
      console.log('[NetworkManager] player:avatar-updated', userId);
      useGameStore.getState().updatePlayerAvatar(userId, avatarConfig);
    });

    socketService.on('desk:updated', (zone) => {
      useGameStore
        .getState()
        .updateDeskAssignment(zone.id, zone.assignedUserId, zone.assignedUserName);
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

    // Furniture Sync Events
    socketService.on('furniture:placed', (item) => {
      useBuilderStore.getState().remotePlaceItem(item);
    });

    socketService.on('furniture:removed', ({ instanceId }) => {
      useBuilderStore.getState().remoteRemoveItem(instanceId);
    });

    socketService.on('furniture:moved', ({ instanceId, gridX, gridY, rotation }) => {
      useBuilderStore.getState().remoteMoveItem(instanceId, gridX, gridY, rotation);
    });
  }

  /**
   * Called every frame. Sends only when the position or seat changed, at most
   * every EMIT_INTERVAL ms, and always sends the final position after the
   * avatar stops (a throttled last step is sent when the window ends).
   */
  public emitMove(x: number, y: number, seatId: string | null = null): void {
    const latest = this.pendingMove ?? this.lastSent;
    if (latest && latest.x === x && latest.y === y && latest.seatId === seatId) {
      return;
    }

    const waitMs = this.EMIT_INTERVAL - (Date.now() - this.lastEmitTime);
    if (waitMs > 0) {
      this.pendingMove = { x, y, seatId };
      this.trailingMoveTimer ??= window.setTimeout(() => {
        this.trailingMoveTimer = null;
        const pending = this.pendingMove;
        this.pendingMove = null;
        if (pending) {
          this.sendMove(pending);
        }
      }, waitMs);
      return;
    }

    this.sendMove({ x, y, seatId });
  }

  private sendMove(position: SentPosition): void {
    this.lastEmitTime = Date.now();
    this.lastSent = position;
    socketService.emit('player:move', position);
  }

  public async assignDesk(zoneId: string, userId?: string): Promise<ZoneSnapshot> {
    const zone = await socketService.request('desk:assign', {
      zoneId,
      ...(userId ? { userId } : {}),
    });
    useGameStore.getState().updateDeskAssignment(
      zone.id,
      zone.assignedUserId,
      zone.assignedUserName,
    );
    return zone;
  }

  public async unassignDesk(zoneId: string): Promise<ZoneSnapshot> {
    const zone = await socketService.request('desk:unassign', { zoneId });
    useGameStore.getState().updateDeskAssignment(
      zone.id,
      zone.assignedUserId,
      zone.assignedUserName,
    );
    return zone;
  }

  public async goToMyDesk(): Promise<DeskGoToMineResponse> {
    const response = await socketService.request('desk:go-to-mine', {});
    useGameStore.getState().updateDeskAssignment(
      response.zone.id,
      response.zone.assignedUserId,
      response.zone.assignedUserName,
    );
    useGameStore.getState().setNavigationTarget(response.target);
    return response;
  }

  public destroy(): void {
    socketService.off('office:state', this.handleOfficeStateForMovement);
    if (this.trailingMoveTimer !== null) {
      window.clearTimeout(this.trailingMoveTimer);
      this.trailingMoveTimer = null;
    }
    this.pendingMove = null;
    this.lastSent = null;

    // Player Events
    socketService.off('player:joined');
    socketService.off('player:left');
    socketService.off('player:moved');
    socketService.off('zones:updated');
    socketService.off('desk:updated');
    
    // Zone Events
    socketService.off('zone:entered');
    socketService.off('zone:left');
    
    // Meeting Events
    socketService.off('meeting:join');
    socketService.off('meeting:peer-joined');
    socketService.off('meeting:peer-left');
    

    // Screen Share Events
    socketService.off('screenshare:start');
    socketService.off('screenshare:stop');
    socketService.off('media:state');

    // Furniture Events
    socketService.off('furniture:placed');
    socketService.off('furniture:removed');
    socketService.off('furniture:moved');
  }
}
