import Phaser from "phaser";

export interface GameConfig {
  readonly width: number;
  readonly height: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly shipSize: number;
  readonly shipRadius: number;

  // Modifiable accelerations & control
  readonly thrustForce: number;          // Base forward auto-acceleration force
  readonly rotationSpeed: number;        // Angular turning speed (rad/frame)
  readonly boostForce: number;           // Boost force magnitude applied when gliding near walls

  readonly frictionAir: number;
  readonly maxSpeed: number;
  readonly maxBoostSpeed: number;

  // Collision recoil & bounce
  readonly wallRecoilForce: number;      // Constant rebound velocity magnitude applied perpendicular from wall
  readonly wallStunDuration: number;     // Time in ms forward auto-acceleration is suspended after hit

  // Boost ray & proximity settings
  readonly boostRayLength: number;       // Length of the detection rays / radius of semicircle zone
  readonly boostRayAngle: number;        // Half-width angle spread of the boost rays / semicircle sector (radians)
  readonly boostCenterOffset: number;    // Offset factor along ship's longitudinal axis for the boost circle center (0.5 = back center, 0 = ship center, etc.)
  readonly boostProximityExponent: number; // Exponent for proximity scaling (higher = much stronger when closer to wall)
  readonly boostFadeRate: number;        // Rate at which boost level decays
  readonly boostDeceleration: number;   // Smooth speed deceleration rate when exiting boost zone
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
  shipSize: 5,
  shipRadius: 3,

  // Accelerations (Easily tunable)
  thrustForce: 0.00001,
  rotationSpeed: 0.06,
  boostForce: 0.00005,            // Perpendicular/tangential force exerted by wall onto ship

  frictionAir: 0.001,
  maxSpeed: 4,
  maxBoostSpeed: 12,

  // Constant collision recoil
  wallRecoilForce: 5,          // Constant rebound velocity magnitude away from wall regardless of impact speed
  wallStunDuration: 1000,

  boostRayLength: 60,
  boostRayAngle: 0.75,
  boostCenterOffset: 0,           // Offset factor along ship's longitudinal axis for boost circle center (e.g. 0.5 = back, 0 = center, -0.5 = front)
  boostProximityExponent: 0,   // Exponent ramping up boost power as rays get closer to wall (e.g. 1.0=linear, 2.0=quadratic)
  boostFadeRate: 0,
  boostDeceleration: 0.15,     // Smooth speed deceleration rate when leaving boost (prevents instant abrupt stop)
  trailMaxLength: 80,
  trailFadeDuration: 500,
  cameraLerp: 0.08,
  cameraZoom: 1,
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
