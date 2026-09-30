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
  private frozen: boolean = false;
  private currentSpeedLimit: number = GAME_CONFIG.maxSpeed;

  // Zero-GC preallocated reusable structs
  private readonly scratchForce = { x: 0, y: 0 };
  private readonly scratchVelocity = { x: 0, y: 0 };

  // Preallocated vertex coordinates for rendering
  private noseX: number = 0;
  private noseY: number = 0;
  private leftWingX: number = 0;
  private leftWingY: number = 0;
  private rightWingX: number = 0;
  private rightWingY: number = 0;
  private innerCenterX: number = 0;
  private innerCenterY: number = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.size = GAME_CONFIG.shipSize;

    this.graphics = scene.add.graphics();
    this.graphics.setDepth(10);

    // Decoupled circular hitbox with zero friction, baseline frictionAir and restitution
    this.body = scene.matter.add.circle(x, y, GAME_CONFIG.shipRadius, {
      friction: 0.0,
      frictionAir: GAME_CONFIG.frictionAir,
      restitution: 0.2,
      density: 0.001,
      label: "playerShip",
    });

    // Lock inertia so collisions do not induce wild physics angular spin
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
    const vx = this.body.velocity.x;
    const vy = this.body.velocity.y;
    return Math.sqrt(vx * vx + vy * vy);
  }

  get matterBody(): MatterJS.BodyType {
    return this.body;
  }

  get currentBoostLevel(): number {
    return this.boostLevel;
  }

  get isBoosting(): boolean {
    return this.boostLevel > 0.05;
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

  get stunRemainingMs(): number {
    return this.wallStunTimer;
  }

  setBoostLevel(level: number): void {
    this.boostLevel = Phaser.Math.Clamp(level, 0, 1);
  }

  freeze(): void {
    this.frozen = true;
    this.scratchVelocity.x = 0;
    this.scratchVelocity.y = 0;
    this.scene.matter.body.setVelocity(this.body, this.scratchVelocity);
    this.scene.matter.body.setAngularVelocity(this.body, 0);
  }

  unfreeze(): void {
    this.frozen = false;
  }

  /**
   * Evaluates impact normal, detects non-parallel angles, suspends auto-thrust for 0.35s and applies elastic recoil.
   * Zero heap allocations.
   */
  onWallCollision(normalX: number, normalY: number): void {
    const vx = this.body.velocity.x;
    const vy = this.body.velocity.y;
    const theta = this.body.angle;
    const ux = Math.cos(theta);
    const uy = Math.sin(theta);

    // Unit tangent of the wall
    const tx = -normalY;
    const ty = normalX;

    // Alignment of heading with wall tangent (|u . t|)
    const alignWithTangent = Math.abs(ux * tx + uy * ty);

    // Normal component of velocity (negative when heading towards the wall)
    const vDotN = vx * normalX + vy * normalY;

    // Non-parallel impact check: steep angle into wall or significant velocity towards wall
    const isNonParallel = alignWithTangent < 0.92 || vDotN < -0.15;

    if (isNonParallel) {
      // 1. Suspend auto-thrust during 0.35s (350ms) cooldown
      this.wallStunTimer = GAME_CONFIG.wallStunDuration;

      // 2. Lock angular velocity to prevent disorienting rotational spin
      this.scene.matter.body.setAngularVelocity(this.body, 0);

      // 3. Calculate elastic recoil vector along the contact normal
      const normalImpactSpeed = Math.abs(vDotN);
      const recoilSpeed = Math.max(normalImpactSpeed * 0.9, GAME_CONFIG.wallRecoilForce);

      // Tangential velocity preserved with slight friction loss
      const vTangentialX = vx - vDotN * normalX;
      const vTangentialY = vy - vDotN * normalY;

      this.scratchVelocity.x = vTangentialX * 0.6 + normalX * recoilSpeed;
      this.scratchVelocity.y = vTangentialY * 0.6 + normalY * recoilSpeed;

      this.scene.matter.body.setVelocity(this.body, this.scratchVelocity);
    }
  }

  update(delta: number): void {
    if (this.frozen) {
      this.drawShip();
      return;
    }

    this.updateStun(delta);
    this.handleSteeringAndBraking();
    this.handleAutoAcceleration();
    this.clampSpeed(delta);
    this.drawShip();
  }

  /**
   * Fills target structure with back exhaust position without allocating new objects.
   */
  getTailPosition(out: { x: number; y: number }): void {
    const backAngle = this.body.angle + Math.PI;
    const offset = this.size * 0.55;
    out.x = this.body.position.x + Math.cos(backAngle) * offset;
    out.y = this.body.position.y + Math.sin(backAngle) * offset;
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

  private handleSteeringAndBraking(): void {
    const leftDown = this.cursors.left.isDown || this.keyA.isDown;
    const rightDown = this.cursors.right.isDown || this.keyD.isDown;

    if (leftDown && rightDown) {
      // Dual Brake: high friction air, cancel angular motion
      this.body.frictionAir = GAME_CONFIG.brakeFrictionAir;
      this.scene.matter.body.setAngularVelocity(this.body, 0);
      return;
    }

    // Normal friction air
    this.body.frictionAir = GAME_CONFIG.frictionAir;

    const rotSpeed = GAME_CONFIG.rotationSpeed;
    if (leftDown) {
      this.scene.matter.body.setAngularVelocity(this.body, -rotSpeed);
    } else if (rightDown) {
      this.scene.matter.body.setAngularVelocity(this.body, rotSpeed);
    } else {
      this.scene.matter.body.setAngularVelocity(this.body, 0);
    }
  }

  private handleAutoAcceleration(): void {
    // Suspend forward thrust during braking or stun
    if (this.isBraking || this.isStunned) return;

    const angle = this.body.angle;
    const baseForce = GAME_CONFIG.thrustForce;

    this.scratchForce.x = Math.cos(angle) * baseForce;
    this.scratchForce.y = Math.sin(angle) * baseForce;

    this.scene.matter.body.applyForce(this.body, this.body.position, this.scratchForce);
  }

  private clampSpeed(delta: number): void {
    // Dynamic speed limit interpolation
    if (this.isBoosting) {
      const targetLimit = GAME_CONFIG.maxSpeed + (GAME_CONFIG.maxBoostSpeed - GAME_CONFIG.maxSpeed) * this.boostLevel;
      this.currentSpeedLimit = Phaser.Math.Linear(this.currentSpeedLimit, targetLimit, 0.12);
    } else {
      const decay = GAME_CONFIG.boostDeceleration * (delta / 16.666);
      this.currentSpeedLimit = Math.max(GAME_CONFIG.maxSpeed, this.currentSpeedLimit - decay);
    }

    const vx = this.body.velocity.x;
    const vy = this.body.velocity.y;
    const spd = Math.sqrt(vx * vx + vy * vy);

    if (spd > this.currentSpeedLimit && spd > 0.0001) {
      const scale = this.currentSpeedLimit / spd;
      this.scratchVelocity.x = vx * scale;
      this.scratchVelocity.y = vy * scale;
      this.scene.matter.body.setVelocity(this.body, this.scratchVelocity);
    }
  }

  private drawShip(): void {
    this.graphics.clear();

    const cx = this.body.position.x;
    const cy = this.body.position.y;
    const angle = this.body.angle;
    const size = this.size;

    // Precalculate elongated isosceles triangle vertices
    const noseLength = size * 1.55;
    const wingWidth = size * 0.65;
    const backAngle = angle + Math.PI;
    const perpAngle = angle + Math.PI / 2;

    this.noseX = cx + Math.cos(angle) * noseLength;
    this.noseY = cy + Math.sin(angle) * noseLength;

    const backCenterX = cx + Math.cos(backAngle) * (size * 0.45);
    const backCenterY = cy + Math.sin(backAngle) * (size * 0.45);

    this.leftWingX = backCenterX + Math.cos(perpAngle) * wingWidth;
    this.leftWingY = backCenterY + Math.sin(perpAngle) * wingWidth;

    this.rightWingX = backCenterX - Math.cos(perpAngle) * wingWidth;
    this.rightWingY = backCenterY - Math.sin(perpAngle) * wingWidth;

    this.innerCenterX = cx + Math.cos(angle) * (size * 0.2);
    this.innerCenterY = cy + Math.sin(angle) * (size * 0.2);

    const boostT = this.boostLevel;
    const isStunFlash = this.isStunned && Math.floor(this.wallStunTimer / 50) % 2 === 0;

    let baseColor = GAME_CONFIG.shipColor;
    if (boostT > 0.05) {
      baseColor = this.lerpColor(GAME_CONFIG.shipColor, GAME_CONFIG.boostColor, boostT);
    }
    if (isStunFlash) {
      baseColor = 0xff2244;
    }

    // Outer glow aura
    this.graphics.lineStyle(4, baseColor, isStunFlash ? 0.35 : 0.2 + boostT * 0.3);
    this.graphics.beginPath();
    this.graphics.moveTo(this.noseX, this.noseY);
    this.graphics.lineTo(this.leftWingX, this.leftWingY);
    this.graphics.lineTo(this.innerCenterX, this.innerCenterY);
    this.graphics.lineTo(this.rightWingX, this.rightWingY);
    this.graphics.closePath();
    this.graphics.strokePath();

    // Solid inner hull
    this.graphics.fillStyle(isStunFlash ? 0xff2244 : 0x050c18, 0.88);
    this.graphics.fillPath();

    // Crisp neon edge stroke
    this.graphics.lineStyle(2, isStunFlash ? 0xff4455 : baseColor, 1.0);
    this.graphics.beginPath();
    this.graphics.moveTo(this.noseX, this.noseY);
    this.graphics.lineTo(this.leftWingX, this.leftWingY);
    this.graphics.lineTo(this.innerCenterX, this.innerCenterY);
    this.graphics.lineTo(this.rightWingX, this.rightWingY);
    this.graphics.closePath();
    this.graphics.strokePath();

    // Front tip cockpit neon accent
    this.graphics.lineStyle(1.5, 0xffffff, 0.9);
    this.graphics.beginPath();
    this.graphics.moveTo(this.noseX, this.noseY);
    this.graphics.lineTo(cx + Math.cos(angle) * (size * 0.6), cy + Math.sin(angle) * (size * 0.6));
    this.graphics.strokePath();

    // Exhaust thrust flame
    if (!this.isBraking && !this.isStunned) {
      this.drawExhaustFlame(backCenterX, backCenterY, backAngle, baseColor, boostT);
    }

    // Dual Brake indicator lights
    if (this.isBraking) {
      this.drawBrakeFlares(perpAngle);
    }
  }

  private drawExhaustFlame(baseX: number, baseY: number, backAngle: number, color: number, boost: number): void {
    const flameLen = this.size * (0.8 + boost * 1.4);
    const tipX = baseX + Math.cos(backAngle) * flameLen;
    const tipY = baseY + Math.sin(backAngle) * flameLen;

    const spreadAngle = 0.38;
    const spreadW = this.size * 0.28;
    const lx = baseX + Math.cos(backAngle - spreadAngle) * spreadW;
    const ly = baseY + Math.sin(backAngle - spreadAngle) * spreadW;
    const rx = baseX + Math.cos(backAngle + spreadAngle) * spreadW;
    const ry = baseY + Math.sin(backAngle + spreadAngle) * spreadW;

    this.graphics.fillStyle(color, 0.75 + boost * 0.25);
    this.graphics.beginPath();
    this.graphics.moveTo(lx, ly);
    this.graphics.lineTo(tipX, tipY);
    this.graphics.lineTo(rx, ry);
    this.graphics.closePath();
    this.graphics.fillPath();

    // Inner bright core
    this.graphics.fillStyle(0xffffff, 0.85);
    this.graphics.fillCircle(baseX, baseY, 2.0 + boost * 1.5);
  }

  private drawBrakeFlares(perpAngle: number): void {
    const leftX = this.leftWingX + Math.cos(perpAngle) * 3;
    const leftY = this.leftWingY + Math.sin(perpAngle) * 3;
    const rightX = this.rightWingX - Math.cos(perpAngle) * 3;
    const rightY = this.rightWingY - Math.sin(perpAngle) * 3;

    this.graphics.fillStyle(0xff1133, 0.9);
    this.graphics.fillCircle(leftX, leftY, 3);
    this.graphics.fillCircle(rightX, rightY, 3);

    this.graphics.fillStyle(0xff8899, 0.7);
    this.graphics.fillCircle(leftX, leftY, 1.5);
    this.graphics.fillCircle(rightX, rightY, 1.5);
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
