import Phaser from 'phaser';
import { useGameStore } from '@core/store/game.store';
import { PlayerSprite } from '../entities/PlayerSprite';
import { gridToScreen, type IsoLayout } from '../utils/isometric';
import type { AvatarConfig } from '@core/types';

export class PlayerManager {
  private scene: Phaser.Scene;
  public sprites: Map<string, PlayerSprite> = new Map();
  public localPlayer: PlayerSprite | null = null;
  private unsubPlayers!: () => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  private get isoLayout(): IsoLayout | undefined {
    return (this.scene as unknown as { isoLayout?: IsoLayout }).isoLayout;
  }

  public init(): void {
    const state = useGameStore.getState();
    const localId = state.localPlayerId;
    const layout = this.isoLayout;

    // 1. Spawn Initial Players from Snapshot
    Object.values(state.players).forEach((player) => {
      // Backend sends grid coordinates; convert to screen for rendering
      let screenX = player.x;
      let screenY = player.y;
      if (layout) {
        const sp = gridToScreen(player.x, player.y, layout);
        screenX = sp.sx;
        screenY = sp.sy;
      }

      this.spawnPlayer(
        player.userId,
        player.name,
        screenX,
        screenY,
        player.userId === localId,
        player.avatarConfig,
      );
    });

    // 2. Subscribe to Zustand player changes
    this.unsubPlayers = useGameStore.subscribe(
      (currentState) => currentState.players,
      (newPlayers, prevPlayers) => {
        const localId2 = useGameStore.getState().localPlayerId;

        // Handle new players and movement
        Object.values(newPlayers).forEach((p) => {
          const isLocal = p.userId === localId2;
          
          const sprite = this.sprites.get(p.userId);
          if (sprite) {
            // Update avatar if changed
            if (p.avatarConfig && prevPlayers[p.userId]?.avatarConfig?.presetId !== p.avatarConfig.presetId) {
              sprite.updateAvatarConfig(p.avatarConfig);
            }
          }

          if (isLocal) return; // Local physics/movement runs independently

          if (!prevPlayers[p.userId]) {
            // New player appeared — convert grid → screen
            let sx = p.x;
            let sy = p.y;
            if (layout) {
              const sp = gridToScreen(p.x, p.y, layout);
              sx = sp.sx;
              sy = sp.sy;
            }
            this.spawnPlayer(p.userId, p.name, sx, sy, false, p.avatarConfig);
          } else {
            // Existing player moved — convert grid → screen
            let sx = p.x;
            let sy = p.y;
            if (layout) {
              const sp = gridToScreen(p.x, p.y, layout);
              sx = sp.sx;
              sy = sp.sy;
            }
            const sprite = this.sprites.get(p.userId);
            if (sprite) {
              sprite.setTargetPosition(sx, sy);
              // Update avatar if changed
              if (p.avatarConfig && prevPlayers[p.userId]?.avatarConfig?.presetId !== p.avatarConfig.presetId) {
                sprite.updateAvatarConfig(p.avatarConfig);
              }
            }
          }
        });

        // Handle players who left
        Object.keys(prevPlayers).forEach((userId) => {
          if (!newPlayers[userId]) {
            this.removePlayer(userId);
          }
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
    const sprite = new PlayerSprite(this.scene, userId, name, x, y, isLocal, avatarConfig);
    // Set initial depth based on Y position
    sprite.setDepth(10 + y);
    this.sprites.set(userId, sprite);

    if (isLocal) {
      this.localPlayer = sprite;
    }
  }

  private removePlayer(userId: string): void {
    const sprite = this.sprites.get(userId);
    if (sprite) {
      sprite.destroy();
      this.sprites.delete(userId);
    }
  }

  public update(delta: number): void {
    this.sprites.forEach((sprite) => {
      if (sprite !== this.localPlayer) {
        sprite.update(delta);
      }
      // Update depth for local player too
      if (sprite === this.localPlayer) {
        sprite.setDepth(10 + sprite.y);
      }
    });
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