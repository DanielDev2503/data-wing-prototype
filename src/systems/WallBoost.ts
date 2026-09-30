import Phaser from "phaser";
import { GAME_CONFIG } from "../config";
import { PlayerShip } from "../entities/PlayerShip";

export interface TrackSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly midX: number;
  readonly midY: number;
  readonly nx: number;
  readonly ny: number;
  readonly tx: number;
  readonly ty: number;
  readonly length: number;
  readonly lengthSq: number;
}

export class WallBoost {
  private readonly scene: Phaser.Scene;
  private readonly ship: PlayerShip;
  private readonly debugGraphics: Phaser.GameObjects.Graphics;
  private segments: TrackSegment[] = [];

  private currentIntensity: number = 0;

  // Zero-GC preallocated structures
  private readonly scratchForce = { x: 0, y: 0 };
  private readonly closestWall = {
    hit: false,
    distance: 9999,
    nx: 0,
    ny: 0,
    tx: 0,
    ty: 0,
    qx: 0,
    qy: 0,
  };

  constructor(scene: Phaser.Scene, ship: PlayerShip) {
    this.scene = scene;
    this.ship = ship;

    this.debugGraphics = scene.add.graphics();
    this.debugGraphics.setDepth(6);
  }

  get intensity(): number {
    return this.currentIntensity;
  }

  setSegments(segments: TrackSegment[]): void {
    this.segments = segments;
  }

  update(): void {
    this.debugGraphics.clear();

    if (this.ship.isBraking || this.ship.isStunned) {
      this.currentIntensity = Phaser.Math.Linear(this.currentIntensity, 0, 0.2);
      this.ship.setBoostLevel(this.currentIntensity);
      return;
    }

    const shipX = this.ship.x;
    const shipY = this.ship.y;
    const shipAngle = this.ship.angle;
    const shipRadius = GAME_CONFIG.shipRadius;
    const rProx = GAME_CONFIG.boostProximityRadius;

    // Unit forward vector of the ship
    const ux = Math.cos(shipAngle);
    const uy = Math.sin(shipAngle);

    // Ship velocity vector
    const vel = this.ship.velocity;
    const vx = vel.x;
    const vy = vel.y;
    const speed = Math.sqrt(vx * vx + vy * vy);

    // 1. Check proximity towards all segments to find closest wall within rProx
    this.findClosestSegment(shipX, shipY, shipRadius, rProx);

    if (this.closestWall.hit && this.closestWall.distance < rProx) {
      const d = Math.max(0, this.closestWall.distance);
      const nx = this.closestWall.nx;
      const ny = this.closestWall.ny;

      // 2. Unit tangent of the segment: t = (-n_y, n_x)
      let tx = -ny;
      let ty = nx;

      // 3. Dynamic Sign Orientation: force tangent towards velocity vector (or forward vector if near stationary)
      const dotV = vx * tx + vy * ty;
      const dotU = ux * tx + uy * ty;
      const alignTest = speed > 0.4 ? dotV : dotU;

      let tfwdX = tx;
      let tfwdY = ty;
      if (alignTest < 0) {
        tfwdX = -tx;
        tfwdY = -ty;
      }

      // 4. Angular alignment factor: f_theta = |u . t_fwd|
      const dotUT = ux * tfwdX + uy * tfwdY;
      const fTheta = Phaser.Math.Clamp(Math.abs(dotUT), 0, 1);

      // 5. Proximity factor: f_d = clamp(1 - (d / r_prox), 0, 1)
      const rawProximity = Phaser.Math.Clamp(1 - d / rProx, 0, 1);
      const fD = Math.pow(rawProximity, GAME_CONFIG.boostProximityExponent);

      // Target boost acceleration factor
      const targetBoost = fD * fTheta;

      // Smooth interpolation to avoid abrupt steps
      this.currentIntensity = Phaser.Math.Linear(
        this.currentIntensity,
        targetBoost,
        GAME_CONFIG.boostLerpSpeed
      );

      // 6. Resulting acceleration: a_boost = t_fwd * (k_boost * f_d * f_theta)
      const kBoost = GAME_CONFIG.boostForce;
      const boostMagnitude = kBoost * this.currentIntensity;

      // Apply tangential boost force + subtle outward cushion to glide cleanly along curvature
      const cushion = d < 8 ? kBoost * 0.12 * fD : 0;
      this.scratchForce.x = tfwdX * boostMagnitude + nx * cushion;
      this.scratchForce.y = tfwdY * boostMagnitude + ny * cushion;

      this.scene.matter.body.applyForce(
        this.ship.matterBody,
        this.ship.matterBody.position,
        this.scratchForce
      );

      this.ship.setBoostLevel(this.currentIntensity);

      // 7. Visual Grazing FX
      this.drawWallGrazingFX(shipX, shipY, this.closestWall.qx, this.closestWall.qy, d, rProx, this.currentIntensity);
    } else {
      // Smooth decay when out of boost proximity
      this.currentIntensity = Phaser.Math.Linear(this.currentIntensity, 0, 0.2);
      if (this.currentIntensity < 0.01) {
        this.currentIntensity = 0;
      }
      this.ship.setBoostLevel(this.currentIntensity);
    }
  }

