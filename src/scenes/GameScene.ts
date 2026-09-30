import Phaser from "phaser";
import { GAME_CONFIG, LevelState } from "../config";
import { PlayerShip } from "../entities/PlayerShip";
import { WallBoost, TrackSegment } from "../systems/WallBoost";
import { NeonTrail } from "../systems/NeonTrail";

interface SplinePoint {
  x: number;
  y: number;
}

export class GameScene extends Phaser.Scene {
  private ship!: PlayerShip;
  private wallBoost!: WallBoost;
  private neonTrail!: NeonTrail;

  // Graphics layers
  private bgGraphics!: Phaser.GameObjects.Graphics;
  private trackFloorGraphics!: Phaser.GameObjects.Graphics;
  private wallGraphics!: Phaser.GameObjects.Graphics;
  private zoneGraphics!: Phaser.GameObjects.Graphics;
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private pauseOverlay!: Phaser.GameObjects.Graphics;
  private completionOverlay!: Phaser.GameObjects.Graphics;

  // Track data
  private trackSegments: TrackSegment[] = [];
  private cameraAnchor!: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;

  // Game state
  private levelState: LevelState = LevelState.Waiting;
  private raceTimer: number = 0;
  private finalRaceTime: number = 0;
  private hasReachedHalfwayCheckpoint: boolean = false;

  // HUD text objects
  private timerText!: Phaser.GameObjects.Text;
  private stateText!: Phaser.GameObjects.Text;
  private speedText!: Phaser.GameObjects.Text;
  private pauseText!: Phaser.GameObjects.Text;
  private completionContainer!: Phaser.GameObjects.Container;

  // Keys
  private escKey!: Phaser.Input.Keyboard.Key;
  private rKey!: Phaser.Input.Keyboard.Key;

  // Preallocated formatted string buffer components to minimize GC
  private cachedSpeedVal: number = -1;

  constructor() {
    super({ key: "GameScene" });
  }

  create(): void {
    this.levelState = LevelState.Waiting;
    this.raceTimer = 0;
    this.finalRaceTime = 0;
    this.hasReachedHalfwayCheckpoint = false;
    this.trackSegments = [];

    this.buildCyberGrid();
    this.buildSmoothCurvedCircuit();
    this.buildSensorsAndZones();

    // Spawn player at start position on the track, facing North (-PI/2)
    const spawnX = 700;
    const spawnY = 2250;
    this.ship = new PlayerShip(this, spawnX, spawnY);
    this.ship.matterBody.angle = -Math.PI / 2;

    this.wallBoost = new WallBoost(this, this.ship);
    this.wallBoost.setSegments(this.trackSegments);

    this.neonTrail = new NeonTrail(this, this.ship);

    this.setupCollisionEvents();
    this.setupCameraFollow();
    this.setupPostFXBloom();
    this.buildHUD();
    this.setupPauseSystem();
    this.setupCompletionUI();

    // Global quick restart key: R
    this.rKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.rKey.on("down", () => {
      this.scene.restart();
    });
  }

  update(_time: number, delta: number): void {
    if (this.levelState === LevelState.Paused) {
      return;
    }

    if (this.levelState === LevelState.Completed) {
      this.ship.update(delta);
      this.updateCameraAnchor();
      return;
    }

    // Kinematic updates
    this.ship.update(delta);
    this.wallBoost.update();
    this.neonTrail.update(delta);

    if (this.levelState === LevelState.Playing) {
      this.raceTimer += delta;
    }

    this.updateCameraAnchor();
    this.updateHUD();
  }

  private buildCyberGrid(): void {
    this.bgGraphics = this.add.graphics();
    this.bgGraphics.setDepth(0);

    const w = GAME_CONFIG.worldWidth;
    const h = GAME_CONFIG.worldHeight;
    const step = 80;

    this.bgGraphics.lineStyle(1, 0x0c1122, 0.45);
    for (let x = 0; x <= w; x += step) {
      this.bgGraphics.beginPath();
      this.bgGraphics.moveTo(x, 0);
      this.bgGraphics.lineTo(x, h);
      this.bgGraphics.strokePath();
    }
    for (let y = 0; y <= h; y += step) {
      this.bgGraphics.beginPath();
      this.bgGraphics.moveTo(0, y);
      this.bgGraphics.lineTo(w, y);
      this.bgGraphics.strokePath();
    }
  }

