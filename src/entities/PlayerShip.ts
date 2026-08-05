import Phaser from "phaser";
import { GAME_CONFIG } from "../config";

interface ShipState {
  isBoosting: boolean;
  boostTimer: number;
}

export class PlayerShip {
  private readonly scene: Phaser.Scene;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly body: MatterJS.BodyType;
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly wasdKeys: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
  private readonly state: ShipState;
  private readonly size: number;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.size = GAME_CONFIG.shipSize;
    this.state = { isBoosting: false, boostTimer: 0 };

    this.graphics = scene.add.graphics();
    this.graphics.setDepth(10);

    const vertices = this.getTriangleVertices();
    this.body = scene.matter.add.fromVertices(x, y, [vertices], {
      frictionAir: GAME_CONFIG.frictionAir,
      friction: 0.05,
      restitution: 0.4,
      density: 0.002,
      label: "playerShip",
    }, true);

    this.cursors = scene.input.keyboard!.createCursorKeys();
    this.wasdKeys = {
      W: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      D: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
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

  get matterBody(): MatterJS.BodyType {
    return this.body;
  }

  get isThrusting(): boolean {
    return this.cursors.up.isDown || this.wasdKeys.W.isDown;
  }

  get isBoosting(): boolean {
    return this.state.isBoosting;
  }

  setBoosting(active: boolean): void {
    this.state.isBoosting = active;
    if (active) {
      this.state.boostTimer = 150;
    }
  }

  update(delta: number): void {
    this.handleRotation();
    this.handleThrust();
    this.updateBoostTimer(delta);
    this.clampSpeed();
    this.drawShip();
  }

  getBackRayOrigins(): { left: Phaser.Math.Vector2; right: Phaser.Math.Vector2 } {
    const angle = this.body.angle;
    const backAngle = angle + Math.PI;
    const spread = 0.5;
    const offset = this.size * 0.6;

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
    const angle = this.body.angle;
    const backAngle = angle + Math.PI;
    const spread = 0.5;

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

  private handleRotation(): void {
    const rotSpeed = GAME_CONFIG.rotationSpeed;

    if (this.cursors.left.isDown || this.wasdKeys.A.isDown) {
      this.scene.matter.body.setAngularVelocity(this.body, -rotSpeed);
    } else if (this.cursors.right.isDown || this.wasdKeys.D.isDown) {
      this.scene.matter.body.setAngularVelocity(this.body, rotSpeed);
    } else {
      this.scene.matter.body.setAngularVelocity(this.body, this.body.angularVelocity * 0.85);
    }
  }

  private handleThrust(): void {
    if (!this.isThrusting) return;

    const angle = this.body.angle;
    const force = GAME_CONFIG.thrustForce;
    const multiplier = this.state.isBoosting ? GAME_CONFIG.boostMultiplier : 1;

    this.scene.matter.body.applyForce(this.body, this.body.position, {
      x: Math.cos(angle) * force * multiplier,
      y: Math.sin(angle) * force * multiplier,
    });
  }

  private updateBoostTimer(delta: number): void {
    if (this.state.boostTimer > 0) {
      this.state.boostTimer -= delta;
      if (this.state.boostTimer <= 0) {
        this.state.isBoosting = false;
        this.state.boostTimer = 0;
      }
    }
  }

  private clampSpeed(): void {
    const maxSpeed = 12;
    const vel = this.body.velocity;
    const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      this.scene.matter.body.setVelocity(this.body, {
        x: vel.x * scale,
        y: vel.y * scale,
      });
    }
  }

  private drawShip(): void {
    this.graphics.clear();

    const baseColor = this.state.isBoosting ? GAME_CONFIG.boostColor : GAME_CONFIG.shipColor;
    const glowColor = this.state.isBoosting ? 0xffffaa : 0xff88ff;

    this.graphics.lineStyle(2, glowColor, 0.3);
    this.drawTriangle(this.graphics, this.body.position.x, this.body.position.y, this.body.angle, this.size + 4);

    this.graphics.lineStyle(2, baseColor, 1);
    this.graphics.fillStyle(baseColor, 0.15);
    this.drawTriangle(this.graphics, this.body.position.x, this.body.position.y, this.body.angle, this.size);

    if (this.isThrusting) {
      this.drawExhaust(baseColor);
    }
  }

  private drawTriangle(g: Phaser.GameObjects.Graphics, cx: number, cy: number, angle: number, size: number): void {
    const points: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 3; i++) {
      const vertexAngle = angle + (i * Math.PI * 2) / 3 - Math.PI / 6;
      points.push(new Phaser.Math.Vector2(
        cx + Math.cos(vertexAngle) * size,
        cy + Math.sin(vertexAngle) * size
      ));
    }
    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    g.lineTo(points[1].x, points[1].y);
    g.lineTo(points[2].x, points[2].y);
    g.closePath();
    g.strokePath();
    g.fillPath();
  }

  private drawExhaust(color: number): void {
    const backAngle = this.body.angle + Math.PI;
    const baseX = this.body.position.x + Math.cos(backAngle) * this.size * 0.6;
    const baseY = this.body.position.y + Math.sin(backAngle) * this.size * 0.6;
    const exhaustLen = this.state.isBoosting ? this.size * 1.5 : this.size * 0.8;
    const flickerLen = exhaustLen * (0.8 + Math.random() * 0.4);

    const tipX = baseX + Math.cos(backAngle) * flickerLen;
    const tipY = baseY + Math.sin(backAngle) * flickerLen;

    const spread = 0.3;
    const leftX = baseX + Math.cos(backAngle - spread) * this.size * 0.3;
    const leftY = baseY + Math.sin(backAngle - spread) * this.size * 0.3;
    const rightX = baseX + Math.cos(backAngle + spread) * this.size * 0.3;
    const rightY = baseY + Math.sin(backAngle + spread) * this.size * 0.3;

    this.graphics.fillStyle(color, 0.6);
    this.graphics.beginPath();
    this.graphics.moveTo(leftX, leftY);
    this.graphics.lineTo(tipX, tipY);
    this.graphics.lineTo(rightX, rightY);
    this.graphics.closePath();
    this.graphics.fillPath();

    this.graphics.fillStyle(0xffffff, 0.8);
    this.graphics.fillCircle(baseX, baseY, 2);
  }

  private getTriangleVertices(): Phaser.Types.Math.Vector2Like[] {
    const verts: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3 - Math.PI / 6;
      verts.push({
        x: Math.cos(angle) * this.size,
        y: Math.sin(angle) * this.size,
      });
    }
    return verts;
  }
}
