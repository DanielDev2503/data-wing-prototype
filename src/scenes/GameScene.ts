import Phaser from "phaser";
import { GAME_CONFIG, LevelState } from "../config";
import { PlayerShip } from "../entities/PlayerShip";
import { WallBoost } from "../systems/WallBoost";
import { NeonTrail } from "../systems/NeonTrail";

interface WallSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

class TrackBuilder {
  public x: number;
  public y: number;
  public angle: number;
  public halfWidth: number;

  public outerPoints: Phaser.Math.Vector2[] = [];
  public innerPoints: Phaser.Math.Vector2[] = [];

  constructor(startX: number, startY: number, startAngle: number, halfWidth: number) {
    this.x = startX;
    this.y = startY;
    this.angle = startAngle;
    this.halfWidth = halfWidth;

    this.addPoints(this.x, this.y, this.angle);
  }

  private addPoints(cx: number, cy: number, heading: number): void {
    const leftNormal = heading - Math.PI / 2;
    const rightNormal = heading + Math.PI / 2;

    const lx = cx + Math.cos(leftNormal) * this.halfWidth;
    const ly = cy + Math.sin(leftNormal) * this.halfWidth;

    const rx = cx + Math.cos(rightNormal) * this.halfWidth;
    const ry = cy + Math.sin(rightNormal) * this.halfWidth;

    this.outerPoints.push(new Phaser.Math.Vector2(lx, ly));
    this.innerPoints.push(new Phaser.Math.Vector2(rx, ry));
  }

  public straight(distance: number, steps = 8): void {
    const stepDist = distance / steps;
    const dirX = Math.cos(this.angle);
    const dirY = Math.sin(this.angle);

    for (let i = 1; i <= steps; i++) {
      this.x += dirX * stepDist;
      this.y += dirY * stepDist;
      this.addPoints(this.x, this.y, this.angle);
    }
  }

  public turn(radius: number, sweepAngle: number, steps = 16): void {
    const isRight = sweepAngle > 0;
    const normalAngle = this.angle + (isRight ? Math.PI / 2 : -Math.PI / 2);
    const centerX = this.x + Math.cos(normalAngle) * radius;
    const centerY = this.y + Math.sin(normalAngle) * radius;

    const startCenterAngle = Math.atan2(this.y - centerY, this.x - centerX);
    const stepAngle = sweepAngle / steps;

    for (let i = 1; i <= steps; i++) {
      const a = startCenterAngle + stepAngle * i;
      this.x = centerX + Math.cos(a) * radius;
      this.y = centerY + Math.sin(a) * radius;
      this.angle += stepAngle;
      this.addPoints(this.x, this.y, this.angle);
    }
  }
}

export class GameScene extends Phaser.Scene {
  private ship!: PlayerShip;
  private wallBoost!: WallBoost;
  private neonTrail!: NeonTrail;
  private wallGraphics!: Phaser.GameObjects.Graphics;
  private zoneGraphics!: Phaser.GameObjects.Graphics;
  private bgGraphics!: Phaser.GameObjects.Graphics;
  private pauseOverlay!: Phaser.GameObjects.Graphics;
  private completionOverlay!: Phaser.GameObjects.Graphics;
  private wallBodies: MatterJS.BodyType[] = [];

