import { useEffect, useRef } from 'react';
import { useGameStore } from '@core/store/game.store';
import {
  buildIsoLayout,
  getIsoCanvasSize,
  zoneDiamond,
  gridToScreen,
} from '../../utils/isometric';

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

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!officeData) {
        animationFrameId = requestAnimationFrame(renderMap);
        return;
      }

      const layout = buildIsoLayout(officeData);
      const canvasSize = getIsoCanvasSize(officeData);

      // Calculate uniform scale to fit the iso canvas into the minimap
      const padding = 8;
      const usableWidth = canvas.width - padding * 2;
      const usableHeight = canvas.height - padding * 2;
      const scaleX = usableWidth / canvasSize.width;
      const scaleY = usableHeight / canvasSize.height;
      const scale = Math.min(scaleX, scaleY);

      const offsetX = (canvas.width - canvasSize.width * scale) / 2;
      const offsetY = (canvas.height - canvasSize.height * scale) / 2;

      // Helper to transform world point to minimap point
      const toMini = (sx: number, sy: number) => ({
        mx: offsetX + sx * scale,
        my: offsetY + sy * scale,
      });

      // 1. Draw zone diamonds
      zones.forEach((zone) => {
        const polygon = zoneDiamond(zone, layout);

        ctx.beginPath();
        const first = toMini(polygon[0].sx, polygon[0].sy);
        ctx.moveTo(first.mx, first.my);
        for (let i = 1; i < polygon.length; i++) {
          const pt = toMini(polygon[i].sx, polygon[i].sy);
          ctx.lineTo(pt.mx, pt.my);
        }
        ctx.closePath();

        ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      // 2. Draw players
      Object.values(players).forEach((player) => {
        const isLocal = player.userId === localPlayerId;

        // Player positions in store are screen-space for local, grid-space for remote
        // After F10 changes, store positions are screen-space for local.
        // For minimap, we need to handle both: local uses screen position, remote uses grid→screen
        let sx: number;
        let sy: number;

        if (isLocal) {
          // Local player position is already screen-space in the store
          sx = player.x;
          sy = player.y;
        } else {
          // Remote player positions are grid-space from the server
          const sp = gridToScreen(player.x, player.y, layout);
          sx = sp.sx;
          sy = sp.sy;
        }

        const { mx, my } = toMini(sx, sy);

        ctx.beginPath();
        ctx.arc(mx, my, isLocal ? 4 : 3, 0, Math.PI * 2);

        if (isLocal) {
          ctx.fillStyle = '#22d3ee';
          ctx.shadowColor = '#22d3ee';
          ctx.shadowBlur = 6;
        } else {
          ctx.fillStyle = '#94a3b8';
          ctx.shadowBlur = 0;
        }

        ctx.fill();
        ctx.shadowBlur = 0;
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
      <canvas ref={canvasRef} width={200} height={150} className="block" />
    </div>
  );
}
