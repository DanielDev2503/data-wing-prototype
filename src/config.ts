import Phaser from "phaser";

export interface GameConfig {
  readonly width: number;
  readonly height: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly shipSize: number;
  readonly shipRadius: number;
  readonly thrustForce: number;
  readonly rotationSpeed: number;
  readonly frictionAir: number;
  readonly brakeFrictionAir: number;
  readonly maxSpeed: number;
  readonly maxBoostSpeed: number;
  readonly wallRecoilForce: number;
  readonly wallStunDuration: number;
  readonly boostMaxMultiplier: number;
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
  thrustForce: 0.0008,
  rotationSpeed: 0.05,
  frictionAir: 0.008,
  brakeFrictionAir: 0.06,
  maxSpeed: 10,
  maxBoostSpeed: 15,
  wallRecoilForce: 0.004,
  wallStunDuration: 180,
  boostMaxMultiplier: 2.5,
  boostRayLength: 40,
  boostFadeRate: 0.04,
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