  /**
   * Generates a procedural smooth curved race track via Catmull-Rom spline interpolation,
   * constructing continuous wall bodies and zero-gap collision boundaries.
   */
  private buildSmoothCurvedCircuit(): void {
    this.trackFloorGraphics = this.add.graphics().setDepth(1);
    this.wallGraphics = this.add.graphics().setDepth(2);

    // High-level racing track control nodes (smooth circuit layout)
    const controlNodes: SplinePoint[] = [
      { x: 700, y: 2200 },  // 0: Start line heading North
      { x: 700, y: 1400 },  // 1: North straightaway
      { x: 800, y: 920 },   // 2: Sweeping entrance into turn 1
      { x: 1250, y: 680 },  // 3: Sweeping curve East
      { x: 1850, y: 720 },  // 4: Technical North-East section
      { x: 2250, y: 1050 }, // 5: Chicane left
      { x: 2600, y: 950 },  // 6: Chicane right
      { x: 3150, y: 1150 }, // 7: Hairpin entry
      { x: 3450, y: 1750 }, // 8: Parabolic 180-degree banking apex (Wall-boost paradise)
      { x: 3250, y: 2350 }, // 9: Hairpin exit swinging West
      { x: 2700, y: 2600 }, // 10: High-speed downhill straight
      { x: 1850, y: 2600 }, // 11: Southern straight
      { x: 1150, y: 2550 }, // 12: Approach curve
      { x: 750, y: 2420 },  // 13: Final banking curve into straightaway
    ];

    // Spline sampling
    const numSamples = 160;
    const splinePoints: SplinePoint[] = [];

    for (let i = 0; i < numSamples; i++) {
      const t = i / numSamples;
      const pt = this.sampleCatmullRom(controlNodes, t);
      splinePoints.push(pt);
    }

    const halfWidth = 140; // 280px wide track
    const leftPoints: SplinePoint[] = [];
    const rightPoints: SplinePoint[] = [];

    // Calculate perpendicular track boundaries
    for (let i = 0; i < splinePoints.length; i++) {
      const prev = splinePoints[(i - 1 + splinePoints.length) % splinePoints.length];
      const next = splinePoints[(i + 1) % splinePoints.length];

      let dx = next.x - prev.x;
      let dy = next.y - prev.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0.0001) {
        dx /= len;
        dy /= len;
      }

      // Normal perpendicular to track direction
      const nx = -dy;
      const ny = dx;

      const curr = splinePoints[i];
      leftPoints.push({
        x: curr.x + nx * halfWidth,
        y: curr.y + ny * halfWidth,
      });
      rightPoints.push({
        x: curr.x - nx * halfWidth,
        y: curr.y - ny * halfWidth,
      });
    }

    // Draw dark asphalt floor
    this.trackFloorGraphics.fillStyle(0x040812, 0.95);
    for (let i = 0; i < splinePoints.length; i++) {
      const nextIdx = (i + 1) % splinePoints.length;
      this.trackFloorGraphics.beginPath();
      this.trackFloorGraphics.moveTo(leftPoints[i].x, leftPoints[i].y);
      this.trackFloorGraphics.lineTo(leftPoints[nextIdx].x, leftPoints[nextIdx].y);
      this.trackFloorGraphics.lineTo(rightPoints[nextIdx].x, rightPoints[nextIdx].y);
      this.trackFloorGraphics.lineTo(rightPoints[i].x, rightPoints[i].y);
      this.trackFloorGraphics.closePath();
      this.trackFloorGraphics.fillPath();
    }

    // Draw subtle track centerline markers
    this.trackFloorGraphics.lineStyle(1.5, 0x00f0ff, 0.12);
    for (let i = 0; i < splinePoints.length; i += 2) {
      const nextIdx = (i + 1) % splinePoints.length;
      this.trackFloorGraphics.beginPath();
      this.trackFloorGraphics.moveTo(splinePoints[i].x, splinePoints[i].y);
      this.trackFloorGraphics.lineTo(splinePoints[nextIdx].x, splinePoints[nextIdx].y);
      this.trackFloorGraphics.strokePath();
    }

