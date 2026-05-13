import Phaser from 'phaser';

export class PlayerSprite extends Phaser.GameObjects.Container {
  public readonly userId: string;
  public readonly isLocal: boolean;
  
  private targetX: number;
  private targetY: number;
  
  private bodyArc: Phaser.GameObjects.Arc;
  private nameText: Phaser.GameObjects.Text;
  private statusDot: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene, userId: string, name: string, x: number, y: number, isLocal: boolean) {
    super(scene, x, y);
    
    this.userId = userId;
    this.isLocal = isLocal;
    this.targetX = x;
    this.targetY = y;

    // 1. Determine body color: Cyan for local, deterministic hash for remote
    const bodyColor = isLocal ? 0x06b6d4 : this.getHashColor(userId);

    // 2. Create Body Circle (Radius 16)
    this.bodyArc = scene.add.circle(0, 0, 16, bodyColor);
    
    // 3. Create Name Label (Above the player)
    this.nameText = scene.add.text(0, -28, name, {
      fontSize: '12px',
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#ffffff',
      stroke: '#020617', // Slate 950
      strokeThickness: 3
    }).setOrigin(0.5, 0.5);

    // 4. Create Status Dot (Green/Online, bottom right of the body)
    this.statusDot = scene.add.circle(12, 12, 4, 0x10b981); // Emerald 500
    this.statusDot.setStrokeStyle(1, 0x020617);

    // 5. Add all visual elements to the Container
    this.add([this.bodyArc, this.nameText, this.statusDot]);

    // 6. Add Container to Scene & Enable Physics
    scene.add.existing(this);
    scene.physics.add.existing(this);

    // 7. Configure Physics Body
    const body = this.body as Phaser.Physics.Arcade.Body;
    // Offset the physics body to match the visual circle inside the container
    body.setCircle(16, -16, -16); 
    body.setCollideWorldBounds(true);
    
    // Remote players should not be pushable by local physics interactions
    if (!isLocal) {
      body.pushable = false;
      body.immovable = true;
    }
  }

  /**
   * Called by the NetworkManager when a remote player moves.
   */
  public setTargetPosition(x: number, y: number) {
    this.targetX = x;
    this.targetY = y;
  }

  /**
   * Called every frame by the OfficeScene update loop.
   */
  public update(delta: number) {
    void delta;

    // Local player movement is handled directly by Arcade Physics velocity in the scene
    if (this.isLocal) return;

    // Remote players smoothly interpolate (lerp) towards their target position
    // This masks network latency and tick-rate differences
    const lerpFactor = 0.15;
    this.x = Phaser.Math.Linear(this.x, this.targetX, lerpFactor);
    this.y = Phaser.Math.Linear(this.y, this.targetY, lerpFactor);
  }

  /**
   * Generates a consistent hex color from a user ID string.
   */
  private getHashColor(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    // A curated palette of Tailwind colors for avatars
    const colors = [0xef4444, 0xf59e0b, 0x8b5cf6, 0xec4899, 0xf97316, 0x14b8a6];
    return colors[Math.abs(hash) % colors.length];
  }
  
  public destroy(fromScene?: boolean) {
    super.destroy(fromScene);
  }
}
