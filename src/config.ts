import Phaser from "phaser";

export interface GameConfig {
  readonly width: number;
  readonly height: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly shipSize: number;
  readonly shipRadius: number;

  // Modifiable accelerations
  readonly thrustForce: number;          // Base forward auto-acceleration
  readonly turnAcceleration: number;     // Configurable extra acceleration applied when turning
  readonly rotationSpeed: number;        // Angular turning speed
  readonly boostForce: number;           // Tangential/perpendicular boost force printed by wall onto ship

  readonly frictionAir: number;
  readonly brakeFrictionAir: number;
  readonly maxSpeed: number;
  readonly maxBoostSpeed: number;

  // Collision recoil
  readonly wallRecoilForce: number;      // Constant recoil impulse magnitude on collision regardless of impact speed/direction
  readonly wallStunDuration: number;

  readonly boostRayLength: number;
  readonly boostFadeRate: number;
  readonly trailMaxLength: number;
  readonly trailFadeDuration: number;
  readonly cameraLerp: number;
  readonly cameraZoom: number;
  readonly wallColor: number;
  readonly shipColor: number;
  readonly boostColor: number;
  readonly trailColor: number;
  readonly startZoneColor: number;
  readonly finishZoneColor: number;
  readonly bloomStrength: number;
}

export const GAME_CONFIG: GameConfig = {
  width: 1280,
  height: 720,
  worldWidth: 4000,
  worldHeight: 3000,
  shipSize: 18,
  shipRadius: 10,

  // Accelerations (Easily tunable)
  thrustForce: 0.0012,
  turnAcceleration: 0.0006,     // Extra acceleration applied while steering into turns
  rotationSpeed: 0.055,
  boostForce: 0.0025,            // Perpendicular/tangential force exerted by wall onto ship

  frictionAir: 0.012,
  brakeFrictionAir: 0.05,
  maxSpeed: 8,
  maxBoostSpeed: 16,

  // Constant collision recoil
  wallRecoilForce: 3.5,          // Constant rebound velocity magnitude away from wall regardless of impact speed
  wallStunDuration: 220,

  boostRayLength: 45,
  boostFadeRate: 0.03,
  trailMaxLength: 80,
  trailFadeDuration: 500,
  cameraLerp: 0.08,
  cameraZoom: 1.3,
  wallColor: 0x00ffff,
  shipColor: 0xff00ff,
  boostColor: 0xffff00,
  trailColor: 0xff00ff,
  startZoneColor: 0x00ff88,
  finishZoneColor: 0xff4444,
  bloomStrength: 1.5,
};

export enum LevelState {
  Waiting = "WAITING",
  Playing = "PLAYING",
  Paused = "PAUSED",
  Completed = "COMPLETED",
}

export function createPhaserConfig(scene: typeof Phaser.Scene): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.WEBGL,
    width: GAME_CONFIG.width,
    height: GAME_CONFIG.height,
    backgroundColor: "#000000",
    parent: document.body,
    physics: {
      default: "matter",
      matter: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scene: [scene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  };
}
