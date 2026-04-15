import Phaser from 'phaser';
import { useGameStore } from '@core/store/game.store';
import { ZoneType, ZoneSnapshot } from '@core/types';
import { InputManager } from '../systems/InputManager';
import { NetworkManager } from '../systems/NetworkManager';
import { PlayerManager } from '../systems/PlayerManager';
import { socketService } from '@core/services/socket.service';

export class OfficeScene extends Phaser.Scene {
  private inputManager!: InputManager;
  private networkManager!: NetworkManager;
  private playerManager!: PlayerManager;
  private debugText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'OfficeScene' });
  }

  create() {
    const state = useGameStore.getState();
    const width = state.officeData?.width || 2000;
    const height = state.officeData?.height || 1500;

    // 1. Setup World & Camera Bounds
    this.physics.world.setBounds(0, 0, width, height);
    this.cameras.main.setBounds(0, 0, width, height);

    // 2. Draw the Floor & Zones
    const grid = this.add.grid(width / 2, height / 2, width, height, 40, 40, 0x0f172a, 1, 0x1e293b, 0.5);
    grid.setDepth(0);
    this.drawZones(state.zones);

    // 3. Initialize Subsystems
    this.inputManager = new InputManager(this);
    
    this.networkManager = new NetworkManager();
    this.networkManager.init();

    this.playerManager = new PlayerManager(this);
    this.playerManager.init();

    // 4. Attach Camera to Local Player
    if (this.playerManager.localPlayer) {
      this.cameras.main.startFollow(this.playerManager.localPlayer, true, 0.1, 0.1);
    }

    // 5. Create Debug Overlay
    this.debugText = this.add.text(16, 16, '', {
      fontSize: '14px',
      fontFamily: 'monospace',
      color: '#10b981',
      backgroundColor: '#020617d9',
      padding: { x: 12, y: 12 }
    }).setScrollFactor(0).setDepth(100);

    // 6. Cleanup listeners when the scene shuts down
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.playerManager.destroy();
      this.networkManager.destroy();
      this.inputManager.destroy();
    });
  }

  update(_time: number, delta: number) {
    const localPlayer = this.playerManager.localPlayer;
    if (!localPlayer) return;

    // Process Input and Physics
    const velocity = this.inputManager.getVelocity();
    const body = localPlayer.body as Phaser.Physics.Arcade.Body;
    if (body) {
      body.setVelocity(velocity.vx, velocity.vy);
    }

    // Emit position
    this.networkManager.emitMove(localPlayer.x, localPlayer.y);

    // Update Player Manager (Lerps remote players)
    this.playerManager.update(delta);

    // Update Debug Overlay text
    const state = useGameStore.getState();
    const playerCount = Object.keys(state.players).length;
    this.debugText.setText([
      `[ DEBUG OVERLAY ]`,
      `Connected : ${socketService.isConnected()}`,
      `Players   : ${playerCount}`,
      `Local ID  : ${state.localPlayerId}`,
      `Coords    : X:${Math.round(localPlayer.x)} Y:${Math.round(localPlayer.y)}`
    ]);
  }

  private drawZones(zones: ZoneSnapshot[]) {
    const graphics = this.add.graphics();
    graphics.setDepth(1);

    zones.forEach(zone => {
      let fillColor = 0x1e293b;
      let strokeColor = 0x334155;

      if (zone.type === ZoneType.MEETING) {
        fillColor = 0x3f1f0e;
        strokeColor = 0xf59e0b;
      } else if (zone.type === ZoneType.PRIVATE_DESK) {
        fillColor = 0x1e3a5f;
        strokeColor = 0x3b82f6;
      }

      graphics.fillStyle(fillColor, 0.6);
      graphics.lineStyle(2, strokeColor, 1);
      graphics.fillRect(zone.x, zone.y, zone.width, zone.height);
      graphics.strokeRect(zone.x, zone.y, zone.width, zone.height);

      const text = this.add.text(zone.x + 12, zone.y + 12, zone.name, {
        fontSize: '14px',
        color: '#e2e8f0',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontStyle: '600'
      });
      text.setDepth(2);
    });
  }
}