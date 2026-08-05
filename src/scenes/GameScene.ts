import Phaser from "phaser";
import { GAME_CONFIG } from "../config";
import { PlayerShip } from "../entities/PlayerShip";
import { WallBoost } from "../systems/WallBoost";
import { NeonTrail } from "../systems/NeonTrail";

interface WallSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export class GameScene extends Phaser.Scene {
  private ship!: PlayerShip;
  private wallBoost!: WallBoost;
  private neonTrail!: NeonTrail;
  private wallGraphics!: Phaser.GameObjects.Graphics;
  private bgGraphics!: Phaser.GameObjects.Graphics;
  private wallBodies: MatterJS.BodyType[] = [];

  constructor() {
    super({ key: "GameScene" });
  }

  create(): void {
    this.buildBackground();
    this.buildCircuit();
    this.ship = new PlayerShip(this, 640, 500);
    this.wallBoost = new WallBoost(this, this.ship);
    this.wallBoost.setWallBodies(this.wallBodies);
    this.neonTrail = new NeonTrail(this, this.ship);
    this.setupCamera();
    this.setupBloom();
    this.addHUD();
  }

  update(_time: number, delta: number): void {
    this.ship.update(delta);
    this.wallBoost.update();
    this.neonTrail.update(delta);
  }

  private buildBackground(): void {
    this.bgGraphics = this.add.graphics();
    this.bgGraphics.setDepth(0);

    const gridSize = 80;
    const w = GAME_CONFIG.width * 2;
    const h = GAME_CONFIG.height * 2;

    this.bgGraphics.lineStyle(1, 0x111122, 0.3);

    for (let x = 0; x <= w; x += gridSize) {
      this.bgGraphics.beginPath();
      this.bgGraphics.moveTo(x, 0);
      this.bgGraphics.lineTo(x, h);
      this.bgGraphics.strokePath();
    }
    for (let y = 0; y <= h; y += gridSize) {
      this.bgGraphics.beginPath();
      this.bgGraphics.moveTo(0, y);
      this.bgGraphics.lineTo(w, y);
      this.bgGraphics.strokePath();
    }
  }

  private buildCircuit(): void {
    this.wallGraphics = this.add.graphics();
    this.wallGraphics.setDepth(2);

    const outerTrack: WallSegment[] = [
      { x1: 200, y1: 100, x2: 1080, y2: 100 },
      { x1: 1080, y1: 100, x2: 1180, y2: 200 },
      { x1: 1180, y1: 200, x2: 1180, y2: 520 },
      { x1: 1180, y1: 520, x2: 1080, y2: 620 },
      { x1: 1080, y1: 620, x2: 200, y2: 620 },
      { x1: 200, y1: 620, x2: 100, y2: 520 },
      { x1: 100, y1: 520, x2: 100, y2: 200 },
      { x1: 100, y1: 200, x2: 200, y2: 100 },
    ];

    const innerTrack: WallSegment[] = [
      { x1: 350, y1: 250, x2: 930, y2: 250 },
      { x1: 930, y1: 250, x2: 980, y2: 300 },
      { x1: 980, y1: 300, x2: 980, y2: 420 },
      { x1: 980, y1: 420, x2: 930, y2: 470 },
      { x1: 930, y1: 470, x2: 350, y2: 470 },
      { x1: 350, y1: 470, x2: 300, y2: 420 },
      { x1: 300, y1: 420, x2: 300, y2: 300 },
      { x1: 300, y1: 300, x2: 350, y2: 250 },
    ];

    const chicane: WallSegment[] = [
      { x1: 550, y1: 300, x2: 550, y2: 420 },
      { x1: 730, y1: 300, x2: 730, y2: 420 },
    ];

    const allSegments = [...outerTrack, ...innerTrack, ...chicane];

    for (const seg of allSegments) {
      this.createWallSegment(seg);
    }

    this.drawWalls(allSegments);
    this.drawCornerGlow(outerTrack);
  }

  private createWallSegment(seg: WallSegment): void {
    const cx = (seg.x1 + seg.x2) / 2;
    const cy = (seg.y1 + seg.y2) / 2;
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const thickness = 6;

    const wall = this.matter.add.rectangle(cx, cy, length, thickness, {
      isStatic: true,
      angle: angle,
      friction: 0.8,
      restitution: 0.3,
      label: "wall",
    });

    this.wallBodies.push(wall);
  }

  private drawWalls(segments: WallSegment[]): void {
    this.wallGraphics.lineStyle(2, GAME_CONFIG.wallColor, 0.4);
    for (const seg of segments) {
      this.wallGraphics.beginPath();
      this.wallGraphics.moveTo(seg.x1, seg.y1);
      this.wallGraphics.lineTo(seg.x2, seg.y2);
      this.wallGraphics.strokePath();
    }

    this.wallGraphics.lineStyle(1, GAME_CONFIG.wallColor, 1);
    for (const seg of segments) {
      this.wallGraphics.beginPath();
      this.wallGraphics.moveTo(seg.x1, seg.y1);
      this.wallGraphics.lineTo(seg.x2, seg.y2);
      this.wallGraphics.strokePath();
    }
  }

  private drawCornerGlow(segments: WallSegment[]): void {
    for (const seg of segments) {
      this.wallGraphics.fillStyle(GAME_CONFIG.wallColor, 0.15);
      this.wallGraphics.fillCircle(seg.x1, seg.y1, 6);
      this.wallGraphics.fillCircle(seg.x2, seg.y2, 6);
    }
  }

  private setupCamera(): void {
    this.cameras.main.setBounds(0, 0, GAME_CONFIG.width * 2, GAME_CONFIG.height * 2);
    this.cameras.main.setZoom(1);
    this.cameras.main.centerOn(640, 360);
  }

  private setupBloom(): void {
    const cam = this.cameras.main as Phaser.Cameras.Scene2D.Camera & { postFX?: { addBloom: (color: number, offsetX: number, offsetY: number, strength: number, blurStrength: number) => void } };
    if (cam.postFX) {
      cam.postFX.addBloom(0xffffff, 1, 1, GAME_CONFIG.bloomStrength, 1.2);
    }
  }

  private addHUD(): void {
    const hudStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: "'Courier New', monospace",
      fontSize: "14px",
      color: "#00ffff",
      stroke: "#003333",
      strokeThickness: 1,
    };

    this.add.text(16, 16, "DATA WING – PROTOTYPE", { ...hudStyle, fontSize: "18px", color: "#ff00ff" }).setDepth(100).setScrollFactor(0);
    this.add.text(16, 42, "↑/W Thrust  ←→/AD Steer  Hug walls for BOOST!", hudStyle).setDepth(100).setScrollFactor(0);

    const speedText = this.add.text(16, GAME_CONFIG.height - 30, "", hudStyle).setDepth(100).setScrollFactor(0);
    const boostText = this.add.text(GAME_CONFIG.width - 180, 16, "", { ...hudStyle, color: "#ffff00" }).setDepth(100).setScrollFactor(0);

    this.events.on("update", () => {
      const vel = this.ship.velocity;
      const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
      speedText.setText(`SPEED: ${(speed * 100).toFixed(0)}`);
      boostText.setText(this.ship.isBoosting ? "▸▸ BOOST ▸▸" : "");
    });
  }
}
