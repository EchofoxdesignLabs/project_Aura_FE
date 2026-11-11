import Phaser from 'phaser';
import { useGameStore } from '@core/store/game.store';
import { ZoneType } from '@core/types';
import type { ZoneSnapshot } from '@core/types';
import { InputManager } from '../systems/InputManager';
import { NetworkManager } from '../systems/NetworkManager';
import { PlayerManager } from '../systems/PlayerManager';
import { DepthSorter } from '../systems/DepthSorter';
import { CameraController, DRAG_THRESHOLD } from '../systems/CameraController';
import { CollisionDebugOverlay } from '../systems/CollisionDebugOverlay';
import type { CollisionGrid } from '../systems/CollisionGrid';
import { preloadOfficeMap, renderOfficeMap } from '../systems/OfficeMapRenderer';
import { AVATAR_WALK_SPEED, createAvatarAnimations, preloadAvatarSheets } from '../entities/avatar-animations';
import type { PlayerSprite } from '../entities/PlayerSprite';
import { socketService } from '@core/services/socket.service';
import {
  DEPTH,
  buildIsoLayout,
  getIsoCanvasSize,
  gridToScreen,
  zoneDiamond,
  zoneCenter,
  screenToGrid,
  snapToGrid,
  isPointInPolygon,
  type GridPoint,
  type IsoLayout,
  type ScreenPoint,
} from '../utils/isometric';
import { setDeskPanelNetworkManager } from '../utils/desk-panel-bridge';
import { FurnitureManager } from '../../builder/systems/FurnitureManager';
import { useBuilderStore } from '../../builder/state/builder.store';
import { ensureFurnitureTextures } from '../../builder/catalog/asset-loader';
import { preloadFurnitureArt } from '../../builder/catalog/furniture-art';
import { getCatalogItem } from '../../builder/catalog/default-catalog';
import {
  getCellsOccupied,
  getRotatedFootprint,
  isSurfaceItem,
  type PlacedFurnitureItem,
} from '../../builder/catalog/furniture-catalog';
import { BuilderOverlayScene } from '../../builder/scenes/BuilderOverlayScene';

/** Avatar ground radius for collision, in grid units. */
const AVATAR_RADIUS = 0.25;
/** "Go to my desk" gives up if the avatar makes no progress for this long. */
const NAV_STUCK_MS = 1500;
/** Sit once this close (grid units) to the seat's cell centre. */
const SIT_REACH = 0.3;
/** E sits on the nearest free seat within this distance (grid units). */
const SIT_KEY_RANGE = 1.6;
/** A navigation target this close to a free seat ("go to my desk") ends sitting on it. */
const SEAT_NEAR_TARGET = 1.2;
const DEFAULT_BACKGROUND = '#2b2f3a';
/** Debug panel's screen position: left edge of the HUD, under the zone badge. */
const DEBUG_PANEL_X = 16;
const DEBUG_PANEL_Y = 64;

interface NavigationState {
  target: GridPoint;
  waypoints: GridPoint[];
  lastProgressAt: number;
  bestRemaining: number;
}

export class OfficeScene extends Phaser.Scene {
  private inputManager!: InputManager;
  private networkManager!: NetworkManager;
  private playerManager!: PlayerManager;
  private furnitureManager!: FurnitureManager;
  private cameraController!: CameraController;
  private collision!: CollisionGrid;
  private collisionDebug: CollisionDebugOverlay | null = null;
  private sorter = new DepthSorter();
  private debugText!: Phaser.GameObjects.Text;
  private debugKey: Phaser.Input.Keyboard.Key | null = null;
  public isoLayout!: IsoLayout;

  /** Cached zone polygons for hover/click hit-testing. */
  private zonePolygons: { zone: ZoneSnapshot; polygon: ScreenPoint[] }[] = [];
  private zoneObjects: Phaser.GameObjects.GameObject[] = [];
  /** Labels kept at screen size whatever the zoom. */
  private screenLabels: Phaser.GameObjects.Text[] = [];
  private deskHoverGraphics!: Phaser.GameObjects.Graphics;
  private navigation: NavigationState | null = null;
  /** The seat the local player sits on, and the one it is walking to. */
  private localSeatId: string | null = null;
  private pendingSeatId: string | null = null;
  private unsubscribers: (() => void)[] = [];

