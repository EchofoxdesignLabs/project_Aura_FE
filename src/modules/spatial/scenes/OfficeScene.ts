import Phaser from 'phaser';
import { useGameStore } from '@core/store/game.store';
import { ZoneType } from '@core/types';
import type { ZoneSnapshot } from '@core/types';
import { InputManager } from '../systems/InputManager';
import { NetworkManager } from '../systems/NetworkManager';
import { PlayerManager } from '../systems/PlayerManager';
import { socketService } from '@core/services/socket.service';
import {
  buildIsoLayout,
  getIsoCanvasSize,
  gridToScreen,
  tileDiamond,
  zoneDiamond,
  zoneCenter,
  screenToGrid,
  snapToGrid,
  isPointInPolygon,
  type IsoLayout,
  type ScreenPoint,
} from '../utils/isometric';
import { setDeskPanelNetworkManager } from '../utils/desk-panel-bridge';
import { FurnitureManager } from '../../builder/systems/FurnitureManager';
import { useBuilderStore } from '../../builder/state/builder.store';
import { ensureFurnitureTextures } from '../../builder/catalog/asset-loader';
import { BuilderOverlayScene } from '../../builder/scenes/BuilderOverlayScene';

export class OfficeScene extends Phaser.Scene {
  private inputManager!: InputManager;
  private networkManager!: NetworkManager;
  private playerManager!: PlayerManager;
  private furnitureManager!: FurnitureManager;
  private debugText!: Phaser.GameObjects.Text;
  public isoLayout!: IsoLayout;
  /** Cached zone polygons for hover/click hit-testing. */
  private zonePolygons: { zone: ZoneSnapshot; polygon: ScreenPoint[] }[] = [];
  /** Unsubscribe from builder store changes. */
  private unsubBuilder: (() => void)[] = [];

  constructor() {
    super({ key: 'OfficeScene' });
  }

  create() {
    const state = useGameStore.getState();
    const meta = state.officeData;
    if (!meta) return;

    // Build isometric layout from office metadata
    this.isoLayout = buildIsoLayout(meta);
    const canvasSize = getIsoCanvasSize(meta);

    // 1. Setup World & Camera Bounds
    this.physics.world.setBounds(0, 0, canvasSize.width, canvasSize.height);
    this.cameras.main.setBounds(0, 0, canvasSize.width, canvasSize.height);

    // 2. Generate placeholder furniture textures (canvas-based)
    ensureFurnitureTextures(this, meta.tileWidth, meta.tileHeight);

    // 3. Draw isometric floor tiles
    this.drawIsoFloor(meta.gridWidth, meta.gridHeight);

    // 4. Draw zones as isometric diamond polygons
    this.drawIsoZones(state.zones);

    // 5. Initialize Subsystems
    this.inputManager = new InputManager(this);

    this.networkManager = new NetworkManager();
    this.networkManager.init();
    setDeskPanelNetworkManager(this.networkManager);

    this.playerManager = new PlayerManager(this);
    this.playerManager.init();

    // 6. Initialize Furniture Manager (builder system)
    this.furnitureManager = new FurnitureManager(this, this.isoLayout);
    this.furnitureManager.init();

    // 7. Launch the builder overlay scene (starts sleeping)
    if (!this.scene.get('BuilderOverlay')) {
      this.scene.add('BuilderOverlay', BuilderOverlayScene, false, {
        isoLayout: this.isoLayout,
        gridCols: meta.gridWidth,
        gridRows: meta.gridHeight,
      });
    }
    this.scene.launch('BuilderOverlay', {
      isoLayout: this.isoLayout,
      gridCols: meta.gridWidth,
      gridRows: meta.gridHeight,
    });

    // 8. Attach Camera to Local Player
    if (this.playerManager.localPlayer) {
      this.cameras.main.startFollow(this.playerManager.localPlayer, true, 0.1, 0.1);
    }

    // 9. Create Debug Overlay
    this.debugText = this.add
      .text(16, 16, '', {
        fontSize: '14px',
        fontFamily: 'monospace',
        color: '#10b981',
        backgroundColor: '#020617d9',
        padding: { x: 12, y: 12 },
      })
      .setScrollFactor(0)
      .setDepth(1000);

    // 10. Setup desk hover/click detection + builder input
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const worldX = pointer.worldX;
      const worldY = pointer.worldY;

      const builderState = useBuilderStore.getState();
      if (builderState.isEditMode) {
        // In edit mode: handle furniture hover
        if (!builderState.selectedCatalogItem) {
          this.furnitureManager.handleHover(worldX, worldY);
        }
      } else {
        // In play mode: handle desk hover
        this.handleDeskHover(worldX, worldY);
      }
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button !== 0) return; // left-click only
      const worldX = pointer.worldX;
      const worldY = pointer.worldY;

