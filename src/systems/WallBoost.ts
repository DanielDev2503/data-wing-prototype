import Phaser from "phaser";
import { GAME_CONFIG } from "../config";
import { PlayerShip } from "../entities/PlayerShip";

interface RayResult {
  hit: boolean;
  distance: number;
  normalizedDistance: number;
  normalX: number;
  normalY: number;
}

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

    if (this.ship.isBraking || this.ship.isStunned) return;

    const origins = this.ship.getBackRayOrigins();
    const endpoints = this.ship.getBackRayEndpoints(this.rayLength);

    const leftResult = this.castRayWithDistance(origins.left, endpoints.left);
    const rightResult = this.castRayWithDistance(origins.right, endpoints.right);

    this.drawRay(origins.left, endpoints.left, leftResult);
    this.drawRay(origins.right, endpoints.right, rightResult);

    const leftProx = leftResult.hit ? (1 - leftResult.normalizedDistance) : 0;
    const rightProx = rightResult.hit ? (1 - rightResult.normalizedDistance) : 0;
    const bestProximity = Math.max(leftProx, rightProx);

    if (bestProximity > 0.05) {
      const alignmentFactor = this.computeAlignmentFactor();
      const boostValue = bestProximity * alignmentFactor;
      const currentBoost = this.ship.currentBoostLevel;
      const targetBoost = Phaser.Math.Clamp(boostValue, 0, 1);

      if (targetBoost > currentBoost) {
        this.ship.setBoostLevel(Phaser.Math.Linear(currentBoost, targetBoost, 0.15));
      }

      // Point 3: Physical tangential & perpendicular boost acceleration printed by the wall onto the ship
      const activeResult = leftProx >= rightProx ? leftResult : rightResult;
      if (activeResult.hit) {
        this.applyWallBoostPhysics(activeResult.normalX, activeResult.normalY, boostValue);
      }
    }
  }

  destroy(): void {
    this.debugGraphics.destroy();
  }

  /**
   * Applies the physical perpendicular/tangential boost acceleration printed by the wall onto the ship
   */
  private applyWallBoostPhysics(nx: number, ny: number, boostValue: number): void {
    const shipAngle = this.ship.angle;
    const fx = Math.cos(shipAngle);
    const fy = Math.sin(shipAngle);

    // Calculate component of forward vector along wall normal
    const dot = fx * nx + fy * ny;

    // Tangent vector along wall parallel to ship forward motion
    let tx = fx - dot * nx;
    let ty = fy - dot * ny;
    const tLen = Math.sqrt(tx * tx + ty * ty);
    if (tLen > 0.0001) {
      tx /= tLen;
      ty /= tLen;
    } else {
      tx = fx;
      ty = fy;
    }

    // Perpendicular force: mostly tangential along wall surface + slight outward push to glide along wall
    const wallForceMagnitude = GAME_CONFIG.boostForce * boostValue;
    const boostForceX = (tx * 0.85 + nx * 0.15) * wallForceMagnitude;
    const boostForceY = (ty * 0.85 + ny * 0.15) * wallForceMagnitude;

    this.scene.matter.body.applyForce(this.ship.matterBody, this.ship.matterBody.position, {
      x: boostForceX,
      y: boostForceY,
    });
  }

  private castRayWithDistance(start: Phaser.Math.Vector2, end: Phaser.Math.Vector2): RayResult {
    if (this.wallBodies.length === 0) {
      return { hit: false, distance: this.rayLength, normalizedDistance: 1, normalX: 0, normalY: 0 };
    }

    const collisions = this.scene.matter.query.ray(
      this.wallBodies,
      { x: start.x, y: start.y },
      { x: end.x, y: end.y }
    );

    if (collisions.length === 0) {
      return { hit: false, distance: this.rayLength, normalizedDistance: 1, normalX: 0, normalY: 0 };
    }

    let minDist = this.rayLength;
    let hitNormalX = 0;
    let hitNormalY = 0;

    for (const collision of collisions) {
      const c = collision as unknown as {
        body?: MatterJS.BodyType;
        bodyA?: MatterJS.BodyType;
        point?: { x: number; y: number };
        normal?: { x: number; y: number };
      };
      const targetBody = c.body || c.bodyA;
      let dist = this.rayLength;

      if (c.point) {
        const dx = c.point.x - start.x;
        const dy = c.point.y - start.y;
        dist = Math.sqrt(dx * dx + dy * dy);
      } else if (targetBody && targetBody.position) {
        const dx = targetBody.position.x - start.x;
        const dy = targetBody.position.y - start.y;
        dist = Math.sqrt(dx * dx + dy * dy);
      }

      if (dist < minDist) {
        minDist = dist;
        if (c.normal) {
          hitNormalX = c.normal.x;
          hitNormalY = c.normal.y;
        } else if (targetBody) {
          const dx = start.x - targetBody.position.x;
          const dy = start.y - targetBody.position.y;
          const dLen = Math.sqrt(dx * dx + dy * dy) || 1;
          hitNormalX = dx / dLen;
          hitNormalY = dy / dLen;
        }
      }
    }

    return {
      hit: true,
      distance: minDist,
      normalizedDistance: Phaser.Math.Clamp(minDist / this.rayLength, 0, 1),
      normalX: hitNormalX,
      normalY: hitNormalY,
    };
  }

  private computeAlignmentFactor(): number {
    const vel = this.ship.velocity;
    const speed = this.ship.speed;
    if (speed < 0.5) return 0.3;

    const moveAngle = Math.atan2(vel.y, vel.x);
    const shipAngle = this.ship.angle;
    let diff = Math.abs(moveAngle - shipAngle);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;

    const alignment = 1 - diff / Math.PI;
    return Phaser.Math.Clamp(alignment, 0.1, 1);
  }

  private drawRay(start: Phaser.Math.Vector2, end: Phaser.Math.Vector2, result: RayResult): void {
    const intensity = result.hit ? (1 - result.normalizedDistance) : 0;
    const color = result.hit
      ? this.lerpColor(0x333333, GAME_CONFIG.boostColor, intensity)
      : 0x222222;
    const alpha = result.hit ? 0.3 + intensity * 0.5 : 0.1;

    this.debugGraphics.lineStyle(1, color, alpha);
    this.debugGraphics.beginPath();
    this.debugGraphics.moveTo(start.x, start.y);
    this.debugGraphics.lineTo(end.x, end.y);
    this.debugGraphics.strokePath();

    if (result.hit && intensity > 0.3) {
      this.debugGraphics.fillStyle(GAME_CONFIG.boostColor, intensity * 0.8);
      this.debugGraphics.fillCircle(start.x, start.y, 2 + intensity * 2);
    }
  }

  private lerpColor(from: number, to: number, t: number): number {
    const fr = (from >> 16) & 0xff, fg = (from >> 8) & 0xff, fb = from & 0xff;
    const tr = (to >> 16) & 0xff, tg = (to >> 8) & 0xff, tb = to & 0xff;
    const r = Math.round(fr + (tr - fr) * t);
    const g = Math.round(fg + (tg - fg) * t);
    const b = Math.round(fb + (tb - fb) * t);
    return (r << 16) | (g << 8) | b;
  }
}
