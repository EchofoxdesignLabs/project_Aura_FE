import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { useGameStore } from '@core/store/game.store';
import { OfficeScene } from '../scenes/OfficeScene';
import { HUD } from './HUD';

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

    return () => {
      console.log('[GameContainer] Destroying Phaser instance...');
      window.removeEventListener('resize', handleResize);
      
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [currentOfficeId]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950">
      {/* z-0: Phaser World Layer */}
      <div ref={gameContainerRef} className="absolute inset-0 z-0" />

      {/* z-10: HUD Overlay Layer */}
      {isEngineReady && <HUD />}
      
      {/* z-20: Boot Sequence Layer */}
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