      const builderState = useBuilderStore.getState();
      if (builderState.isEditMode) {
        this.handleBuilderClick(worldX, worldY);
      } else {
        this.handleDeskClick(worldX, worldY);
      }
    });

    // 11. Subscribe to builder edit-mode changes
    this.unsubBuilder.push(
      useBuilderStore.subscribe(
        (s) => s.isEditMode,
        (isEditMode) => {
          const overlayScene = this.scene.get('BuilderOverlay') as BuilderOverlayScene | undefined;
          if (overlayScene) {
            overlayScene.setEditMode(isEditMode);
          }
          if (!isEditMode) {
            this.furnitureManager.clearHighlights();
            this.furnitureManager.updateSelection(null);
          }
        },
      )
    );

    // Subscribe to builder selection changes for furniture highlighting
    this.unsubBuilder.push(
      useBuilderStore.subscribe(
        (s) => s.selectedInstanceId,
        (selectedId) => {
          this.furnitureManager.updateSelection(selectedId);
        },
      )
    );

    // Subscribe to selected catalog item changes for ghost sprite
    this.unsubBuilder.push(
      useBuilderStore.subscribe(
        (s) => ({ item: s.selectedCatalogItem, rotation: s.currentRotation }),
        ({ item, rotation }) => {
          const overlayScene = this.scene.get('BuilderOverlay') as BuilderOverlayScene | undefined;
          if (overlayScene) {
            overlayScene.updateGhostItem(item, rotation);
          }
        },
      )
    );

    // 12. Cleanup listeners when the scene shuts down or is destroyed
    let isCleanedUp = false;
    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;

      this.playerManager.destroy();
      this.networkManager.destroy();
      this.inputManager.destroy();
      this.furnitureManager.destroy();
      this.unsubBuilder.forEach((unsub) => unsub());
      this.unsubBuilder = [];
      // Stop builder overlay scene if scene manager is active
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
    const localPlayer = this.playerManager.localPlayer;
    if (!localPlayer) return;

    // In edit mode, suppress player movement
    const builderState = useBuilderStore.getState();
    if (builderState.isEditMode) {
      const body = localPlayer.body as Phaser.Physics.Arcade.Body;
      if (body) body.setVelocity(0, 0);
      this.updateDebugText(localPlayer);
      return;
    }

    // Process Input — get logical grid-space velocity
    const velocity = this.inputManager.getVelocity();

    // Check navigation target for "Go to my desk"
    const navTarget = useGameStore.getState().navigationTarget;
    if (navTarget) {
      const screenTarget = gridToScreen(navTarget.x, navTarget.y, this.isoLayout);
      const dx = screenTarget.sx - localPlayer.x;
      const dy = screenTarget.sy - localPlayer.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 8) {
        // Arrived at desk
        useGameStore.getState().setNavigationTarget(null);
        const body = localPlayer.body as Phaser.Physics.Arcade.Body;
        if (body) body.setVelocity(0, 0);
      } else {
        // Auto-walk toward target
        const speed = 200;
        const body = localPlayer.body as Phaser.Physics.Arcade.Body;
        if (body) {
          body.setVelocity((dx / dist) * speed, (dy / dist) * speed);
        }

        // Sync position to store & emit
        const state = useGameStore.getState();
        if (state.localPlayerId) {
          // Convert screen position back to grid for store and network emit
          const gridPos = screenToGrid(localPlayer.x, localPlayer.y, this.isoLayout);
          state.updatePlayerPosition(state.localPlayerId, gridPos.gx, gridPos.gy);
          this.networkManager.emitMove(gridPos.gx, gridPos.gy);
        }

        this.playerManager.update(delta);
        this.updateDebugText(localPlayer);
        return;
      }
    }

    // Normal WASD/arrow movement in screen space
    const body = localPlayer.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setVelocity(velocity.vx, velocity.vy);

      if (velocity.vx !== 0 || velocity.vy !== 0) {
        const state = useGameStore.getState();
        if (state.localPlayerId) {
          const gridPos = screenToGrid(localPlayer.x, localPlayer.y, this.isoLayout);
          state.updatePlayerPosition(state.localPlayerId, gridPos.gx, gridPos.gy);
        }
      }
    }

    // Emit position in grid coordinates
    const gridPos = screenToGrid(localPlayer.x, localPlayer.y, this.isoLayout);
    this.networkManager.emitMove(gridPos.gx, gridPos.gy);

    // Update Player Manager (Lerps remote players)
    this.playerManager.update(delta);
    this.updateDebugText(localPlayer);
  }

  // ─── Isometric Floor ───

  private drawIsoFloor(gridW: number, gridH: number) {
    const graphics = this.add.graphics();
    graphics.setDepth(0);

    for (let gx = 0; gx < gridW; gx++) {
      for (let gy = 0; gy < gridH; gy++) {
        const diamond = tileDiamond(gx, gy, this.isoLayout);
        const isEven = (gx + gy) % 2 === 0;

        graphics.fillStyle(isEven ? 0x0f172a : 0x111b2e, 1);
        graphics.lineStyle(1, 0x1e293b, 0.4);

        graphics.beginPath();
        graphics.moveTo(diamond[0].sx, diamond[0].sy);
        for (let i = 1; i < diamond.length; i++) {
          graphics.lineTo(diamond[i].sx, diamond[i].sy);
        }
        graphics.closePath();
        graphics.fillPath();
        graphics.strokePath();
      }
    }
  }

  // ─── Isometric Zones ───

  private drawIsoZones(zones: ZoneSnapshot[]) {
    this.zonePolygons = [];

    // Sort: LOBBY renders first (background), sub-zones render on top
    const sortedZones = [...zones].sort((a, b) => {
      if (a.type === ZoneType.LOBBY && b.type !== ZoneType.LOBBY) return -1;
      if (a.type !== ZoneType.LOBBY && b.type === ZoneType.LOBBY) return 1;
      return 0;
    });

    sortedZones.forEach((zone) => {
      // Each zone gets its own graphics object so depth layering works
      const graphics = this.add.graphics();
      graphics.setDepth(zone.type === ZoneType.LOBBY ? 1 : 3);

      let fillColor = 0x1e293b;
      let strokeColor = 0x475569;
      let fillAlpha = 0.6;
      let strokeWidth = 2;

      if (zone.type === ZoneType.MEETING) {
        fillColor = 0x451a03;
        strokeColor = 0xf59e0b;
        fillAlpha = 0.7;
        strokeWidth = 3;
      } else if (zone.type === ZoneType.PRIVATE_DESK) {
        fillColor = 0x0c3547;
        strokeColor = 0x3b82f6;
        fillAlpha = 0.75;
        strokeWidth = 2;
      } else if (zone.type === ZoneType.LOBBY) {
        fillColor = 0x0f1b2d;
        strokeColor = 0x22d3ee;
        fillAlpha = 0.2;
        strokeWidth = 2;
      } else if (zone.type === ZoneType.FOCUS) {
        fillColor = 0x14291a;
        strokeColor = 0x22c55e;
        fillAlpha = 0.65;
        strokeWidth = 2;
      }

      const polygon = zoneDiamond(zone, this.isoLayout);
      this.zonePolygons.push({ zone, polygon });

      // Fill
      graphics.fillStyle(fillColor, fillAlpha);
      graphics.beginPath();
      graphics.moveTo(polygon[0].sx, polygon[0].sy);
      for (let i = 1; i < polygon.length; i++) {
        graphics.lineTo(polygon[i].sx, polygon[i].sy);
      }
      graphics.closePath();
      graphics.fillPath();

      // Stroke
      graphics.lineStyle(strokeWidth, strokeColor, 0.9);
      graphics.beginPath();
      graphics.moveTo(polygon[0].sx, polygon[0].sy);
      for (let i = 1; i < polygon.length; i++) {
        graphics.lineTo(polygon[i].sx, polygon[i].sy);
      }
      graphics.closePath();
      graphics.strokePath();

      // Inner accent line for non-lobby zones
      if (zone.type !== ZoneType.LOBBY) {
        const cx = polygon.reduce((s, p) => s + p.sx, 0) / 4;
        const cy = polygon.reduce((s, p) => s + p.sy, 0) / 4;
        graphics.lineStyle(1, strokeColor, 0.3);
        graphics.beginPath();
        polygon.forEach((p, i) => {
          const dx = p.sx - cx;
          const dy = p.sy - cy;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const inset = 4;
          const nx = p.sx - (dx / len) * inset;
          const ny = p.sy - (dy / len) * inset;
          if (i === 0) graphics.moveTo(nx, ny);
          else graphics.lineTo(nx, ny);
        });
        graphics.closePath();
        graphics.strokePath();
      }

      // Zone label
      const center = zoneCenter(zone, this.isoLayout);
      const labelDepth = zone.type === ZoneType.LOBBY ? 2 : 4;
      const labelColor =
        zone.type === ZoneType.MEETING ? '#fbbf24' :
        zone.type === ZoneType.PRIVATE_DESK ? '#60a5fa' :
        '#e2e8f0';

      const nameText = this.add.text(center.sx, center.sy - 10, zone.name, {
        fontSize: zone.type === ZoneType.LOBBY ? '14px' : '12px',
        color: labelColor,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontStyle: '600',
        stroke: '#020617',
        strokeThickness: 4,
      });
      nameText.setOrigin(0.5, 0.5);
      nameText.setDepth(labelDepth);

      // Desk sub-label
      if (zone.type === ZoneType.PRIVATE_DESK) {
        const subLabel = zone.assignedUserName || 'Available';
        const subColor = zone.assignedUserName ? '#94a3b8' : '#64748b';
        const sub = this.add.text(center.sx, center.sy + 6, subLabel, {
          fontSize: '10px',
          color: subColor,
          fontFamily: 'Inter, system-ui, sans-serif',
          stroke: '#020617',
          strokeThickness: 3,
        });
        sub.setOrigin(0.5, 0.5);
        sub.setDepth(labelDepth);
      }

      // Meeting room type indicator
      if (zone.type === ZoneType.MEETING) {
        const sub = this.add.text(center.sx, center.sy + 8, 'Meeting', {
          fontSize: '10px',
          color: '#fbbf24',
          fontFamily: 'Inter, system-ui, sans-serif',
          stroke: '#020617',
          strokeThickness: 3,
        });
        sub.setOrigin(0.5, 0.5);
        sub.setDepth(labelDepth);
      }
    });
  }

  // ─── Desk Hover/Click (F13) ───

  private handleDeskHover(worldX: number, worldY: number) {
    let foundZoneId: string | null = null;

    for (const { zone, polygon } of this.zonePolygons) {
      if (zone.type === ZoneType.PRIVATE_DESK && isPointInPolygon(worldX, worldY, polygon)) {
        foundZoneId = zone.id;
        break;
      }
    }

    const current = useGameStore.getState().hoveredDeskZoneId;
    if (current !== foundZoneId) {
      useGameStore.getState().setHoveredDeskZoneId(foundZoneId);
    }
  }

  private handleDeskClick(worldX: number, worldY: number) {
    for (const { zone, polygon } of this.zonePolygons) {
      if (zone.type === ZoneType.PRIVATE_DESK && isPointInPolygon(worldX, worldY, polygon)) {
        useGameStore.getState().setSelectedDeskZoneId(zone.id);
        return;
      }
    }
    // Clicked outside any desk — deselect
    useGameStore.getState().setSelectedDeskZoneId(null);
  }

  // ─── Builder Click ───

  private handleBuilderClick(worldX: number, worldY: number) {
    const builderState = useBuilderStore.getState();

    if (builderState.isDeleteMode) {
      // Delete mode: click to remove the item under cursor
      const gridPos = snapToGrid(worldX, worldY, this.isoLayout);
      const grid = builderState.getOccupancyGrid();
      const instanceId = grid.getAt(gridPos.gx, gridPos.gy);
      if (instanceId) {
        builderState.removeItem(instanceId);
      }
      return;
    }

    if (builderState.selectedCatalogItem && builderState.ghostValid) {
      // Place mode: place the selected item at the ghost position
      builderState.placeItem();
      return;
    }

    if (!builderState.selectedCatalogItem) {
      // No item selected: click to select an existing item
      const gridPos = snapToGrid(worldX, worldY, this.isoLayout);
      const grid = builderState.getOccupancyGrid();
      const instanceId = grid.getAt(gridPos.gx, gridPos.gy);
      builderState.selectInstance(instanceId);
    }
  }

  // ─── Debug ───

  private updateDebugText(localPlayer: Phaser.GameObjects.Container) {
    const state = useGameStore.getState();
    const builderState = useBuilderStore.getState();
    const playerCount = Object.keys(state.players).length;
    const gridPos = screenToGrid(localPlayer.x, localPlayer.y, this.isoLayout);
    const lines = [
      `[ DEBUG OVERLAY ]`,
      `Connected : ${socketService.isConnected()}`,
      `Players   : ${playerCount}`,
      `Local ID  : ${state.localPlayerId}`,
      `Screen    : X:${Math.round(localPlayer.x)} Y:${Math.round(localPlayer.y)}`,
      `Grid      : X:${gridPos.gx.toFixed(1)} Y:${gridPos.gy.toFixed(1)}`,
    ];
    if (builderState.isEditMode) {
      lines.push(
        `[ BUILDER ]`,
        `Mode      : EDIT`,
        `Items     : ${builderState.placedItems.length}`,
        `Dirty     : ${builderState.isDirty}`,
      );
    }
    this.debugText.setText(lines);
  }
}