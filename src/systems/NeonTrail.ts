import Phaser from "phaser";
import { GAME_CONFIG } from "../config";
import { PlayerShip } from "../entities/PlayerShip";

interface TrailPoint {
  x: number;
  y: number;
  age: number;
  boostLevel: number;
}

export class NeonTrail {
  private readonly ship: PlayerShip;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly points: TrailPoint[] = [];
  private readonly maxPoints: number;
  private readonly fadeDuration: number;

  constructor(scene: Phaser.Scene, ship: PlayerShip) {
    this.ship = ship;
    this.maxPoints = GAME_CONFIG.trailMaxLength;
    this.fadeDuration = GAME_CONFIG.trailFadeDuration;

    this.graphics = scene.add.graphics();
    this.graphics.setDepth(3);
  }

  update(delta: number): void {
    this.addPoint();
    this.agePoints(delta);
    this.prunePoints();
    this.draw();
  }

  destroy(): void {
    this.graphics.destroy();
  }

  private addPoint(): void {
    const backAngle = this.ship.angle + Math.PI;
    const offset = GAME_CONFIG.shipSize * 0.4;

    this.points.unshift({
      x: this.ship.x + Math.cos(backAngle) * offset,
      y: this.ship.y + Math.sin(backAngle) * offset,
      age: 0,
      boostLevel: this.ship.currentBoostLevel,
    });

    if (this.points.length > this.maxPoints) {
      this.points.pop();
    }
  }

  private agePoints(delta: number): void {
    for (const point of this.points) {
      point.age += delta;
    }
  }

  private prunePoints(): void {
    while (this.points.length > 0 && this.points[this.points.length - 1].age > this.fadeDuration) {
      this.points.pop();
    }
  }

  private draw(): void {
    this.graphics.clear();

    if (this.points.length < 2) return;

    for (let i = 0; i < this.points.length - 1; i++) {
      const current = this.points[i];
      const next = this.points[i + 1];

      const lifeRatio = 1 - current.age / this.fadeDuration;
      const alpha = Math.max(0, lifeRatio * 0.8);
      const thickness = Math.max(0.5, lifeRatio * (2 + current.boostLevel * 2));
      const color = this.getTrailColor(current.boostLevel);

      this.graphics.lineStyle(thickness, color, alpha);
      this.graphics.beginPath();
      this.graphics.moveTo(current.x, current.y);
      this.graphics.lineTo(next.x, next.y);
      this.graphics.strokePath();
    }

    if (this.points.length > 0) {
      const head = this.points[0];
      const headColor = this.getTrailColor(head.boostLevel);
      this.graphics.fillStyle(headColor, 0.6);
      this.graphics.fillCircle(head.x, head.y, 2 + head.boostLevel * 1.5);
    }
  }

  private getTrailColor(boostLevel: number): number {
    if (boostLevel < 0.1) return GAME_CONFIG.trailColor;

    const from = GAME_CONFIG.trailColor;
    const to = GAME_CONFIG.boostColor;
    const t = Phaser.Math.Clamp(boostLevel, 0, 1);

    const fr = (from >> 16) & 0xff, fg = (from >> 8) & 0xff, fb = from & 0xff;
    const tr = (to >> 16) & 0xff, tg = (to >> 8) & 0xff, tb = to & 0xff;
    const r = Math.round(fr + (tr - fr) * t);
    const g = Math.round(fg + (tg - fg) * t);
    const b = Math.round(fb + (tb - fb) * t);
    return (r << 16) | (g << 8) | b;
  }
}
