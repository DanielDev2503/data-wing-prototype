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

    const center = this.ship.getBackCenter();
    const backAngle = this.ship.angle + Math.PI;
    const spread = GAME_CONFIG.boostRayAngle;
    const numRays = 15;

    let closestResult: RayResult = {
      hit: false,
      distance: this.rayLength,
      normalizedDistance: 1,
      normalX: 0,
      normalY: 0,
    };

    const rayResults: { start: Phaser.Math.Vector2; end: Phaser.Math.Vector2; result: RayResult }[] = [];

    for (let i = 0; i < numRays; i++) {
      const t = numRays > 1 ? i / (numRays - 1) : 0.5;
      const rayAngle = backAngle - spread + t * (2 * spread);

      const end = new Phaser.Math.Vector2(
        center.x + Math.cos(rayAngle) * this.rayLength,
        center.y + Math.sin(rayAngle) * this.rayLength
      );

      const result = this.castRayWithDistance(center, end);
      rayResults.push({ start: center, end, result });

      if (result.hit && result.distance < closestResult.distance) {
        closestResult = result;
      }
    }

    const bestProximity = closestResult.hit ? (1 - closestResult.normalizedDistance) : 0;

    // Draw the semicircle / sector detection zone delimited by boostRayAngle
    this.drawSemicircleZone(center, backAngle, spread, bestProximity, rayResults);

    if (bestProximity > 0.05 && closestResult.hit) {
      const alignmentFactor = this.computeAlignmentFactor();
      // Boost becomes exponentially stronger as the rays get closer to the wall
      const proximityFactor = Math.pow(bestProximity, GAME_CONFIG.boostProximityExponent);
      const boostValue = proximityFactor * alignmentFactor;
      const currentBoost = this.ship.currentBoostLevel;
      const targetBoost = Phaser.Math.Clamp(boostValue, 0, 1);

      if (targetBoost > currentBoost) {
        this.ship.setBoostLevel(Phaser.Math.Linear(currentBoost, targetBoost, 0.15));
      }

      this.applyWallBoostPhysics(closestResult.normalX, closestResult.normalY, boostValue);
    } else {
      // Immediately stop boost when rays are not in contact with a wall
      this.ship.setBoostLevel(0);
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

  private drawSemicircleZone(
    center: Phaser.Math.Vector2,
    backAngle: number,
    spread: number,
    bestProximity: number,
    rayResults: { start: Phaser.Math.Vector2; end: Phaser.Math.Vector2; result: RayResult }[]
  ): void {
    const startAngle = backAngle - spread;
    const endAngle = backAngle + spread;

    // Fill sector area with boost glow color scaled by proximity
    const fillAlpha = bestProximity > 0 ? 0.08 + bestProximity * 0.45 : 0.04;
    this.debugGraphics.fillStyle(GAME_CONFIG.boostColor, fillAlpha);
    this.debugGraphics.beginPath();
    this.debugGraphics.moveTo(center.x, center.y);
    this.debugGraphics.arc(center.x, center.y, this.rayLength, startAngle, endAngle, false);
    this.debugGraphics.closePath();
    this.debugGraphics.fillPath();

    // Stroke boundary outline of the sector
    const strokeColor = bestProximity > 0
      ? this.lerpColor(0x555555, GAME_CONFIG.boostColor, bestProximity)
      : 0x333333;
    const strokeAlpha = bestProximity > 0 ? 0.4 + bestProximity * 0.5 : 0.2;
    this.debugGraphics.lineStyle(1.5, strokeColor, strokeAlpha);
    this.debugGraphics.beginPath();
    this.debugGraphics.moveTo(center.x, center.y);
    this.debugGraphics.arc(center.x, center.y, this.rayLength, startAngle, endAngle, false);
    this.debugGraphics.closePath();
    this.debugGraphics.strokePath();

    // Draw individual ray hits within sector
    for (const item of rayResults) {
      if (item.result.hit) {
        const prox = 1 - item.result.normalizedDistance;
        const rayDirAngle = Math.atan2(item.end.y - center.y, item.end.x - center.x);
        const hitX = center.x + Math.cos(rayDirAngle) * item.result.distance;
        const hitY = center.y + Math.sin(rayDirAngle) * item.result.distance;

        this.debugGraphics.lineStyle(1, GAME_CONFIG.boostColor, 0.2 + prox * 0.5);
        this.debugGraphics.beginPath();
        this.debugGraphics.moveTo(center.x, center.y);
        this.debugGraphics.lineTo(hitX, hitY);
        this.debugGraphics.strokePath();

        this.debugGraphics.fillStyle(GAME_CONFIG.boostColor, 0.5 + prox * 0.5);
        this.debugGraphics.fillCircle(hitX, hitY, 1.5 + prox * 2);
      }
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
