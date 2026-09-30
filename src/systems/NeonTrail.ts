import Phaser from "phaser";
import { GAME_CONFIG } from "../config";
import { PlayerShip } from "../entities/PlayerShip";

interface TrailNode {
  x: number;
  y: number;
  boost: number;
}

export class NeonTrail {
  private readonly ship: PlayerShip;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly maxPoints: number;
  private readonly ringBuffer: TrailNode[];

  private headIndex: number = 0;
  private count: number = 0;

  // Scratch position to eliminate GC
  private readonly scratchPos = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene, ship: PlayerShip) {
    this.ship = ship;
    this.maxPoints = GAME_CONFIG.trailMaxLength;

    this.graphics = scene.add.graphics();
    this.graphics.setDepth(3);

    // Preallocate all circular buffer nodes once
    this.ringBuffer = new Array<TrailNode>(this.maxPoints);
    for (let i = 0; i < this.maxPoints; i++) {
      this.ringBuffer[i] = { x: 0, y: 0, boost: 0 };
    }
  }

  update(_delta: number): void {
    this.addPoint();
    this.draw();
  }

  destroy(): void {
    this.graphics.destroy();
  }

  private addPoint(): void {
    this.ship.getTailPosition(this.scratchPos);

    const node = this.ringBuffer[this.headIndex];
    node.x = this.scratchPos.x;
    node.y = this.scratchPos.y;
    node.boost = this.ship.currentBoostLevel;

    this.headIndex = (this.headIndex + 1) % this.maxPoints;
    if (this.count < this.maxPoints) {
      this.count++;
    }
  }

  private draw(): void {
    this.graphics.clear();

    if (this.count < 2) return;

    const baseColor = GAME_CONFIG.trailColor;
    const boostColor = GAME_CONFIG.trailBoostColor;

    for (let i = 0; i < this.count - 1; i++) {
      const idxCurr = (this.headIndex - 1 - i + this.maxPoints) % this.maxPoints;
      const idxNext = (this.headIndex - 2 - i + this.maxPoints) % this.maxPoints;

      const curr = this.ringBuffer[idxCurr];
      const next = this.ringBuffer[idxNext];

      const lifeRatio = 1 - (i / this.count);
      const alpha = Math.max(0, lifeRatio * 0.85);

      // Modulate thickness: tapered towards tail, wider at base with higher boost
      const thickness = Math.max(0.6, lifeRatio * (2.2 + curr.boost * 3.6));

      // Dynamic color interpolation from cyan to hot magenta
      const color = curr.boost > 0.05
        ? this.fastLerpColor(baseColor, boostColor, curr.boost)
        : baseColor;

      this.graphics.lineStyle(thickness, color, alpha);
      this.graphics.beginPath();
      this.graphics.moveTo(curr.x, curr.y);
      this.graphics.lineTo(next.x, next.y);
      this.graphics.strokePath();
    }

    // Glowing core emitter at the head
    const latestIdx = (this.headIndex - 1 + this.maxPoints) % this.maxPoints;
    const head = this.ringBuffer[latestIdx];
    const headBoost = head.boost;
    const headColor = headBoost > 0.05
      ? this.fastLerpColor(baseColor, boostColor, headBoost)
      : baseColor;

    this.graphics.fillStyle(headColor, 0.7 + headBoost * 0.3);
    this.graphics.fillCircle(head.x, head.y, 2.5 + headBoost * 2.0);

    this.graphics.fillStyle(0xffffff, 0.85);
    this.graphics.fillCircle(head.x, head.y, 1.2 + headBoost * 1.0);
  }

  private fastLerpColor(from: number, to: number, t: number): number {
    const clampedT = t > 1 ? 1 : (t < 0 ? 0 : t);
    const fr = (from >> 16) & 0xff, fg = (from >> 8) & 0xff, fb = from & 0xff;
    const tr = (to >> 16) & 0xff, tg = (to >> 8) & 0xff, tb = to & 0xff;
    const r = Math.round(fr + (tr - fr) * clampedT);
    const g = Math.round(fg + (tg - fg) * clampedT);
    const b = Math.round(fb + (tb - fb) * clampedT);
    return (r << 16) | (g << 8) | b;
  }
}
