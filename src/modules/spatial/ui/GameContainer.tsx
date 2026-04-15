import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { useGameStore } from '@core/store/game.store';
import { OfficeScene } from '../scenes/OfficeScene';

export function GameContainer() {
  const gameContainerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  
  const currentOfficeId = useGameStore((state) => state.currentOfficeId);
  const [isEngineReady, setIsEngineReady] = useState(false);

  useEffect(() => {
    if (!gameContainerRef.current || !currentOfficeId) {
      return;
    }

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

    // Lifecycle Cleanup
    return () => {
      console.log('[GameContainer] Destroying Phaser instance...');
      window.removeEventListener('resize', handleResize);
      
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
      
      // IMPORTANT: Do NOT disconnect the socket or reset the store here!
      // React Strict Mode triggers this on mount. Tearing down global singletons
      // here causes race conditions. Disconnecting will be handled by a UI button later.
    };
  }, [currentOfficeId]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950">
      <div ref={gameContainerRef} className="absolute inset-0 z-0" />

      {isEngineReady && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-6">
           {/* Future HUD components go here */}
        </div>
      )}
      
      {!isEngineReady && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm text-white">
          <div className="flex flex-col items-center gap-4 text-slate-400">
            <span className="inline-flex h-3 w-3 animate-pulse rounded-full bg-cyan-400" />
            <p>Booting spatial environment...</p>
          </div>
        </div>
      )}
    </div>
  );
}