import Phaser from 'phaser';
import { useGameStore } from '@core/store/game.store';
import { PlayerSprite } from '../entities/PlayerSprite';
import { gridToScreen, screenToGrid, type IsoLayout } from '../utils/isometric';
import type { AvatarConfig } from '@core/types';
import type { DepthSorter } from './DepthSorter';

export class PlayerManager {
  private scene: Phaser.Scene;
  private layout: IsoLayout;
  private sorter: DepthSorter;
  public sprites: Map<string, PlayerSprite> = new Map();
  public localPlayer: PlayerSprite | null = null;
  private unsubPlayers!: () => void;

  constructor(scene: Phaser.Scene, layout: IsoLayout, sorter: DepthSorter) {
    this.scene = scene;
    this.layout = layout;
    this.sorter = sorter;
  }

  public init(): void {
    const state = useGameStore.getState();
    const localId = state.localPlayerId;

    // 1. Spawn initial players from the snapshot (grid → screen).
    Object.values(state.players).forEach((player) => {
      const sp = gridToScreen(player.x, player.y, this.layout);
      this.spawnPlayer(player.userId, player.name, sp.sx, sp.sy, player.userId === localId, player.avatarConfig);
    });

    // 2. Follow store changes.
    this.unsubPlayers = useGameStore.subscribe(
      (currentState) => currentState.players,
      (newPlayers, prevPlayers) => {
        const currentLocalId = useGameStore.getState().localPlayerId;

        Object.values(newPlayers).forEach((p) => {
          const sprite = this.sprites.get(p.userId);
          if (sprite && p.avatarConfig && prevPlayers[p.userId]?.avatarConfig?.presetId !== p.avatarConfig.presetId) {
            sprite.updateAvatarConfig(p.avatarConfig);
          }

          if (p.userId === currentLocalId) return; // local movement runs independently

          const sp = gridToScreen(p.x, p.y, this.layout);
          if (!prevPlayers[p.userId] || !sprite) {
            this.spawnPlayer(p.userId, p.name, sp.sx, sp.sy, false, p.avatarConfig);
          } else {
            sprite.setTargetPosition(sp.sx, sp.sy);
          }
        });

        Object.keys(prevPlayers).forEach((userId) => {
          if (!newPlayers[userId]) this.removePlayer(userId);
        });
      },
    );
  }

  private spawnPlayer(
    userId: string,
    name: string,
    x: number,
    y: number,
    isLocal: boolean,
    avatarConfig?: AvatarConfig,
  ): void {
    if (this.sprites.has(userId)) return;
    const sprite = new PlayerSprite(this.scene, userId, name, x, y, isLocal, avatarConfig);
    this.sprites.set(userId, sprite);
    this.sortSprite(sprite);
    if (isLocal) this.localPlayer = sprite;
  }

  private removePlayer(userId: string): void {
    const sprite = this.sprites.get(userId);
    if (sprite) {
      sprite.destroy();
      this.sprites.delete(userId);
    }
  }

  /** Interpolates remote players, depth-sorts everyone and keeps name tags in place. */
  public update(delta: number): void {
    const zoom = this.scene.cameras.main.zoom;
    this.sprites.forEach((sprite) => {
      if (sprite !== this.localPlayer) sprite.update(delta);
      this.sortSprite(sprite);
      sprite.syncOverlay(zoom);
    });

    // R-35: tall furniture in front of your own avatar fades.
    if (this.localPlayer) {
      const g = screenToGrid(this.localPlayer.x, this.localPlayer.y, this.layout);
      this.sorter.updateFades(g.gx, g.gy, this.localPlayer.getFadeRect());
    }
  }

  private sortSprite(sprite: PlayerSprite): void {
    const g = screenToGrid(sprite.x, sprite.y, this.layout);
    sprite.setDepth(this.sorter.depthForActor(g.gx, g.gy, sprite.getBodyRect()));
  }

  public destroy(): void {
    if (this.unsubPlayers) {
      this.unsubPlayers();
    }
    this.sprites.forEach((sprite) => sprite.destroy());
    this.sprites.clear();
    this.localPlayer = null;
  }
}
