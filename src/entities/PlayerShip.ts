import Phaser from "phaser";
import { GAME_CONFIG } from "../config";

export class PlayerShip {
  private readonly scene: Phaser.Scene;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly body: MatterJS.BodyType;
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly keyA: Phaser.Input.Keyboard.Key;
  private readonly keyD: Phaser.Input.Keyboard.Key;
  private readonly size: number;

  private boostLevel: number = 0;
  private wallStunTimer: number = 0;
  private stunSpeed: number = 0;
  private frozen: boolean = false;
  private currentSpeedLimit: number = GAME_CONFIG.maxSpeed;
  private pendingRecoilVelocity: { x: number; y: number } | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.size = GAME_CONFIG.shipSize;

    this.graphics = scene.add.graphics();
    this.graphics.setDepth(10);

    this.body = scene.matter.add.circle(x, y, GAME_CONFIG.shipRadius, {
      frictionAir: GAME_CONFIG.frictionAir,
      friction: 0.0,
      restitution: 0.0,
      density: 0.001,
      label: "playerShip",
    });
    scene.matter.body.setInertia(this.body, Infinity);

    this.cursors = scene.input.keyboard!.createCursorKeys();
    this.keyA = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
  }

  get x(): number {
    return this.body.position.x;
  }

  get y(): number {
    return this.body.position.y;
  }

  get angle(): number {
    return this.body.angle;
  }

  get velocity(): MatterJS.Vector {
    return this.body.velocity;
  }

  get speed(): number {
    const v = this.body.velocity;
    return Math.sqrt(v.x * v.x + v.y * v.y);
  }

  get matterBody(): MatterJS.BodyType {
    return this.body;
  }

  get currentBoostLevel(): number {
    return this.boostLevel;
  }

  get isBoosting(): boolean {
    return this.boostLevel > 0.1;
  }

  get isBraking(): boolean {
    const leftDown = this.cursors.left.isDown || this.keyA.isDown;
    const rightDown = this.cursors.right.isDown || this.keyD.isDown;
    return leftDown && rightDown;
  }

  get isTurning(): boolean {
    const leftDown = this.cursors.left.isDown || this.keyA.isDown;
    const rightDown = this.cursors.right.isDown || this.keyD.isDown;
    return (leftDown || rightDown) && !this.isBraking;
  }

  get isStunned(): boolean {
    return this.wallStunTimer > 0;
  }

  setBoostLevel(level: number): void {
    this.boostLevel = Phaser.Math.Clamp(level, 0, 1);
  }

  freeze(): void {
    this.frozen = true;
    this.scene.matter.body.setVelocity(this.body, { x: 0, y: 0 });
    this.scene.matter.body.setAngularVelocity(this.body, 0);
  }

  unfreeze(): void {
    this.frozen = false;
  }

  /**
   * Wall collision handling:
   * - Preserves ship facing direction
   * - Suspends forward acceleration via wallStunTimer
   * - Bounces off the wall reflecting velocity, preserving exact impact speed during the stun duration
   */
  onWallCollision(_wallBody: MatterJS.BodyType, pair: MatterJS.IPair): void {
    this.wallStunTimer = GAME_CONFIG.wallStunDuration;

    const pairAny = pair as unknown as {
      collision?: { normal?: { x: number; y: number } };
      bodyA?: MatterJS.BodyType;
    };

    let nx = pairAny.collision?.normal?.x ?? 0;
    let ny = pairAny.collision?.normal?.y ?? -1;

    const len = Math.sqrt(nx * nx + ny * ny);
    if (len > 0.0001) {
      nx /= len;
      ny /= len;
    } else {
      nx = 0;
      ny = -1;
    }

    const sign = pairAny.bodyA === this.body ? -1 : 1;
    const recoilNx = nx * sign;
    const recoilNy = ny * sign;

    // 1. Lock facing angle: zero out angular velocity completely
    const currentAngle = this.body.angle;
    this.scene.matter.body.setAngularVelocity(this.body, 0);
    this.scene.matter.body.setAngle(this.body, currentAngle);

    // 2. Measure impact speed (preserving exact speed at impact, minimum wallRecoilForce)
    const impactSpeed = Math.max(this.speed, GAME_CONFIG.wallRecoilForce);
    this.stunSpeed = impactSpeed;

    // 3. Reflect current velocity vector off wall normal to create natural bounce
    const vx = this.body.velocity.x;
    const vy = this.body.velocity.y;
    const dot = vx * recoilNx + vy * recoilNy;

    let rx: number;
    let ry: number;
    if (dot < 0) {
      // Reflection vector: v - 2*(v . n)*n
      rx = vx - 2 * dot * recoilNx;
      ry = vy - 2 * dot * recoilNy;
      const rLen = Math.sqrt(rx * rx + ry * ry);
      if (rLen > 0.0001) {
        rx = (rx / rLen) * impactSpeed;
        ry = (ry / rLen) * impactSpeed;
      } else {
        rx = recoilNx * impactSpeed;
        ry = recoilNy * impactSpeed;
      }
    } else {
      rx = recoilNx * impactSpeed;
      ry = recoilNy * impactSpeed;
    }

    this.pendingRecoilVelocity = { x: rx, y: ry };
  }

  update(delta: number): void {
    if (this.frozen) {
      this.drawShip();
      return;
    }

    if (this.pendingRecoilVelocity) {
      this.scene.matter.body.setVelocity(this.body, this.pendingRecoilVelocity);
      this.pendingRecoilVelocity = null;
    }

    this.updateStun(delta);
    this.handleRotation();
    this.handleAutoAcceleration();
    this.decayBoost();
    this.clampSpeed(delta);
    this.drawShip();
  }

  getBackCenter(offsetFactor: number = GAME_CONFIG.boostCenterOffset): Phaser.Math.Vector2 {
    const backAngle = this.body.angle + Math.PI;
    const offset = this.size * offsetFactor;
    return new Phaser.Math.Vector2(
      this.body.position.x + Math.cos(backAngle) * offset,
      this.body.position.y + Math.sin(backAngle) * offset
    );
  }

  getBackRayOrigins(): { left: Phaser.Math.Vector2; right: Phaser.Math.Vector2 } {
    const backAngle = this.body.angle + Math.PI;
    const spread = GAME_CONFIG.boostRayAngle;
    const offset = this.size * 0.5;

    return {
      left: new Phaser.Math.Vector2(
        this.body.position.x + Math.cos(backAngle - spread) * offset,
        this.body.position.y + Math.sin(backAngle - spread) * offset
      ),
      right: new Phaser.Math.Vector2(
        this.body.position.x + Math.cos(backAngle + spread) * offset,
        this.body.position.y + Math.sin(backAngle + spread) * offset
      ),
    };
  }

  getBackRayEndpoints(rayLength: number): { left: Phaser.Math.Vector2; right: Phaser.Math.Vector2 } {
    const origins = this.getBackRayOrigins();
    const backAngle = this.body.angle + Math.PI;
    const spread = GAME_CONFIG.boostRayAngle;

    return {
      left: new Phaser.Math.Vector2(
        origins.left.x + Math.cos(backAngle - spread) * rayLength,
        origins.left.y + Math.sin(backAngle - spread) * rayLength
      ),
      right: new Phaser.Math.Vector2(
        origins.right.x + Math.cos(backAngle + spread) * rayLength,
        origins.right.y + Math.sin(backAngle + spread) * rayLength
      ),
    };
  }

  destroy(): void {
    this.graphics.destroy();
    this.scene.matter.world.remove(this.body);
  }

  private updateStun(delta: number): void {
    if (this.wallStunTimer > 0) {
      this.wallStunTimer = Math.max(0, this.wallStunTimer - delta);
    }
  }

  private handleRotation(): void {
    if (this.isBraking) {
      this.scene.matter.body.setAngularVelocity(this.body, 0);
      return;
    }

    const rotSpeed = GAME_CONFIG.rotationSpeed;
    const leftDown = this.cursors.left.isDown || this.keyA.isDown;
    const rightDown = this.cursors.right.isDown || this.keyD.isDown;

    if (leftDown) {
      this.scene.matter.body.setAngularVelocity(this.body, -rotSpeed);
    } else if (rightDown) {
      this.scene.matter.body.setAngularVelocity(this.body, rotSpeed);
    } else {
      this.scene.matter.body.setAngularVelocity(this.body, 0);
    }
  }

  /**
   * Configurable linear auto-acceleration
   */
  private handleAutoAcceleration(): void {
    if (this.isBraking || this.isStunned) return;

    const angle = this.body.angle;
    const baseForce = GAME_CONFIG.thrustForce;

    this.scene.matter.body.applyForce(this.body, this.body.position, {
      x: Math.cos(angle) * baseForce,
      y: Math.sin(angle) * baseForce,
    });
  }

  private decayBoost(): void {
    if (this.boostLevel > 0) {
      this.boostLevel = Math.max(0, this.boostLevel - GAME_CONFIG.boostFadeRate);
    }
  }

  private clampSpeed(delta: number): void {
    if (this.isStunned) {
      const v = this.body.velocity;
      const spd = Math.sqrt(v.x * v.x + v.y * v.y);
      if (spd > 0.0001 && this.stunSpeed > 0) {
        const scale = this.stunSpeed / spd;
        this.scene.matter.body.setVelocity(this.body, {
          x: v.x * scale,
          y: v.y * scale,
        });
      }
      return;
    }

    // Smoothly interpolate speed limit upwards while boosting, and decelerate smoothly when leaving boost
    if (this.isBoosting) {
      this.currentSpeedLimit = Phaser.Math.Linear(this.currentSpeedLimit, GAME_CONFIG.maxBoostSpeed, 0.1);
    } else {
      const decayStep = GAME_CONFIG.boostDeceleration * (delta / 16.66);
      this.currentSpeedLimit = Math.max(GAME_CONFIG.maxSpeed, this.currentSpeedLimit - decayStep);
    }

    const vel = this.body.velocity;
    const spd = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    if (spd > this.currentSpeedLimit) {
      const scale = this.currentSpeedLimit / spd;
      this.scene.matter.body.setVelocity(this.body, {
        x: vel.x * scale,
        y: vel.y * scale,
      });
    }
  }

  private drawShip(): void {
    this.graphics.clear();

    const boostT = this.boostLevel;
    const baseColor = boostT > 0.1 ? this.lerpColor(GAME_CONFIG.shipColor, GAME_CONFIG.boostColor, boostT) : GAME_CONFIG.shipColor;
    const glowColor = boostT > 0.1 ? 0xffffaa : 0xff88ff;
    const stunFlash = this.isStunned && Math.floor(this.wallStunTimer / 40) % 2 === 0;

    if (!stunFlash) {
      this.graphics.lineStyle(2, glowColor, 0.25);
      this.drawIsosceles(this.graphics, this.body.position.x, this.body.position.y, this.body.angle, this.size + 5);
    }

    this.graphics.lineStyle(2, stunFlash ? 0xff3333 : baseColor, 1);
    this.graphics.fillStyle(stunFlash ? 0xff3333 : baseColor, 0.2);
    this.drawIsosceles(this.graphics, this.body.position.x, this.body.position.y, this.body.angle, this.size);

    if (!this.isBraking && !this.isStunned) {
      this.drawExhaust(baseColor);
    }

    if (this.isBraking) {
      this.drawBrakeIndicator();
    }
  }

  private drawIsosceles(g: Phaser.GameObjects.Graphics, cx: number, cy: number, angle: number, size: number): void {
    const noseLength = size * 1.6;
    const baseHalf = size * 0.65;

    const nose = new Phaser.Math.Vector2(
      cx + Math.cos(angle) * noseLength,
      cy + Math.sin(angle) * noseLength
    );

    const backAngle = angle + Math.PI;
    const perpAngle = angle + Math.PI / 2;

    const backCenter = new Phaser.Math.Vector2(
      cx + Math.cos(backAngle) * size * 0.5,
      cy + Math.sin(backAngle) * size * 0.5
    );

    const left = new Phaser.Math.Vector2(
      backCenter.x + Math.cos(perpAngle) * baseHalf,
      backCenter.y + Math.sin(perpAngle) * baseHalf
    );

    const right = new Phaser.Math.Vector2(
      backCenter.x - Math.cos(perpAngle) * baseHalf,
      backCenter.y - Math.sin(perpAngle) * baseHalf
    );

    g.beginPath();
    g.moveTo(nose.x, nose.y);
    g.lineTo(left.x, left.y);
    g.lineTo(right.x, right.y);
    g.closePath();
    g.strokePath();
    g.fillPath();
  }

  private drawExhaust(color: number): void {
    const backAngle = this.body.angle + Math.PI;
    const baseX = this.body.position.x + Math.cos(backAngle) * this.size * 0.5;
    const baseY = this.body.position.y + Math.sin(backAngle) * this.size * 0.5;

    const boostScale = 1 + this.boostLevel * 1.5;
    const exhaustLen = this.size * 0.7 * boostScale;
    const flickerLen = exhaustLen * (0.7 + Math.random() * 0.6);

    const tipX = baseX + Math.cos(backAngle) * flickerLen;
    const tipY = baseY + Math.sin(backAngle) * flickerLen;

    const spread = 0.35;
    const wingSize = this.size * 0.25;
    const leftX = baseX + Math.cos(backAngle - spread) * wingSize;
    const leftY = baseY + Math.sin(backAngle - spread) * wingSize;
    const rightX = baseX + Math.cos(backAngle + spread) * wingSize;
    const rightY = baseY + Math.sin(backAngle + spread) * wingSize;

    this.graphics.fillStyle(color, 0.5 + this.boostLevel * 0.3);
    this.graphics.beginPath();
    this.graphics.moveTo(leftX, leftY);
    this.graphics.lineTo(tipX, tipY);
    this.graphics.lineTo(rightX, rightY);
    this.graphics.closePath();
    this.graphics.fillPath();

    this.graphics.fillStyle(0xffffff, 0.7);
    this.graphics.fillCircle(baseX, baseY, 1.5 + this.boostLevel * 1.5);
  }

  private drawBrakeIndicator(): void {
    const backAngle = this.body.angle + Math.PI;
    const perpAngle = this.body.angle + Math.PI / 2;
    const offset = this.size * 0.6;

    for (const side of [-1, 1]) {
      const bx = this.body.position.x + Math.cos(backAngle) * this.size * 0.3 + Math.cos(perpAngle) * offset * side;
      const by = this.body.position.y + Math.sin(backAngle) * this.size * 0.3 + Math.sin(perpAngle) * offset * side;
      this.graphics.fillStyle(0xff4444, 0.6 + Math.random() * 0.3);
      this.graphics.fillCircle(bx, by, 2.5);
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