    // Create physics and visual wall segments for left and right boundaries
    this.buildWallChain(leftPoints, true);
    this.buildWallChain(rightPoints, false);
  }

  private buildWallChain(points: SplinePoint[], isLeft: boolean): void {
    const wallColor = GAME_CONFIG.wallColor;
    const count = points.length;

    for (let i = 0; i < count; i++) {
      const nextIdx = (i + 1) % count;
      const p1 = points[i];
      const p2 = points[nextIdx];

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) continue;

      const midX = (p1.x + p2.x) * 0.5;
      const midY = (p1.y + p2.y) * 0.5;
      const angle = Math.atan2(dy, dx);

      // Normal pointing inward towards track center
      let nx = -dy / len;
      let ny = dx / len;
      if (!isLeft) {
        nx = -nx;
        ny = -ny;
      }

      const tx = -ny;
      const ty = nx;

      // Matter static wall segment body with +3px length overlap to eliminate caught seams
      this.matter.add.rectangle(midX, midY, len + 3, 14, {
        isStatic: true,
        angle: angle,
        friction: 0.0,
        restitution: 0.2,
        label: "wall",
      });

      // Register segment for continuous WallBoost proximity calculations
      this.trackSegments.push({
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        midX: midX,
        midY: midY,
        nx: nx,
        ny: ny,
        tx: tx,
        ty: ty,
        length: len,
        lengthSq: len * len,
      });

      // Multi-pass neon glow visual rendering
      // 1. Broad soft ambient glow
      this.wallGraphics.lineStyle(5, wallColor, 0.2);
      this.wallGraphics.beginPath();
      this.wallGraphics.moveTo(p1.x, p1.y);
      this.wallGraphics.lineTo(p2.x, p2.y);
      this.wallGraphics.strokePath();

      // 2. High-intensity crisp neon core line
      this.wallGraphics.lineStyle(2, wallColor, 0.95);
      this.wallGraphics.beginPath();
      this.wallGraphics.moveTo(p1.x, p1.y);
      this.wallGraphics.lineTo(p2.x, p2.y);
      this.wallGraphics.strokePath();

      // Periodic wall nodes
      if (i % 6 === 0) {
        this.wallGraphics.fillStyle(0xffffff, 0.9);
        this.wallGraphics.fillCircle(p1.x, p1.y, 2.5);
      }
    }
  }

  private sampleCatmullRom(pts: SplinePoint[], tGlobal: number): SplinePoint {
    const n = pts.length;
    const clampedT = Phaser.Math.Clamp(tGlobal, 0, 0.999999);
    const scaled = clampedT * n;
    const idx = Math.floor(scaled);
    const t = scaled - idx;

    const p0 = pts[(idx - 1 + n) % n];
    const p1 = pts[idx % n];
    const p2 = pts[(idx + 1) % n];
    const p3 = pts[(idx + 2) % n];

    const t2 = t * t;
    const t3 = t2 * t;

    const v0x = (p2.x - p0.x) * 0.5;
    const v0y = (p2.y - p0.y) * 0.5;
    const v1x = (p3.x - p1.x) * 0.5;
    const v1y = (p3.y - p1.y) * 0.5;

    const x = (2 * p1.x - 2 * p2.x + v0x + v1x) * t3 +
              (-3 * p1.x + 3 * p2.x - 2 * v0x - v1x) * t2 +
              v0x * t + p1.x;

    const y = (2 * p1.y - 2 * p2.y + v0y + v1y) * t3 +
              (-3 * p1.y + 3 * p2.y - 2 * v0y - v1y) * t2 +
              v0y * t + p1.y;

    return { x, y };
  }

  private buildSensorsAndZones(): void {
    this.zoneGraphics = this.add.graphics().setDepth(2);

    // Start Line sensor (at x=700, y=2150, spanning track)
    this.createSensorLine(700, 2150, 276, 50, 0, GAME_CONFIG.startZoneColor, "startZone", "START LINE");

    // Halfway Checkpoint (at hairpin apex x=3450, y=1750) to prevent lap short-circuiting
    this.matter.add.rectangle(3450, 1750, 276, 80, {
      isStatic: true,
      isSensor: true,
      label: "checkpointZone",
    });

    // Finish Line sensor (at x=700, y=2050, just after the start line on the main straightaway)
    this.createSensorLine(700, 2050, 276, 50, 0, GAME_CONFIG.finishZoneColor, "finishZone", "FINISH LINE");
  }

  private createSensorLine(
    cx: number,
    cy: number,
    w: number,
    h: number,
    angle: number,
    color: number,
    label: string,
    labelText: string
  ): void {
    this.matter.add.rectangle(cx, cy, w, h, {
      isStatic: true,
      isSensor: true,
      angle: angle,
      label: label,
    });

    this.zoneGraphics.lineStyle(2, color, 0.8);
    this.zoneGraphics.strokeRect(cx - w * 0.5, cy - h * 0.5, w, h);
    this.zoneGraphics.fillStyle(color, 0.15);
    this.zoneGraphics.fillRect(cx - w * 0.5, cy - h * 0.5, w, h);

    this.add.text(cx, cy, labelText, {
      fontFamily: "'Courier New', monospace",
      fontSize: "14px",
      fontStyle: "bold",
      color: "#" + color.toString(16).padStart(6, "0"),
    }).setOrigin(0.5, 0.5).setDepth(3);
  }

  private setupCollisionEvents(): void {
    this.matter.world.on(
      "collisionstart",
      (event: Phaser.Physics.Matter.Events.CollisionStartEvent) => {
        const shipBody = this.ship.matterBody;
        const pairs = event.pairs;

        for (let i = 0; i < pairs.length; i++) {
          const pair = pairs[i];
          const isA = pair.bodyA === shipBody;
          const isB = pair.bodyB === shipBody;

          if (!isA && !isB) continue;

          const other = isA ? pair.bodyB : pair.bodyA;

          if (other.label === "wall") {
            // Determine normal pointing towards the ship
            let nx = pair.collision.normal.x;
            let ny = pair.collision.normal.y;

            if (isA) {
              nx = -nx;
              ny = -ny;
            }

            const len = Math.sqrt(nx * nx + ny * ny);
            if (len > 0.0001) {
              nx /= len;
              ny /= len;
            } else {
              nx = 0;
              ny = -1;
            }

            this.ship.onWallCollision(nx, ny);
          }

          if (other.label === "startZone") {
            if (this.levelState === LevelState.Waiting) {
              this.levelState = LevelState.Playing;
              this.raceTimer = 0;
              this.hasReachedHalfwayCheckpoint = false;
            }
          }

          if (other.label === "checkpointZone") {
            if (this.levelState === LevelState.Playing) {
              this.hasReachedHalfwayCheckpoint = true;
            }
          }

          if (other.label === "finishZone") {
            if (this.levelState === LevelState.Playing && this.hasReachedHalfwayCheckpoint) {
              this.levelState = LevelState.Completed;
              this.finalRaceTime = this.raceTimer;
              this.ship.freeze();
              this.showCompletionScreen();
            }
          }
        }
      }
    );
  }

  private setupCameraFollow(): void {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, GAME_CONFIG.worldWidth, GAME_CONFIG.worldHeight);
    cam.setZoom(GAME_CONFIG.cameraZoom);

    // Follower anchor for smooth lerping and velocity lookahead
    this.cameraAnchor = this.add.circle(this.ship.x, this.ship.y, 1, 0x000000, 0).setDepth(-1);
    cam.startFollow(this.cameraAnchor, false, GAME_CONFIG.cameraLerp, GAME_CONFIG.cameraLerp);
  }

  private updateCameraAnchor(): void {
    // Lead camera slightly ahead in the direction of velocity for dynamic game feel
    const vx = this.ship.velocity.x;
    const vy = this.ship.velocity.y;
    const lookaheadX = this.ship.x + vx * 12;
    const lookaheadY = this.ship.y + vy * 12;

    this.cameraAnchor.setPosition(lookaheadX, lookaheadY);
  }

  private setupPostFXBloom(): void {
    const cam = this.cameras.main as Phaser.Cameras.Scene2D.Camera & {
      postFX?: { addBloom: (color: number, offsetX: number, offsetY: number, strength: number, blurStrength: number) => void };
    };

    if (cam.postFX && typeof cam.postFX.addBloom === "function") {
      cam.postFX.addBloom(0xffffff, 1, 1, GAME_CONFIG.bloomStrength, 1.2);
    }
  }

  private buildHUD(): void {
    const hudStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: "'Courier New', monospace",
      fontSize: "14px",
      color: "#00ffff",
      stroke: "#020713",
      strokeThickness: 3,
    };

    this.add.text(18, 16, "DATA WING", {
      ...hudStyle,
      fontSize: "22px",
      fontStyle: "bold",
      color: "#ff007f",
    }).setDepth(100).setScrollFactor(0);

    this.add.text(18, 44, "←→/A-D: Steer | A+D/←+→: Dual Brake | R: Restart | ESC: Pause", {
      ...hudStyle,
      fontSize: "11px",
      color: "#88ccff",
    }).setDepth(100).setScrollFactor(0);

    this.timerText = this.add.text(GAME_CONFIG.width - 18, 16, "00:00.000", {
      ...hudStyle,
      fontSize: "24px",
      fontStyle: "bold",
      color: "#ffffff",
    }).setOrigin(1, 0).setDepth(100).setScrollFactor(0);

    this.stateText = this.add.text(GAME_CONFIG.width * 0.5, 48, "CROSS START LINE TO BEGIN", {
      ...hudStyle,
      fontSize: "15px",
      fontStyle: "bold",
      color: "#00ff88",
    }).setOrigin(0.5, 0.5).setDepth(100).setScrollFactor(0);

    this.speedText = this.add.text(18, GAME_CONFIG.height - 32, "SPEED: 000", {
      ...hudStyle,
      fontSize: "16px",
      fontStyle: "bold",
      color: "#00ffff",
    }).setDepth(100).setScrollFactor(0);

    this.hudGraphics = this.add.graphics().setDepth(100).setScrollFactor(0);
  }

  private setupPauseSystem(): void {
    this.pauseOverlay = this.add.graphics().setDepth(200).setScrollFactor(0).setVisible(false);

    this.pauseText = this.add.text(
      GAME_CONFIG.width * 0.5,
      GAME_CONFIG.height * 0.5,
      "PAUSED\n\n[ PRESS ESC TO RESUME ]\n[ PRESS R TO RESTART ]",
      {
        fontFamily: "'Courier New', monospace",
        fontSize: "26px",
        fontStyle: "bold",
        color: "#ff007f",
        align: "center",
        stroke: "#110022",
        strokeThickness: 4,
      }
    ).setOrigin(0.5, 0.5).setDepth(201).setScrollFactor(0).setVisible(false);

    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.escKey.on("down", () => {
      if (this.levelState === LevelState.Playing || this.levelState === LevelState.Waiting) {
        this.pauseGame();
      } else if (this.levelState === LevelState.Paused) {
        this.resumeGame();
      }
    });
  }

  private pauseGame(): void {
    this.levelState = LevelState.Paused;
    this.matter.world.pause();

    this.pauseOverlay.clear();
    this.pauseOverlay.fillStyle(0x02040a, 0.78);
    this.pauseOverlay.fillRect(0, 0, GAME_CONFIG.width, GAME_CONFIG.height);
    this.pauseOverlay.setVisible(true);
    this.pauseText.setVisible(true);
  }

  private resumeGame(): void {
    this.levelState = LevelState.Playing;
    this.matter.world.resume();

    this.pauseOverlay.setVisible(false);
    this.pauseText.setVisible(false);
  }

  private setupCompletionUI(): void {
    this.completionOverlay = this.add.graphics().setDepth(300).setScrollFactor(0).setVisible(false);

    this.completionContainer = this.add.container(GAME_CONFIG.width * 0.5, GAME_CONFIG.height * 0.5);
    this.completionContainer.setDepth(301).setScrollFactor(0).setVisible(false);
  }

  private showCompletionScreen(): void {
    const formatted = this.formatTime(this.finalRaceTime);

    this.completionOverlay.clear();
    this.completionOverlay.fillStyle(0x02040e, 0.85);
    this.completionOverlay.fillRect(0, 0, GAME_CONFIG.width, GAME_CONFIG.height);
    this.completionOverlay.setVisible(true);

    this.completionContainer.removeAll(true);

    const banner = this.add.text(0, -90, "★ CIRCUIT CLEARED ★", {
      fontFamily: "'Courier New', monospace",
      fontSize: "32px",
      fontStyle: "bold",
      color: "#00ffff",
      stroke: "#003344",
      strokeThickness: 4,
    }).setOrigin(0.5, 0.5);

    const label = this.add.text(0, -20, "OFFICIAL LAP TIME", {
      fontFamily: "'Courier New', monospace",
      fontSize: "15px",
      color: "#88aacc",
    }).setOrigin(0.5, 0.5);

    const time = this.add.text(0, 24, formatted, {
      fontFamily: "'Courier New', monospace",
      fontSize: "48px",
      fontStyle: "bold",
      color: "#ffe600",
      stroke: "#332200",
      strokeThickness: 5,
    }).setOrigin(0.5, 0.5);

    const hint = this.add.text(0, 100, "[ PRESS 'R' TO RESTART CIRCUIT ]", {
      fontFamily: "'Courier New', monospace",
      fontSize: "17px",
      fontStyle: "bold",
      color: "#ff007f",
      stroke: "#220011",
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5);

    this.completionContainer.add([banner, label, time, hint]);
    this.completionContainer.setVisible(true);
  }

  private formatTime(msTotal: number): string {
    const total = Math.floor(msTotal);
    const mins = Math.floor(total / 60000);
    const secs = Math.floor((total % 60000) / 1000);
    const ms = total % 1000;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
  }

  private updateHUD(): void {
    const speed = this.ship.speed;
    const roundedSpeed = Math.round(speed * 100);

    if (roundedSpeed !== this.cachedSpeedVal) {
      this.cachedSpeedVal = roundedSpeed;
      this.speedText.setText(`SPEED: ${roundedSpeed.toString().padStart(3, "0")}`);
      if (this.ship.isBoosting) {
        this.speedText.setColor("#ff007f");
      } else {
        this.speedText.setColor("#00ffff");
      }
    }

    const currentDisplayTime = this.levelState === LevelState.Completed
      ? this.finalRaceTime
      : this.raceTimer;
    this.timerText.setText(this.formatTime(currentDisplayTime));

    if (this.levelState === LevelState.Waiting) {
      this.stateText.setText("CROSS START LINE TO BEGIN");
      this.stateText.setColor("#00ff88");
      this.stateText.setVisible(true);
    } else if (this.ship.isStunned) {
      this.stateText.setText("⚠ IMPACT RECOIL - STUNNED ⚠");
      this.stateText.setColor("#ff2244");
      this.stateText.setVisible(true);
    } else if (this.ship.isBraking) {
      this.stateText.setText("⚡ DUAL BRAKE ENGAGED ⚡");
      this.stateText.setColor("#ffaa00");
      this.stateText.setVisible(true);
    } else {
      this.stateText.setVisible(false);
    }

    // Dynamic Wall-Boost Gauge Bar at the bottom center
    this.hudGraphics.clear();
    const boost = this.ship.currentBoostLevel;

    const barW = 180;
    const barH = 12;
    const bx = (GAME_CONFIG.width - barW) * 0.5;
    const by = GAME_CONFIG.height - 34;

    this.hudGraphics.lineStyle(1.5, 0x1a2b44, 0.8);
    this.hudGraphics.strokeRect(bx, by, barW, barH);
    this.hudGraphics.fillStyle(0x050c18, 0.7);
    this.hudGraphics.fillRect(bx, by, barW, barH);

    if (boost > 0.01) {
      const fillW = (barW - 4) * boost;
      const boostColor = this.ship.isBoosting ? GAME_CONFIG.boostColor : GAME_CONFIG.wallColor;
      this.hudGraphics.fillStyle(boostColor, 0.9);
      this.hudGraphics.fillRect(bx + 2, by + 2, fillW, barH - 4);
    }
  }
}
