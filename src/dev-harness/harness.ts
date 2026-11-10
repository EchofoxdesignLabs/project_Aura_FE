/* eslint-disable */
// TEMPORARY visual harness — not committed. Boots OfficeScene with the map's own zones/furniture, no backend.
import Phaser from 'phaser';
import { useGameStore } from '@core/store/game.store';
import type { PlayerState, ZoneSnapshot } from '@core/types';
import { useBuilderStore } from '../modules/builder/state/builder.store';
import { OfficeScene } from '../modules/spatial/scenes/OfficeScene';
import { assetUrl } from '@core/utils/asset-url';
import { socketService } from '@core/services/socket.service';
for (const m of ['on', 'off', 'emit']) (socketService as any)[m] = () => {};
(socketService as any).isConnected = () => false;

const q = new URLSearchParams(location.search);
const map = await (await fetch(assetUrl('assets/maps/aura-office-01.tmj'))).json();
const prop = (o: any, n: string) => o.properties?.find((p: any) => p.name === n)?.value;
const zones: ZoneSnapshot[] = map.layers.find((l: any) => l.name === 'zones').objects.map((o: any, i: number) => ({
  id: 'z' + i, name: o.name, type: prop(o, 'zoneType'), x: o.x / 32, y: o.y / 32, width: o.width / 32, height: o.height / 32,
  anchorX: prop(o, 'anchorX'), anchorY: prop(o, 'anchorY'), assignedUserId: i === 1 ? 'u9' : null, assignedUserName: i === 1 ? 'Abhijit' : null,
}));
const furniture = map.layers.find((l: any) => l.name === 'furniture').objects.map((o: any) => ({
  instanceId: 'f' + o.id, catalogId: prop(o, 'catalogId'), gridX: prop(o, 'gridX'), gridY: prop(o, 'gridY'), rotation: prop(o, 'rotation'),
}));
const mapKey = q.get('nomap') ? null : 'aura-office-01';
useGameStore.getState().setOffice({ id: 'o1', name: 'HQ', layoutMode: 'ISOMETRIC', gridWidth: 24, gridHeight: 18, tileWidth: 64, tileHeight: 32, width: 0, height: 0, mapKey } as any, zones);

const spots: Array<[string, number, number]> = (q.get('players') ?? 'Local,12.5,3.5;Behind desk,3,6.6;At chair,2.6,8.5;In conf,16,16.4;Front glass,16,17.6;Behind conf table,16.5,12.6;Huddle,18.2,8.6;By shelf,1.4,8;Behind tall plant,21.7,8.7;Lounge,19.5,4.6')
  .split(';').map((s) => { const [n, x, y] = s.split(','); return [n, +x, +y]; });
const players: PlayerState[] = spots.map(([name, x, y], i) => ({
  socketId: 's' + i, userId: 'u' + i, name, x, y, currentZoneId: null, currentZoneType: null,
  avatarConfig: { presetId: 'aura-0' + ((i % 7) + 1) } as any,
}));
useGameStore.getState().setAllPlayers(players);
useGameStore.getState().setLocalPlayerId('u0');
useBuilderStore.getState().loadLayout(furniture, 24, 18);

const game = new Phaser.Game({
  type: q.get('canvas') ? Phaser.CANVAS : Phaser.AUTO, parent: 'game', width: window.innerWidth, height: window.innerHeight,
  backgroundColor: '#2b2f3a', scene: [OfficeScene], pixelArt: true, roundPixels: true,
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
});
(window as any).game = game;
setTimeout(() => {
  const scene: any = game.scene.getScene('OfficeScene');
  const zoom = Number(q.get('zoom') ?? 1);
  const steps = [0.5, 1, 2, 3];
  const diff = steps.indexOf(zoom) - steps.indexOf(1);
  for (let i = 0; i < Math.abs(diff); i++) scene.cameraController.step(diff > 0 ? 1 : -1);
  if (q.get('collision')) scene.collisionDebug.toggle();
  if (q.get('nodebug')) scene.debugText.setVisible(false);
  if (q.get('focus')) { const [x, y] = q.get('focus')!.split(',').map(Number); scene.cameras.main.stopFollow(); const p = { x: (x - y) * 32 + 18 * 32 + 32, y: (x + y) * 16 + 160 }; scene.cameras.main.centerOn(p.x, p.y); }
  if (q.get('edit')) useBuilderStore.getState().enterEditMode();
}, 500);
if (q.get('dirs')) setTimeout(() => {
  const scene: any = game.scene.getScene('OfficeScene');
  const v: Record<string, [number, number]> = { s: [0, 1], se: [2, 1], e: [1, 0], ne: [2, -1], n: [0, -1], nw: [-2, -1], w: [-1, 0], sw: [-2, 1] };
  const sprites = [...scene.playerManager.sprites.values()];
  const names = Object.keys(v);
  scene.events.on('postupdate', () => sprites.forEach((s: any, i: number) => { const d = v[names[i % 8]]; s.setMotion(d[0], d[1], q.get('dirs') === 'walk' ? 200 : 0); }));
}, 600);
