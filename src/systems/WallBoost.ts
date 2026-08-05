import Phaser from "phaser";
import { GAME_CONFIG } from "../config";
import { PlayerShip } from "../entities/PlayerShip";

export class WallBoost {
  private readonly scene: Phaser.Scene;
  private readonly ship: PlayerShip;
  private readonly rayLength: number;
  private readonly debugGraphics: Phaser.GameObjects.Graphics;
  private wallBodies: MatterJS.BodyType[] = [];

  constructor(scene: Phaser.Scene, ship: PlayerShip) {
    this.scene = scene;
    this.ship = ship;
    this.rayLength = GAME_CONFIG.boostRayLength;
    this.debugGraphics = scene.add.graphics();
    this.debugGraphics.setDepth(5);
  }

  setWallBodies(bodies: MatterJS.BodyType[]): void {
    this.wallBodies = bodies;
  }

  update(): void {
    this.debugGraphics.clear();

    if (!this.ship.isThrusting) return;

    const origins = this.ship.getBackRayOrigins();
    const endpoints = this.ship.getBackRayEndpoints(this.rayLength);

    const leftHit = this.castRay(origins.left, endpoints.left);
    const rightHit = this.castRay(origins.right, endpoints.right);

    this.drawRay(origins.left, endpoints.left, leftHit);
    this.drawRay(origins.right, endpoints.right, rightHit);

    if (leftHit || rightHit) {
      this.ship.setBoosting(true);
    }
  }

  destroy(): void {
    this.debugGraphics.destroy();
  }

  private castRay(start: Phaser.Math.Vector2, end: Phaser.Math.Vector2): boolean {
    if (this.wallBodies.length === 0) return false;

    const rayStart = { x: start.x, y: start.y };
    const rayEnd = { x: end.x, y: end.y };

    const collisions = this.scene.matter.query.ray(
      this.wallBodies,
      rayStart,
      rayEnd
    );

    return collisions.length > 0;
  }

  private drawRay(
    start: Phaser.Math.Vector2,
    end: Phaser.Math.Vector2,
    hit: boolean
  ): void {
    const color = hit ? GAME_CONFIG.boostColor : 0x333333;
    const alpha = hit ? 0.7 : 0.2;

    this.debugGraphics.lineStyle(1, color, alpha);
    this.debugGraphics.beginPath();
    this.debugGraphics.moveTo(start.x, start.y);
    this.debugGraphics.lineTo(end.x, end.y);
    this.debugGraphics.strokePath();

    if (hit) {
      this.debugGraphics.fillStyle(GAME_CONFIG.boostColor, 0.9);
      this.debugGraphics.fillCircle(start.x, start.y, 3);
    }
  }
}
