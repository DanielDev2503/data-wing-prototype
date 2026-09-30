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

  readonly frictionAir: number;          // Base air friction
  readonly brakeFrictionAir: number;     // Air friction when dual braking
  readonly maxSpeed: number;             // Base cruising speed cap
  readonly maxBoostSpeed: number;        // Peak speed cap during max wall boost

  // Collision recoil & bounce
  readonly wallRecoilForce: number;      // Rebound speed magnitude applied away from wall
  readonly wallStunDuration: number;     // Time in ms forward auto-acceleration is suspended after hit (0.35s = 350ms)

  // Boost ray & proximity settings
  readonly boostProximityRadius: number; // Proximity threshold (r_prox) for wall-grazing boost
  readonly boostProximityExponent: number; // Exponent for proximity scaling
  readonly boostDeceleration: number;   // Smooth speed deceleration rate when leaving boost
  readonly boostLerpSpeed: number;       // Interpolation speed for boost ramp-up/down

  // Trail & visuals
  readonly trailMaxLength: number;
  readonly trailFadeDuration: number;
  readonly cameraLerp: number;
  readonly cameraZoom: number;
  readonly wallColor: number;
  readonly shipColor: number;
  readonly boostColor: number;
  readonly trailColor: number;
  readonly trailBoostColor: number;
  readonly startZoneColor: number;
  readonly finishZoneColor: number;
  readonly bloomStrength: number;
}

export const GAME_CONFIG: GameConfig = {
  width: 1280,
  height: 720,
  worldWidth: 4200,
  worldHeight: 3200,
  shipSize: 14,
  shipRadius: 7,

  // Accelerations calibrated for responsive high-speed Game Feel
  thrustForce: 0.00065,
  rotationSpeed: 0.062,
  boostForce: 0.0016,

  frictionAir: 0.02,
  brakeFrictionAir: 0.15,
  maxSpeed: 7.0,
  maxBoostSpeed: 14.5,

  // Frontal impact stun & elastic bounce (0.35s = 350ms)
  wallRecoilForce: 4.8,
  wallStunDuration: 350,

  // Wall-boost proximity settings
  boostProximityRadius: 65,
  boostProximityExponent: 1.0,
  boostDeceleration: 0.18,
  boostLerpSpeed: 0.14,

  // Visuals & aesthetics
  trailMaxLength: 100,
  trailFadeDuration: 550,
  cameraLerp: 0.08,
  cameraZoom: 1.0,

  wallColor: 0x00f0ff,
  shipColor: 0x00e5ff,
  boostColor: 0xff007f,
  trailColor: 0x00d4ff,
  trailBoostColor: 0xff007f,
  startZoneColor: 0x00ff88,
  finishZoneColor: 0xff2255,
  bloomStrength: 1.4,
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
    backgroundColor: "#030308",
    parent: document.body,
    physics: {
      default: "matter",
      matter: {
        gravity: { x: 0, y: 0 },
        runner: {
          fps: 60,
          delta: 1000 / 60,
          isFixed: true,
        } as Phaser.Types.Physics.Matter.MatterRunnerConfig & { isFixed?: boolean },
        autoUpdate: true,
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