  constructor() {
    super({ key: 'OfficeScene' });
  }

  preload() {
    const meta = useGameStore.getState().officeData;
    if (meta?.mapKey) preloadOfficeMap(this, meta.mapKey);
    preloadFurnitureArt(this);
    preloadAvatarSheets(this);

    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.warn(`[OfficeScene] Failed to load ${file.key} (${file.url}); using a placeholder.`);
    });
  }

  create() {
    const state = useGameStore.getState();
    const meta = state.officeData;
    if (!meta) return;

    this.isoLayout = buildIsoLayout(meta);
    const canvasSize = getIsoCanvasSize(meta);

    // 1. Art: animations from the Aseprite sheets, placeholders for furniture without a sheet.
    createAvatarAnimations(this);
    ensureFurnitureTextures(this);

    // 2. Floors and walls from the office's Tiled map, plus the wall collision grid.
    const map = renderOfficeMap(this, meta.mapKey, this.isoLayout, meta.gridWidth, meta.gridHeight, this.sorter);
    this.collision = map.collision;
    this.cameras.main.setBackgroundColor(map.backgroundColor ?? DEFAULT_BACKGROUND);
    this.collisionDebug = new CollisionDebugOverlay(this, this.collision, this.isoLayout);

    // 3. Zone overlays (labels, desk hover) — the floor art already shows the rooms.
    this.deskHoverGraphics = this.add.graphics().setDepth(DEPTH.ZONE_FILL);
    this.drawZoneOverlays(state.zones);
    this.unsubscribers.push(
      useGameStore.subscribe(
        (s) => s.zones,
        (zones) => this.drawZoneOverlays(zones),
      ),
    );

    // 4. Subsystems
    this.inputManager = new InputManager(this);

    this.networkManager = new NetworkManager();
    this.networkManager.init();
    setDeskPanelNetworkManager(this.networkManager);

    this.playerManager = new PlayerManager(this, this.isoLayout, this.sorter);
    this.playerManager.init();

    // 5. Furniture (builder system). Its layout feeds the collision grid.
    this.furnitureManager = new FurnitureManager(this, this.isoLayout, this.sorter, (items) =>
      this.updateFurnitureCollision(items),
    );
    this.furnitureManager.init();
    this.playerManager.setSeatResolver((seatId) => this.furnitureManager.getSeat(seatId));

    // 6. Builder overlay scene (starts sleeping)
    const overlayData = { isoLayout: this.isoLayout, gridCols: meta.gridWidth, gridRows: meta.gridHeight };
    if (!this.scene.get('BuilderOverlay')) {
      this.scene.add('BuilderOverlay', BuilderOverlayScene, false, overlayData);
    }
    this.scene.launch('BuilderOverlay', overlayData);

    // 7. Camera: zoom steps, centred bounds, follow the local player.
    // Left-drag pans in play mode; in edit mode the left button places furniture, so only middle-drag pans.
    this.cameraController = new CameraController(
      this,
      canvasSize.width,
      canvasSize.height,
      () => !useBuilderStore.getState().isEditMode,
    );
    const localPlayer = this.playerManager.localPlayer;
    if (localPlayer) {
      this.moveOutOfSolid(localPlayer);
      this.cameras.main.centerOn(localPlayer.x, localPlayer.y);
      this.cameraController.follow(localPlayer);
    }

    // 8. Debug overlay (F3). Visible by default in development.
    this.debugText = this.add
      .text(DEBUG_PANEL_X, DEBUG_PANEL_Y, '', {
        fontSize: '13px',
        fontFamily: 'monospace',
        color: '#10b981',
        backgroundColor: '#020617d9',
        padding: { x: 10, y: 10 },
      })
      .setScrollFactor(0)
      .setDepth(DEPTH.DEBUG)
      .setVisible(import.meta.env.DEV);
    if (this.input.keyboard) {
      this.debugKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F3, false);
      this.debugKey.on('down', () => this.debugText.setVisible(!this.debugText.visible));
      // E: sit on the nearest free seat, or stand up. Not captured, and ignored while typing.
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E, false).on('down', () => this.handleSitKey());
    }

    // 9. Pointer: desk hover/click in play mode, builder input in edit mode.
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const builderState = useBuilderStore.getState();
      if (builderState.isEditMode) {
        if (!builderState.selectedCatalogItem) {
          this.furnitureManager.handleHover(pointer.worldX, pointer.worldY);
        }
      } else {
        const overSeat = this.furnitureManager.findSeatAt(pointer.worldX, pointer.worldY) !== null;
        this.input.setDefaultCursor(overSeat ? 'pointer' : 'default');
        this.handleDeskHover(pointer.worldX, pointer.worldY);
      }
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) return; // left-click only
      if (useBuilderStore.getState().isEditMode) this.handleBuilderClick(pointer.worldX, pointer.worldY);
    });

    // Play-mode clicks act on release, and only if the press did not turn into a camera drag.
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0 || useBuilderStore.getState().isEditMode) return;
      if (pointer.getDistance() >= DRAG_THRESHOLD) return;
      // A click on a chair walks there and sits; anywhere else on a desk opens the desk panel.
      const seatId = this.furnitureManager.findSeatAt(pointer.worldX, pointer.worldY);
      if (seatId) {
        this.requestSeat(seatId);
      } else {
        this.handleDeskClick(pointer.worldX, pointer.worldY);
      }
    });

    // 10. Builder store subscriptions
    this.unsubscribers.push(
      useBuilderStore.subscribe(
        (s) => s.isEditMode,
        (isEditMode) => {
          const overlayScene = this.scene.get('BuilderOverlay') as BuilderOverlayScene | undefined;
          overlayScene?.setEditMode(isEditMode);
          if (!isEditMode) {
            this.furnitureManager.clearHighlights();
            this.furnitureManager.updateSelection(null);
          }
          this.deskHoverGraphics.clear();
        },
      ),
      // "Go to my desk" (or any navigation target) next to a free seat ends sitting on it.
      useGameStore.subscribe(
        (s) => s.navigationTarget,
        (target) => this.adoptSeatNearTarget(target),
      ),
      useBuilderStore.subscribe(
        (s) => s.selectedInstanceId,
        (selectedId) => this.furnitureManager.updateSelection(selectedId),
      ),
      useBuilderStore.subscribe(
        (s) => ({ item: s.selectedCatalogItem, rotation: s.currentRotation }),
        ({ item, rotation }) => {
          const overlayScene = this.scene.get('BuilderOverlay') as BuilderOverlayScene | undefined;
          overlayScene?.updateGhostItem(item, rotation);
        },
      ),
    );

    // 11. Cleanup when the scene shuts down or is destroyed
    let isCleanedUp = false;
    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;

      this.playerManager.destroy();
      this.networkManager.destroy();
      this.inputManager.destroy();
      this.furnitureManager.destroy();
      this.cameraController.destroy();
      this.collisionDebug?.destroy();
      this.collisionDebug = null;
      this.sorter.clear();
      this.unsubscribers.forEach((unsub) => unsub());
      this.unsubscribers = [];
      try {
        if (this.scene && this.scene.get('BuilderOverlay')) {
          this.scene.stop('BuilderOverlay');
        }
      } catch {
        // Scene manager may already be disposed
      }
    };

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
  }

  update(_time: number, delta: number) {
    const localPlayer = this.playerManager?.localPlayer;
    if (!localPlayer) return;

    if (useBuilderStore.getState().isEditMode) {
      // No walking while editing the office.
      localPlayer.setMotion(0, 0, 0);
    } else {
      this.updateLocalMovement(localPlayer, delta);
    }

    this.playerManager.update(delta);
    this.updateScreenLabels();
    this.updateDebugText(localPlayer);
  }

  // ─── Local movement ───

  private updateLocalMovement(localPlayer: PlayerSprite, delta: number): void {
    const dt = delta / 1000;
    let intent = this.inputManager.getVelocity();
    const hasInput = intent.vx !== 0 || intent.vy !== 0;

    if (this.localSeatId) {
      const seat = this.furnitureManager.getSeat(this.localSeatId);
      if (seat && !hasInput) {
        this.networkManager.emitMove(seat.gx, seat.gy, this.localSeatId);
        return;
      }
      // Walking gets you up, and so does the seat being moved away or removed.
      this.standUp(localPlayer);
    }

    const store = useGameStore.getState();
    if (hasInput) {
      // Taking the keys cancels "go to my desk" and walking to a seat.
      if (store.navigationTarget) store.setNavigationTarget(null);
      this.navigation = null;
      this.pendingSeatId = null;
    } else if (store.navigationTarget) {
      intent = this.navigationVelocity(localPlayer, store.navigationTarget, dt);
    }

    const moved = intent.vx !== 0 || intent.vy !== 0 ? this.moveLocal(localPlayer, intent.vx, intent.vy, dt) : 0;
    // Walking brings the camera back to the avatar after a pan.
    if (moved > 0) this.cameraController.resumeFollow();
    localPlayer.setMotion(intent.vx, intent.vy, dt > 0 ? moved / dt : 0);

    const gridPos = screenToGrid(localPlayer.x, localPlayer.y, this.isoLayout);
    if (moved > 0 && store.localPlayerId) {
      store.updatePlayerPosition(store.localPlayerId, gridPos.gx, gridPos.gy);
    }
    if (this.pendingSeatId && this.sitIfArrived(localPlayer, gridPos)) return;
    this.networkManager.emitMove(gridPos.gx, gridPos.gy, null);
  }

  // ─── Sitting ───

  /** Walks to a seat and sits on it (at once if already there). Ignored if someone else sits on it. */
  private requestSeat(seatId: string): void {
    const localPlayer = this.playerManager.localPlayer;
    if (!localPlayer || seatId === this.localSeatId || this.isSeatTaken(seatId)) return;
    const seat = this.furnitureManager.getSeat(seatId);
    if (!seat) return;

    if (this.localSeatId) this.standUp(localPlayer);
    const here = screenToGrid(localPlayer.x, localPlayer.y, this.isoLayout);
    this.pendingSeatId = seatId;
    if (this.sitIfArrived(localPlayer, here)) return;
    this.navigation = null;
    useGameStore.getState().setNavigationTarget({ x: seat.gx, y: seat.gy });
  }

  /** Sits on the pending seat once the avatar reaches it. Drops it if the walk was given up. */
  private sitIfArrived(localPlayer: PlayerSprite, here: GridPoint): boolean {
    const seatId = this.pendingSeatId;
    const seat = seatId ? this.furnitureManager.getSeat(seatId) : null;
    if (!seatId || !seat || this.isSeatTaken(seatId)) {
      this.pendingSeatId = null;
      return false;
    }

    if (Math.hypot(seat.gx - here.gx, seat.gy - here.gy) > SIT_REACH) {
      if (!useGameStore.getState().navigationTarget) this.pendingSeatId = null; // stuck or cancelled
      return false;
    }

    const store = useGameStore.getState();
    this.pendingSeatId = null;
    this.navigation = null;
    if (store.navigationTarget) store.setNavigationTarget(null);
    this.localSeatId = seatId;
    localPlayer.sitAt(seat.x, seat.y, seat.facing);
    if (store.localPlayerId) store.updatePlayerPosition(store.localPlayerId, seat.gx, seat.gy, seatId);
    this.networkManager.emitMove(seat.gx, seat.gy, seatId);
    return true;
  }

  /** Stands up onto the seat's cell. */
  private standUp(localPlayer: PlayerSprite): void {
    const seat = this.localSeatId ? this.furnitureManager.getSeat(this.localSeatId) : null;
    this.localSeatId = null;
    localPlayer.standUp();

    const g = seat ? { gx: seat.gx, gy: seat.gy } : screenToGrid(localPlayer.x, localPlayer.y, this.isoLayout);
    const p = gridToScreen(g.gx, g.gy, this.isoLayout);
    localPlayer.setPosition(p.sx, p.sy);
    const store = useGameStore.getState();
    if (store.localPlayerId) store.updatePlayerPosition(store.localPlayerId, g.gx, g.gy, null);
  }

  private handleSitKey(): void {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
    if (active instanceof HTMLElement && active.isContentEditable) return;
    if (useBuilderStore.getState().isEditMode) return;

    const localPlayer = this.playerManager.localPlayer;
    if (!localPlayer) return;
    if (this.localSeatId) {
      this.standUp(localPlayer);
      return;
    }
    const here = screenToGrid(localPlayer.x, localPlayer.y, this.isoLayout);
    const seatId = this.furnitureManager.findNearestSeat(here.gx, here.gy, SIT_KEY_RANGE, this.seatsTakenByOthers());
    if (seatId) this.requestSeat(seatId);
  }

  /** A new navigation target beside a free seat (go to my desk) becomes "walk there and sit". */
  private adoptSeatNearTarget(target: { x: number; y: number } | null): void {
    if (!target) return;
    if (this.pendingSeatId) {
      const pending = this.furnitureManager.getSeat(this.pendingSeatId);
      if (pending && pending.gx === target.x && pending.gy === target.y) return; // our own walk to a seat
    }
    const seatId = this.furnitureManager.findNearestSeat(
      target.x,
      target.y,
      SEAT_NEAR_TARGET,
      this.seatsTakenByOthers(),
    );
    const seat = seatId ? this.furnitureManager.getSeat(seatId) : null;
    if (!seatId || !seat) return;
    this.pendingSeatId = seatId;
    this.navigation = null;
    useGameStore.getState().setNavigationTarget({ x: seat.gx, y: seat.gy });
  }

  private seatsTakenByOthers(): Set<string> {
    const { players, localPlayerId } = useGameStore.getState();
    const taken = new Set<string>();
    for (const player of Object.values(players)) {
      if (player.userId !== localPlayerId && player.seatId) taken.add(player.seatId);
    }
    return taken;
  }

  private isSeatTaken(seatId: string): boolean {
    return this.seatsTakenByOthers().has(seatId);
  }

  /** Moves the local player by a screen velocity, resolved against walls and furniture. Returns px moved. */
  private moveLocal(localPlayer: PlayerSprite, vx: number, vy: number, dt: number): number {
    const from = screenToGrid(localPlayer.x, localPlayer.y, this.isoLayout);
    const to = screenToGrid(localPlayer.x + vx * dt, localPlayer.y + vy * dt, this.isoLayout);
    const allowed = this.collision.resolveMove(from, to, AVATAR_RADIUS);
    const next = gridToScreen(allowed.gx, allowed.gy, this.isoLayout);
    const moved = Math.hypot(next.sx - localPlayer.x, next.sy - localPlayer.y);
    localPlayer.setPosition(next.sx, next.sy);
    return moved;
  }

  /** Velocity toward the navigation target, walking around walls and furniture (A* over cells). */
  private navigationVelocity(localPlayer: PlayerSprite, target: { x: number; y: number }, dt: number) {
    const goal: GridPoint = { gx: target.x, gy: target.y };
    const here = screenToGrid(localPlayer.x, localPlayer.y, this.isoLayout);
    const now = this.time.now;

    if (!this.navigation || this.navigation.target.gx !== goal.gx || this.navigation.target.gy !== goal.gy) {
      this.navigation = {
        target: goal,
        waypoints: this.planPath(here, goal),
        lastProgressAt: now,
        bestRemaining: Infinity,
      };
    }

    const nav = this.navigation;
    while (nav.waypoints.length && Math.hypot(nav.waypoints[0].gx - here.gx, nav.waypoints[0].gy - here.gy) < 0.08) {
      nav.waypoints.shift();
    }

    const remaining = nav.waypoints.reduce(
      (acc, p, i, arr) => acc + Math.hypot(p.gx - (i ? arr[i - 1].gx : here.gx), p.gy - (i ? arr[i - 1].gy : here.gy)),
      0,
    );
    if (remaining < nav.bestRemaining - 0.01) {
      nav.bestRemaining = remaining;
      nav.lastProgressAt = now;
    }

    if (!nav.waypoints.length || now - nav.lastProgressAt > NAV_STUCK_MS) {
      useGameStore.getState().setNavigationTarget(null);
      this.navigation = null;
      return { vx: 0, vy: 0 };
    }

    const next = gridToScreen(nav.waypoints[0].gx, nav.waypoints[0].gy, this.isoLayout);
    const dx = next.sx - localPlayer.x;
    const dy = next.sy - localPlayer.y;
    const dist = Math.hypot(dx, dy);
    // Don't overshoot the last step.
    const speed = dt > 0 ? Math.min(AVATAR_WALK_SPEED, dist / dt) : AVATAR_WALK_SPEED;
    return dist > 0 ? { vx: (dx / dist) * speed, vy: (dy / dist) * speed } : { vx: 0, vy: 0 };
  }

  /** Waypoints (grid points) from `from` to `goal`: cell centres along an A* path, then the goal itself. */
  private planPath(from: GridPoint, goal: GridPoint): GridPoint[] {
    const startCell = { gx: Math.floor(from.gx), gy: Math.floor(from.gy) };
    let goalCell = { gx: Math.floor(goal.gx), gy: Math.floor(goal.gy) };
    let finalPoint = goal;
    if (this.collision.isSolid(goalCell.gx, goalCell.gy)) {
      // The anchor is on a desk: stop in the nearest free cell instead.
      const free = this.collision.nearestFreeCell(goalCell.gx, goalCell.gy);
      if (!free) return [goal];
      goalCell = free;
      finalPoint = { gx: free.gx + 0.5, gy: free.gy + 0.5 };
    }

    const cells = this.collision.findPath(startCell, goalCell);
    if (!cells) return [finalPoint]; // unreachable: walk straight and slide along whatever is in the way
    const waypoints = cells.slice(0, -1).map((c) => ({ gx: c.gx + 0.5, gy: c.gy + 0.5 }));
    waypoints.push(finalPoint);
    return waypoints;
  }

  /** If the spawn point is inside solid furniture, step to the nearest free cell. */
  private moveOutOfSolid(localPlayer: PlayerSprite): void {
    const g = screenToGrid(localPlayer.x, localPlayer.y, this.isoLayout);
    const cell = { gx: Math.floor(g.gx), gy: Math.floor(g.gy) };
    if (!this.collision.isSolid(cell.gx, cell.gy)) return;
    const free = this.collision.nearestFreeCell(cell.gx, cell.gy);
    if (!free) return;
    const p = gridToScreen(free.gx + 0.5, free.gy + 0.5, this.isoLayout);
    localPlayer.setPosition(p.sx, p.sy);
    const store = useGameStore.getState();
    if (store.localPlayerId) store.updatePlayerPosition(store.localPlayerId, free.gx + 0.5, free.gy + 0.5);
  }

  /** Solid cells = floor furniture that blocks movement. Surface items (monitors) never block. */
  private updateFurnitureCollision(items: PlacedFurnitureItem[]): void {
    const cells: GridPoint[] = [];
    for (const item of items) {
      const definition = getCatalogItem(item.catalogId);
      if (!definition?.blocksMovement || isSurfaceItem(definition)) continue;
      const footprint = getRotatedFootprint(definition.footprint, item.rotation);
      cells.push(...getCellsOccupied(item.gridX, item.gridY, footprint));
    }
    this.collision.setSolids(cells);
    this.collisionDebug?.redraw();
  }

  // ─── Zones ───

  /**
   * Meeting-room names, owners of assigned desks, and hit-test polygons. The floor art already colours the
   * rooms; free desks show up on hover (outline + DeskPanel) instead of a label each.
   */
  private drawZoneOverlays(zones: ZoneSnapshot[]): void {
    this.zoneObjects.forEach((o) => o.destroy());
    this.zoneObjects = [];
    this.screenLabels = [];
    this.zonePolygons = zones.map((zone) => ({ zone, polygon: zoneDiamond(zone, this.isoLayout) }));

    for (const zone of zones) {
      if (zone.type === ZoneType.LOBBY) continue;
      const center = zoneCenter(zone, this.isoLayout);

      if (zone.type === ZoneType.PRIVATE_DESK) {
        if (!zone.assignedUserName) continue;
        this.addScreenLabel(center.sx, center.sy - 52, zone.assignedUserName, {
          color: '#e2e8f0',
          backgroundColor: '#0f172acc',
        });
      } else {
        this.addScreenLabel(center.sx, center.sy, zone.name, {
          color: '#fde68a',
          backgroundColor: '#1f2937cc',
        });
      }
    }
  }

  private addScreenLabel(x: number, y: number, text: string, style: { color: string; backgroundColor: string }) {
    const label = this.add
      .text(x, y, text, {
        fontSize: '11px',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontStyle: '600',
        color: style.color,
        backgroundColor: style.backgroundColor,
        padding: { x: 6, y: 2 },
      })
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH.ZONE_LABEL)
      .setAlpha(0.85);
    this.zoneObjects.push(label);
    this.screenLabels.push(label);
  }

  private updateScreenLabels(): void {
    const scale = 1 / this.cameras.main.zoom;
    for (const label of this.screenLabels) label.setScale(scale);
  }

  // ─── Desk Hover/Click ───

  private findDeskAt(worldX: number, worldY: number): ZoneSnapshot | null {
    for (const { zone, polygon } of this.zonePolygons) {
      if (zone.type === ZoneType.PRIVATE_DESK && isPointInPolygon(worldX, worldY, polygon)) return zone;
    }
    return null;
  }

  private handleDeskHover(worldX: number, worldY: number) {
    const desk = this.findDeskAt(worldX, worldY);
    const store = useGameStore.getState();
    if (store.hoveredDeskZoneId === (desk?.id ?? null)) return;
    store.setHoveredDeskZoneId(desk?.id ?? null);

    this.deskHoverGraphics.clear();
    if (desk) {
      const points = zoneDiamond(desk, this.isoLayout).map((p) => new Phaser.Math.Vector2(p.sx, p.sy));
      this.deskHoverGraphics.fillStyle(0x38bdf8, 0.12);
      this.deskHoverGraphics.fillPoints(points, true);
      this.deskHoverGraphics.lineStyle(2, 0x38bdf8, 0.8);
      this.deskHoverGraphics.strokePoints(points, true);
    }
  }

  private handleDeskClick(worldX: number, worldY: number) {
    useGameStore.getState().setSelectedDeskZoneId(this.findDeskAt(worldX, worldY)?.id ?? null);
  }

  // ─── Builder Click ───

  private handleBuilderClick(worldX: number, worldY: number) {
    const builderState = useBuilderStore.getState();
    const gridPos = snapToGrid(worldX, worldY, this.isoLayout);
    const topItemId = () => builderState.getOccupancyGrid().getTopAt(gridPos.gx, gridPos.gy);

    if (builderState.isDeleteMode) {
      const instanceId = topItemId();
      if (instanceId) builderState.removeItem(instanceId);
      return;
    }

    if (builderState.selectedCatalogItem && builderState.ghostValid) {
      builderState.placeItem();
      return;
    }

    if (!builderState.selectedCatalogItem) {
      builderState.selectInstance(topItemId());
    }
  }

  // ─── Debug ───

  private updateDebugText(localPlayer: PlayerSprite) {
    if (!this.debugText.visible) return;

    // Scroll factor 0 ignores scrolling but not zoom: counter-scale so the panel stays at the top-left,
    // below the HUD's zone badge.
    const cam = this.cameras.main;
    const zoom = cam.zoom;
    this.debugText.setScale(1 / zoom);
    this.debugText.setPosition(
      cam.width / 2 + (DEBUG_PANEL_X - cam.width / 2) / zoom,
      cam.height / 2 + (DEBUG_PANEL_Y - cam.height / 2) / zoom,
    );

    const state = useGameStore.getState();
    const builderState = useBuilderStore.getState();
    const gridPos = screenToGrid(localPlayer.x, localPlayer.y, this.isoLayout);
    const lines = [
      `[ DEBUG ]  F3 hide · F2 collision`,
      `Connected : ${socketService.isConnected()}`,
      `Players   : ${Object.keys(state.players).length}`,
      `Map       : ${state.officeData?.mapKey ?? '(none)'}`,
      `Zoom      : ${zoom}×  (wheel, + / −)`,
      `Grid      : X:${gridPos.gx.toFixed(2)} Y:${gridPos.gy.toFixed(2)}`,
      `Furniture : ${builderState.placedItems.length} items`,
      `Seat      : ${this.localSeatId ? 'sitting (E or move to stand)' : 'click a chair or press E'}`,
    ];
    if (builderState.isEditMode) {
      lines.push(`Builder   : EDIT · ${builderState.placedItems.length} items · dirty ${builderState.isDirty}`);
    }
    this.debugText.setText(lines);
  }
}
