import Phaser from 'phaser';
import { useGameStore } from '@core/store/game.store';
import { PlayerSprite } from '../entities/PlayerSprite';

export class PlayerManager {
  private scene: Phaser.Scene;
  public sprites: Map<string, PlayerSprite> = new Map();
  public localPlayer: PlayerSprite | null = null;
  private unsubPlayers!: () => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public init(): void {
    const state = useGameStore.getState();
    const localId = state.localPlayerId;

    // 1. Spawn Initial Players from Snapshot
    Object.values(state.players).forEach(player => {
      this.spawnPlayer(player.userId, player.name, player.x, player.y, player.userId === localId);
    });

    // 2. Subscribe to Zustand player changes
    this.unsubPlayers = useGameStore.subscribe(
      (currentState) => currentState.players,
      (newPlayers, prevPlayers) => {
        // Handle new players and movement
        Object.values(newPlayers).forEach(p => {
          const isLocal = p.userId === localId;
          if (isLocal) return; // Local physics runs independently

          if (!prevPlayers[p.userId]) {
            // New player appeared
            this.spawnPlayer(p.userId, p.name, p.x, p.y, false);
          } else {
            // Existing player moved
            const sprite = this.sprites.get(p.userId);
            if (sprite) {
              sprite.setTargetPosition(p.x, p.y);
            }
          }
        });

        // Handle players who left
        Object.keys(prevPlayers).forEach(userId => {
          if (!newPlayers[userId]) {
            this.removePlayer(userId);
          }
        });
      }
    );
  }

  private spawnPlayer(userId: string, name: string, x: number, y: number, isLocal: boolean): void {
    const sprite = new PlayerSprite(this.scene, userId, name, x, y, isLocal);
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
    // Lerp all remote players
    this.sprites.forEach(sprite => {
      if (sprite !== this.localPlayer) {
        sprite.update(delta);
      }
    });
  }

  public destroy(): void {
    if (this.unsubPlayers) {
      this.unsubPlayers();
    }
    this.sprites.forEach(sprite => sprite.destroy());
    this.sprites.clear();
    this.localPlayer = null;
  }
}