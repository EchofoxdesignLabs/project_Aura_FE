import { useEffect, useRef } from 'react';
import { useGameStore } from '@core/store/game.store';

export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const renderMap = () => {
      const state = useGameStore.getState();
      const { officeData, zones, players, localPlayerId } = state;

      // Clear the canvas for the next frame
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!officeData) {
        animationFrameId = requestAnimationFrame(renderMap);
        return;
      }

      // Calculate uniform scale to fit the office into the canvas
      const padding = 10;
      const usableWidth = canvas.width - padding * 2;
      const usableHeight = canvas.height - padding * 2;
      const scaleX = usableWidth / officeData.width;
      const scaleY = usableHeight / officeData.height;
      const scale = Math.min(scaleX, scaleY);

      // Center offset
      const offsetX = (canvas.width - officeData.width * scale) / 2;
      const offsetY = (canvas.height - officeData.height * scale) / 2;

      // 1. Draw Office Bounds
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        offsetX,
        offsetY,
        officeData.width * scale,
        officeData.height * scale
      );

      // 2. Draw Zones
      zones.forEach((zone) => {
        if (zone.width > 0 && zone.height > 0) {
          ctx.fillStyle = 'rgba(56, 189, 248, 0.1)'; // soft cyan
          ctx.fillRect(
            offsetX + zone.x * scale,
            offsetY + zone.y * scale,
            zone.width * scale,
            zone.height * scale
          );
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
          ctx.lineWidth = 1;
          ctx.strokeRect(
            offsetX + zone.x * scale,
            offsetY + zone.y * scale,
            zone.width * scale,
            zone.height * scale
          );
        }
      });

      // 3. Draw Players
      Object.values(players).forEach((player) => {
        const isLocal = player.userId === localPlayerId;
        const x = offsetX + player.x * scale;
        const y = offsetY + player.y * scale;

        ctx.beginPath();
        ctx.arc(x, y, isLocal ? 4 : 3, 0, Math.PI * 2);
        
        if (isLocal) {
          ctx.fillStyle = '#22d3ee'; // cyan-400 for local player
          ctx.shadowColor = '#22d3ee';
          ctx.shadowBlur = 6;
        } else {
          ctx.fillStyle = '#94a3b8'; // slate-400 for remote players
          ctx.shadowBlur = 0;
        }
        
        ctx.fill();
        ctx.shadowBlur = 0; // reset shadow for next draws
      });

      animationFrameId = requestAnimationFrame(renderMap);
    };

    renderMap();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="pointer-events-auto overflow-hidden rounded-xl border border-white/10 bg-slate-900/80 shadow-lg backdrop-blur-md">
      <canvas
        ref={canvasRef}
        width={200}
        height={150}
        className="block"
      />
    </div>
  );
}
