import Phaser from "phaser";
import { GAME_CONFIG } from "../config";
import { PlayerShip } from "../entities/PlayerShip";

interface TrailPoint {
  x: number;
  y: number;
  age: number;
  boosted: boolean;
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
    const offset = GAME_CONFIG.shipSize * 0.5;

    this.points.unshift({
      x: this.ship.x + Math.cos(backAngle) * offset,
      y: this.ship.y + Math.sin(backAngle) * offset,
      age: 0,
      boosted: this.ship.isBoosting,
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
      const thickness = Math.max(0.5, lifeRatio * 3);
      const color = current.boosted ? GAME_CONFIG.boostColor : GAME_CONFIG.trailColor;

      this.graphics.lineStyle(thickness, color, alpha);
      this.graphics.beginPath();
      this.graphics.moveTo(current.x, current.y);
      this.graphics.lineTo(next.x, next.y);
      this.graphics.strokePath();
    }

    if (this.points.length > 0) {
      const head = this.points[0];
      const headColor = head.boosted ? GAME_CONFIG.boostColor : GAME_CONFIG.trailColor;
      this.graphics.fillStyle(headColor, 0.6);
      this.graphics.fillCircle(head.x, head.y, 2);
    }
  }
}