  private levelState: LevelState = LevelState.Waiting;
  private raceTimer: number = 0;
  private finalRaceTime: number = 0;
  private timerText!: Phaser.GameObjects.Text;
  private stateText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private configText!: Phaser.GameObjects.Text;
  private boostBar!: Phaser.GameObjects.Graphics;
  private pauseText!: Phaser.GameObjects.Text;
  private completionContainer!: Phaser.GameObjects.Container;
  private escKey!: Phaser.Input.Keyboard.Key;
  private rKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: "GameScene" });
  }

  create(): void {
    this.levelState = LevelState.Waiting;
    this.raceTimer = 0;
    this.finalRaceTime = 0;

    this.buildBackground();
    this.buildOrganicCircuit();
    this.buildZones();

    // Spawn player at start position facing UP (-Math.PI/2)
    this.ship = new PlayerShip(this, 600, 1600);
    this.ship.matterBody.angle = -Math.PI / 2;

    this.wallBoost = new WallBoost(this, this.ship);
    this.wallBoost.setWallBodies(this.wallBodies);
    this.neonTrail = new NeonTrail(this, this.ship);

    this.setupCollisionHandler();
    this.setupCamera();
    this.setupBloom();
    this.buildHUD();
    this.setupPause();
    this.setupCompletionUI();

    // Key shortcut R to restart anytime
    this.rKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.rKey.on("down", () => {
      this.scene.restart();
    });
  }

  update(_time: number, delta: number): void {
    if (this.levelState === LevelState.Paused || this.levelState === LevelState.Completed) {
      this.ship.update(delta);
      return;
    }

    this.ship.update(delta);
    this.wallBoost.update();
    this.neonTrail.update(delta);

    if (this.levelState === LevelState.Playing) {
      this.raceTimer += delta;
    }

    this.updateHUD();
  }

  private buildBackground(): void {
    this.bgGraphics = this.add.graphics();
    this.bgGraphics.setDepth(0);

    const gridSize = 100;
    const w = GAME_CONFIG.worldWidth;
    const h = GAME_CONFIG.worldHeight;

    this.bgGraphics.lineStyle(1, 0x0a0a1a, 0.4);
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

  private buildOrganicCircuit(): void {
    this.wallGraphics = this.add.graphics();
    this.wallGraphics.setDepth(2);

    const builder = new TrackBuilder(600, 1800, -Math.PI / 2, 140);

    builder.straight(1000, 10);
    builder.turn(400, Math.PI, 18);
    builder.straight(400, 6);
    builder.turn(250, -Math.PI / 2, 12);
    builder.turn(250, Math.PI / 2, 12);
    builder.straight(100, 2);
    builder.turn(650, Math.PI, 24);

    const outerSegments = this.pointsToSegments(builder.outerPoints);
    const innerSegments = this.pointsToSegments(builder.innerPoints);

    const allSegments = [...outerSegments, ...innerSegments];

    for (const seg of allSegments) {
      this.createWallBody(seg);
    }

    this.drawWalls(outerSegments, GAME_CONFIG.wallColor);
    this.drawWalls(innerSegments, GAME_CONFIG.wallColor);
    this.drawCornerGlow(builder.outerPoints);
    this.drawCornerGlow(builder.innerPoints);
  }

  private pointsToSegments(points: Phaser.Math.Vector2[]): WallSegment[] {
    const segs: WallSegment[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      segs.push({
        x1: points[i].x,
        y1: points[i].y,
        x2: points[i + 1].x,
        y2: points[i + 1].y,
      });
    }
    return segs;
  }

  private createWallBody(seg: WallSegment): void {
    const cx = (seg.x1 + seg.x2) / 2;
    const cy = (seg.y1 + seg.y2) / 2;
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < 1) return;
    const angle = Math.atan2(dy, dx);

    const wall = this.matter.add.rectangle(cx, cy, length, 8, {
      isStatic: true,
      angle: angle,
      friction: 0.5,
      restitution: 0.25,
      label: "wall",
    });

    this.wallBodies.push(wall);
  }

  private drawWalls(segments: WallSegment[], color: number): void {
    this.wallGraphics.lineStyle(4, color, 0.3);
    for (const seg of segments) {
      this.wallGraphics.beginPath();
      this.wallGraphics.moveTo(seg.x1, seg.y1);
      this.wallGraphics.lineTo(seg.x2, seg.y2);
      this.wallGraphics.strokePath();
    }

    this.wallGraphics.lineStyle(1.8, color, 0.95);
    for (const seg of segments) {
      this.wallGraphics.beginPath();
      this.wallGraphics.moveTo(seg.x1, seg.y1);
      this.wallGraphics.lineTo(seg.x2, seg.y2);
      this.wallGraphics.strokePath();
    }
  }

  private drawCornerGlow(points: Phaser.Math.Vector2[]): void {
    for (let i = 0; i < points.length; i += 4) {
      this.wallGraphics.fillStyle(GAME_CONFIG.wallColor, 0.15);
      this.wallGraphics.fillCircle(points[i].x, points[i].y, 4);
    }
  }

  private buildZones(): void {
    this.zoneGraphics = this.add.graphics();
    this.zoneGraphics.setDepth(1);

    this.createZone(600, 1600, 275, 60, GAME_CONFIG.startZoneColor, "startZone");
    this.createZone(600, 1750, 275, 60, GAME_CONFIG.finishZoneColor, "finishZone");
  }

  private createZone(x: number, y: number, w: number, h: number, color: number, label: string): void {
    this.matter.add.rectangle(x, y, w, h, {
      isStatic: true,
      isSensor: true,
      label: label,
    });

    this.zoneGraphics.lineStyle(2, color, 0.7);
    this.zoneGraphics.strokeRect(x - w / 2, y - h / 2, w, h);
    this.zoneGraphics.fillStyle(color, 0.1);
    this.zoneGraphics.fillRect(x - w / 2, y - h / 2, w, h);

    const labelText = label === "startZone" ? "START LINE" : "FINISH LINE";
    this.add.text(x, y, labelText, {
      fontFamily: "'Courier New', monospace",
      fontSize: "14px",
      color: "#" + color.toString(16).padStart(6, "0"),
    }).setOrigin(0.5, 0.5).setDepth(2);
  }

  private setupCollisionHandler(): void {
    this.matter.world.on("collisionstart", (_event: unknown, bodyA: MatterJS.BodyType, bodyB: MatterJS.BodyType) => {
      const ship = this.ship.matterBody;
      const aId = (bodyA as unknown as { id: number }).id;
      const bId = (bodyB as unknown as { id: number }).id;
      const sId = (ship as unknown as { id: number }).id;
      const isShipA = aId === sId;
      const isShipB = bId === sId;

      if (!isShipA && !isShipB) return;

      const other = isShipA ? bodyB : bodyA;

      if (other.label === "wall") {
        type PairWithIds = { bodyA: { id: number }; bodyB: { id: number } };
        const pairs = (this.matter.world.engine as unknown as { pairs: { list: MatterJS.IPair[] } }).pairs.list;
        const shipId = (ship as unknown as { id: number }).id;
        const otherId = (other as unknown as { id: number }).id;
        const pair = pairs.find(p => {
          const pa = p as unknown as PairWithIds;
          return (pa.bodyA.id === shipId && pa.bodyB.id === otherId) ||
                 (pa.bodyB.id === shipId && pa.bodyA.id === otherId);
        });
        if (pair) {
          this.ship.onWallCollision(other, pair);
        }
      }

      if (other.label === "startZone" && this.levelState === LevelState.Waiting) {
        this.levelState = LevelState.Playing;
        this.raceTimer = 0;
      }

      if (other.label === "finishZone" && this.levelState === LevelState.Playing) {
        this.levelState = LevelState.Completed;
        this.finalRaceTime = this.raceTimer;
        this.ship.freeze();
        this.showCompletionScreen();
      }
    });
  }

  private setupCamera(): void {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, GAME_CONFIG.worldWidth, GAME_CONFIG.worldHeight);
    cam.setZoom(GAME_CONFIG.cameraZoom);

    const shipBody = this.ship.matterBody;
    const follower = this.add.circle(shipBody.position.x, shipBody.position.y, 1, 0x000000, 0).setDepth(-1);

    this.events.on("update", () => {
      follower.setPosition(shipBody.position.x, shipBody.position.y);
    });

    cam.startFollow(follower, false, GAME_CONFIG.cameraLerp, GAME_CONFIG.cameraLerp);
  }

  private setupBloom(): void {
    const cam = this.cameras.main as Phaser.Cameras.Scene2D.Camera & {
      postFX?: { addBloom: (color: number, offsetX: number, offsetY: number, strength: number, blurStrength: number) => void }
    };
    if (cam.postFX) {
      cam.postFX.addBloom(0xffffff, 1, 1, GAME_CONFIG.bloomStrength, 1.2);
    }
  }

  private buildHUD(): void {
    const hudStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: "'Courier New', monospace",
      fontSize: "14px",
      color: "#00ffff",
      stroke: "#001a1a",
      strokeThickness: 2,
    };

    this.add.text(16, 16, "DATA WING", {
      ...hudStyle, fontSize: "20px", color: "#ff00ff",
    }).setDepth(100).setScrollFactor(0);

    this.add.text(16, 42, "←→/A-D Steer | A+D/←+→ Brake | R Restart | ESC Pause", {
      ...hudStyle, fontSize: "11px",
    }).setDepth(100).setScrollFactor(0);

    this.timerText = this.add.text(GAME_CONFIG.width - 16, 16, "00:00.000", {
      ...hudStyle, fontSize: "18px", color: "#ffffff",
    }).setOrigin(1, 0).setDepth(100).setScrollFactor(0);

    this.stateText = this.add.text(GAME_CONFIG.width / 2, 50, "CROSS START LINE TO BEGIN", {
      ...hudStyle, fontSize: "16px", color: "#00ff88",
    }).setOrigin(0.5, 0.5).setDepth(100).setScrollFactor(0);

    this.speedText = this.add.text(16, GAME_CONFIG.height - 30, "", hudStyle).setDepth(100).setScrollFactor(0);

    this.configText = this.add.text(16, 68, "", {
      ...hudStyle,
      fontSize: "11px",
      color: "#ff8800",
    }).setDepth(100).setScrollFactor(0);

    this.boostBar = this.add.graphics();
    this.boostBar.setDepth(100);
    this.boostBar.setScrollFactor(0);
  }

  private setupPause(): void {
    this.pauseOverlay = this.add.graphics();
    this.pauseOverlay.setDepth(200);
    this.pauseOverlay.setScrollFactor(0);
    this.pauseOverlay.setVisible(false);

    this.pauseText = this.add.text(GAME_CONFIG.width / 2, GAME_CONFIG.height / 2, "PAUSED\n\nPress ESC to resume", {
      fontFamily: "'Courier New', monospace",
      fontSize: "28px",
      color: "#ff00ff",
      align: "center",
      stroke: "#330033",
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5).setDepth(201).setScrollFactor(0).setVisible(false);

    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.escKey.on("down", () => {
      if (this.levelState === LevelState.Playing) {
        this.pauseGame();
      } else if (this.levelState === LevelState.Paused) {
        this.resumeGame();
      }
    });
  }

  private setupCompletionUI(): void {
    this.completionOverlay = this.add.graphics();
    this.completionOverlay.setDepth(300);
    this.completionOverlay.setScrollFactor(0);
    this.completionOverlay.setVisible(false);

    this.completionContainer = this.add.container(GAME_CONFIG.width / 2, GAME_CONFIG.height / 2);
    this.completionContainer.setDepth(301);
    this.completionContainer.setScrollFactor(0);
    this.completionContainer.setVisible(false);
  }

  private showCompletionScreen(): void {
    const formattedTime = this.formatTime(this.finalRaceTime);

    this.completionOverlay.clear();
    this.completionOverlay.fillStyle(0x000000, 0.82);
    this.completionOverlay.fillRect(0, 0, GAME_CONFIG.width, GAME_CONFIG.height);
    this.completionOverlay.setVisible(true);

    this.completionContainer.removeAll(true);

    const titleText = this.add.text(0, -90, "★ CIRCUIT COMPLETED ★", {
      fontFamily: "'Courier New', monospace",
      fontSize: "32px",
      color: "#00ffff",
      stroke: "#004444",
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5);

    const timeLabel = this.add.text(0, -20, "FINAL TIME", {
      fontFamily: "'Courier New', monospace",
      fontSize: "16px",
      color: "#aaaaaa",
    }).setOrigin(0.5, 0.5);

    const timeValue = this.add.text(0, 20, formattedTime, {
      fontFamily: "'Courier New', monospace",
      fontSize: "46px",
      color: "#ffff00",
      stroke: "#444400",
      strokeThickness: 4,
    }).setOrigin(0.5, 0.5);

    const restartHint = this.add.text(0, 90, "[ PRESS 'R' TO RESTART CIRCUIT ]", {
      fontFamily: "'Courier New', monospace",
      fontSize: "18px",
      color: "#ff00ff",
      stroke: "#330033",
      strokeThickness: 2,
    }).setOrigin(0.5, 0.5);

    this.completionContainer.add([titleText, timeLabel, timeValue, restartHint]);
    this.completionContainer.setVisible(true);
  }

  private pauseGame(): void {
    this.levelState = LevelState.Paused;
    this.matter.world.pause();
    this.ship.freeze();

    this.pauseOverlay.clear();
    this.pauseOverlay.fillStyle(0x000000, 0.7);
    this.pauseOverlay.fillRect(0, 0, GAME_CONFIG.width, GAME_CONFIG.height);
    this.pauseOverlay.setVisible(true);
    this.pauseText.setVisible(true);
  }

  private resumeGame(): void {
    this.levelState = LevelState.Playing;
    this.matter.world.resume();
    this.ship.unfreeze();

    this.pauseOverlay.setVisible(false);
    this.pauseText.setVisible(false);
  }

  private formatTime(timeMs: number): string {
    const totalMs = Math.floor(timeMs);
    const minutes = Math.floor(totalMs / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
  }

  private updateHUD(): void {
    const vel = this.ship.velocity;
    const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    this.speedText.setText(`SPEED: ${(speed * 100).toFixed(0)}`);

    this.configText.setText(
      `[ CONFIG VARIABLES ]\n` +
      `THRUST FORCE: ${GAME_CONFIG.thrustForce}\n` +
      `BOOST FORCE: ${GAME_CONFIG.boostForce}\n` +
      `BOOST PROXIMITY EXPONENT: ${GAME_CONFIG.boostProximityExponent}\n` +
      `BOOST DECELERATION: ${GAME_CONFIG.boostDeceleration}\n` +
      `BOOST RAY LENGTH: ${GAME_CONFIG.boostRayLength}\n` +
      `BOOST RAY ANGLE: ${GAME_CONFIG.boostRayAngle}\n` +
      `BOOST CENTER OFFSET: ${GAME_CONFIG.boostCenterOffset}\n` +
      `WALL RECOIL FORCE: ${GAME_CONFIG.wallRecoilForce}\n` +
      `WALL STUN DURATION: ${GAME_CONFIG.wallStunDuration}ms`
    );

    const currentDisplayTime = this.levelState === LevelState.Completed ? this.finalRaceTime : this.raceTimer;
    this.timerText.setText(this.formatTime(currentDisplayTime));

    switch (this.levelState) {
      case LevelState.Waiting:
        this.stateText.setText("CROSS START LINE TO BEGIN");
        this.stateText.setColor("#00ff88");
        this.stateText.setVisible(true);
        break;
      case LevelState.Playing:
        this.stateText.setVisible(false);
        break;
      case LevelState.Completed:
        this.stateText.setVisible(false);
        break;
      default:
        break;
    }

    this.boostBar.clear();
    const boost = this.ship.currentBoostLevel;
    if (boost > 0.01) {
      const barW = 140;
      const barH = 10;
      const bx = GAME_CONFIG.width / 2 - barW / 2;
      const by = GAME_CONFIG.height - 35;

      this.boostBar.lineStyle(1, 0x555555, 0.8);
      this.boostBar.strokeRect(bx, by, barW, barH);

      const fillColor = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(GAME_CONFIG.shipColor),
        Phaser.Display.Color.ValueToColor(GAME_CONFIG.boostColor),
        1, boost
      );
      const hexColor = Phaser.Display.Color.GetColor(fillColor.r, fillColor.g, fillColor.b);

      this.boostBar.fillStyle(hexColor, 0.85);
      this.boostBar.fillRect(bx + 1, by + 1, (barW - 2) * boost, barH - 2);
    }
  }
}
