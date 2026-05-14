import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { useGameStore } from '@core/store/game.store';
import { useMediaStore } from '@core/store/media.store';
import { socketService } from '@core/services/socket.service';
import { sfuManager } from '@core/services/sfu/sfu.manager';
import type { OfficeStatePayload } from '@core/types';
import { OfficeScene } from '../scenes/OfficeScene';
import { HUD } from './HUD';
import { ProximityIndicator } from './ProximityIndicator';
import { MeetingOverlay } from './MeetingOverlay';
import { proximitySystem } from '../systems/ProximitySystem';
import { meetingSystem } from '../systems/MeetingSystem';

export function GameContainer() {
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  
  const currentOfficeId = useGameStore((state) => state.currentOfficeId);
  const setConnectionStatus = useGameStore((state) => state.setConnectionStatus);
  const initMedia = useMediaStore((state) => state.initMedia);
  const stopMedia = useMediaStore((state) => state.stopMedia);
  
  const [isEngineReady, setIsEngineReady] = useState(false);

  useEffect(() => {
    if (!gameContainerRef.current || !currentOfficeId) {
      return;
    }
    let isMounted = true;
    let clearPendingOfficeStateListener: (() => void) | null = null;

    const clearPendingOfficeState = () => {
      if (!clearPendingOfficeStateListener) {
        return;
      }

      clearPendingOfficeStateListener();
      clearPendingOfficeStateListener = null;
    };

    const resyncOfficeState = () => {
      const officeId = useGameStore.getState().currentOfficeId;
      if (!officeId || !socketService.isConnected()) {
        return;
      }

      clearPendingOfficeState();
      useGameStore.getState().setConnectionStatus('reconnecting');

      const timeout = window.setTimeout(() => {
        socketService.off('office:state', handleOfficeState);
        clearPendingOfficeStateListener = null;
      }, 10000);

      const handleOfficeState = (state: OfficeStatePayload) => {
        window.clearTimeout(timeout);
        socketService.off('office:state', handleOfficeState);
        clearPendingOfficeStateListener = null;

        const gameStore = useGameStore.getState();
        gameStore.setOffice(state.office, state.zones);
        gameStore.setAllPlayers(state.players);
        gameStore.setConnectionStatus('connected');
      };

      clearPendingOfficeStateListener = () => {
        window.clearTimeout(timeout);
        try {
          socketService.off('office:state', handleOfficeState);
        } catch {
          // Socket may already be fully torn down during app logout.
        }
      };

      socketService.on('office:state', handleOfficeState);
      socketService.emit('office:join', { officeId });
    };

    const heartbeatId = window.setInterval(() => {
      if (!socketService.isConnected()) {
        return;
      }

      try {
        socketService.emit('presence:heartbeat');
      } catch (error) {
        console.warn('[GameContainer] Presence heartbeat failed:', error);
      }
    }, 15000);

    setConnectionStatus(socketService.isConnected() ? 'connected' : 'reconnecting');

    const stopConnectListener = socketService.onConnect(() => {
      if (!isMounted) {
        return;
      }

      resyncOfficeState();
    });

    const stopDisconnectListener = socketService.onDisconnect((reason) => {
      if (!isMounted) {
        return;
      }

      useGameStore
        .getState()
        .setConnectionStatus(reason === 'io client disconnect' ? 'disconnected' : 'reconnecting');
    });

    const stopErrorListener = socketService.onError(() => {
      if (!isMounted) {
        return;
      }

      useGameStore.getState().setConnectionStatus('reconnecting');
    });

    // Initialize media hardware and SFU in parallel.
    // Media MUST initialize even if SFU fails — so users can at least toggle their camera/mic.
    // SFU producers are started only after BOTH succeed.
    const mediaReady = initMedia().catch((err) => {
      console.warn('[GameContainer] Media access denied. Camera/mic won\'t be available:', err);
    });

    const sfuReady = sfuManager.initialize().catch((err) => {
      console.warn('[GameContainer] SFU setup failed. Voice/video won\'t relay to others:', err);
    });

    Promise.all([mediaReady, sfuReady])
      .then(async () => {
        if (!isMounted) return;
        const stream = useMediaStore.getState().localStream;
        const sfuOk = sfuManager['device']?.loaded;
        if (!sfuOk || !stream) return;

        // Start mic producer if audio track available
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack && audioTrack.readyState !== 'ended') {
          await sfuManager.startMicProducer(audioTrack);
        }

        // Start camera producer if video track available
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack && videoTrack.readyState !== 'ended') {
          await sfuManager.startCameraProducer(videoTrack);
        }
      })
      .catch((error) => {
        if (!isMounted) return;
        console.warn('[GameContainer] Producer setup failed:', error);
      })
      .finally(() => {
        if (!isMounted) return;
        meetingSystem.init();
        proximitySystem.start();
      });

    // Boot the spatial engine
    if (!gameRef.current) {
      console.log('[GameContainer] Booting spatial engine...');
      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        parent: gameContainerRef.current,
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: '#020617', // slate-950
        scene: [OfficeScene],
        physics: {
          default: 'arcade',
          arcade: { gravity: { x: 0, y: 0 } },
        },
        scale: {
          mode: Phaser.Scale.RESIZE,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
      };
      
      gameRef.current = new Phaser.Game(config);
      queueMicrotask(() => setIsEngineReady(true));
    }

    const handleResize = () => {
      if (gameRef.current) {
        gameRef.current.scale.resize(window.innerWidth, window.innerHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      console.log('[GameContainer] Destroying Phaser instance...');
      isMounted = false;
      window.clearInterval(heartbeatId);
      clearPendingOfficeState();
      stopConnectListener();
      stopDisconnectListener();
      stopErrorListener();
      window.removeEventListener('resize', handleResize);
      
      // Cleanup: Disconnect all peers and stop hardware tracks
      meetingSystem.destroy();
      proximitySystem.stop();
      sfuManager.destroy();
      stopMedia();
      
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [currentOfficeId, initMedia, setConnectionStatus, stopMedia]);

  // NOTE: Phaser keyboard input is NEVER disabled.
  // Users must be able to walk freely inside meeting zones (like Gather).
  // They leave the meeting by walking out of the zone.

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950">
      {/* z-0: Phaser World Layer */}
      <div ref={gameContainerRef} className="absolute inset-0 z-0" />

      {/* z-10: HUD Overlay Layer (always visible) */}
      {isEngineReady && <HUD />}

      {/* z-20: Proximity video bubbles (shown when NOT in meeting) */}
      {isEngineReady && <ProximityIndicator />}

      {/* z-20: Meeting video strip (shown when IN meeting) */}
      {isEngineReady && <MeetingOverlay />}
      
      {/* z-40: Boot Sequence Layer */}
      {!isEngineReady && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/80 text-white backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 text-slate-400">
            <span className="inline-flex h-3 w-3 animate-pulse rounded-full bg-cyan-400" />
            <p>Booting spatial environment...</p>
          </div>
        </div>
      )}
    </div>
  );
}