  destroy(): void {
    this.debugGraphics.destroy();
  }

  private findClosestSegment(px: number, py: number, radius: number, maxDist: number): void {
    let minDistance = maxDist + radius;
    let found = false;
    let bestNx = 0;
    let bestNy = 0;
    let bestQx = 0;
    let bestQy = 0;

    const maxSearchDistSq = (maxDist + radius + 20) * (maxDist + radius + 20);

    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];

      // Quick bounding check
      const dMidX = px - seg.midX;
      const dMidY = py - seg.midY;
      const halfL = seg.length * 0.5 + maxDist + radius;
      if (Math.abs(dMidX) > halfL || Math.abs(dMidY) > halfL) {
        continue;
      }

      // Point-to-segment projection
      const dx = seg.x2 - seg.x1;
      const dy = seg.y2 - seg.y1;
      const vx = px - seg.x1;
      const vy = py - seg.y1;

      const t = Phaser.Math.Clamp((vx * dx + vy * dy) / seg.lengthSq, 0, 1);
      const qx = seg.x1 + t * dx;
      const qy = seg.y1 + t * dy;

      const rx = px - qx;
      const ry = py - qy;
      const distSq = rx * rx + ry * ry;

      if (distSq < maxSearchDistSq) {
        const dist = Math.sqrt(distSq);
        if (dist < minDistance) {
          minDistance = dist;
          found = true;
          bestQx = qx;
          bestQy = qy;

          if (dist > 0.0001) {
            bestNx = rx / dist;
            bestNy = ry / dist;
          } else {
            bestNx = seg.nx;
            bestNy = seg.ny;
          }
        }
      }
    }

    this.closestWall.hit = found;
    this.closestWall.distance = Math.max(0, minDistance - radius);
    this.closestWall.nx = bestNx;
    this.closestWall.ny = bestNy;
    this.closestWall.qx = bestQx;
    this.closestWall.qy = bestQy;
  }

  private drawWallGrazingFX(
    sx: number,
    sy: number,
    qx: number,
    qy: number,
    dist: number,
    rProx: number,
    intensity: number
  ): void {
    if (intensity < 0.05) return;

    const proxRatio = Phaser.Math.Clamp(1 - dist / rProx, 0, 1);
    const glowAlpha = 0.2 + proxRatio * 0.4 + intensity * 0.4;
    const color = GAME_CONFIG.boostColor;

    // Glowing energy arc between ship grazing wing and the wall contact point
    this.debugGraphics.lineStyle(2 + intensity * 2, color, glowAlpha);
    this.debugGraphics.beginPath();
    this.debugGraphics.moveTo(sx, sy);
    this.debugGraphics.lineTo(qx, qy);
    this.debugGraphics.strokePath();

    // Electric grazing contact spark at the wall surface
    this.debugGraphics.fillStyle(0xffffff, 0.9);
    this.debugGraphics.fillCircle(qx, qy, 2.5 + intensity * 2.5);

    this.debugGraphics.fillStyle(color, 0.6 + intensity * 0.4);
    this.debugGraphics.fillCircle(qx, qy, 4.5 + intensity * 4.0);

    // Wall surface glow line
    const tangentSpread = 16 + intensity * 24;
    const tx = -this.closestWall.ny;
    const ty = this.closestWall.nx;

    this.debugGraphics.lineStyle(3, color, glowAlpha * 0.7);
    this.debugGraphics.beginPath();
    this.debugGraphics.moveTo(qx - tx * tangentSpread, qy - ty * tangentSpread);
    this.debugGraphics.lineTo(qx + tx * tangentSpread, qy + ty * tangentSpread);
    this.debugGraphics.strokePath();
  }
}
