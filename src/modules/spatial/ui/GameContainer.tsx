import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { useGameStore } from '@core/store/game.store';
import { useMediaStore } from '@core/store/media.store';
import { sfuManager } from '@core/services/sfu/sfu.manager';
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
    let isMounted = true;

    // Initialize SFU connection FIRST, then request media.
    // This ensures even users without mics (or who deny access) can hear others.
    sfuManager.initialize()
      .then(() => initMedia())
      .then(async () => {
        if (!isMounted) return;
        const stream = useMediaStore.getState().localStream;

        // Start mic producer if audio track available
        const audioTrack = stream?.getAudioTracks()[0];
        if (audioTrack && audioTrack.readyState !== 'ended') {
          await sfuManager.startMicProducer(audioTrack);
        }

        // Start camera producer if video track available
        const videoTrack = stream?.getVideoTracks()[0];
        if (videoTrack && videoTrack.readyState !== 'ended') {
          await sfuManager.startCameraProducer(videoTrack);
        }
      })
      .catch((error) => {
        if (!isMounted) return;
        console.warn('[GameContainer] Media access denied or SFU setup failed. Office will load without voice.', error);
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
