import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { useGameStore } from '@core/store/game.store';
import { useMediaStore } from '@core/store/media.store';
import { webRTCManager } from '@core/services/webrtc/webrtc.manager';
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
  const initMedia = useMediaStore((state) => state.initMedia);
  const stopMedia = useMediaStore((state) => state.stopMedia);
  
  const [isEngineReady, setIsEngineReady] = useState(false);

  useEffect(() => {
    if (!gameContainerRef.current || !currentOfficeId) {
      return;
    }
    // Initialize media FIRST, then start proximity/meeting systems.
    // If proximity starts before getUserMedia resolves, peer connections
    // are created without tracks → no audio/video is ever exchanged.
    initMedia()
      .then(() => {
        const stream = useMediaStore.getState().localStream;
        if (stream) {
          webRTCManager.setLocalStream(stream);
        }
      })
      .catch((error) => {
        console.warn('[GameContainer] Media access denied or unavailable. Office will load without voice/video.', error);
      })
      .finally(() => {
        // Start systems AFTER media resolves (or fails).
        // This guarantees localStream is set before any peer connections are created.
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
      setIsEngineReady(true);
    }

    const handleResize = () => {
      if (gameRef.current) {
        gameRef.current.scale.resize(window.innerWidth, window.innerHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      console.log('[GameContainer] Destroying Phaser instance...');
      window.removeEventListener('resize', handleResize);
      
      // Cleanup: Disconnect all peers and stop hardware tracks
      meetingSystem.destroy();
      proximitySystem.stop();
      webRTCManager.disconnectAll();
      webRTCManager.setLocalStream(null);
      stopMedia();
      
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [currentOfficeId, initMedia, stopMedia]);

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