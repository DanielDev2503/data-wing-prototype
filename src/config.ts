import Phaser from "phaser";

export interface GameConfig {
  readonly width: number;
  readonly height: number;
  readonly shipSize: number;
  readonly thrustForce: number;
  readonly rotationSpeed: number;
  readonly frictionAir: number;
  readonly boostMultiplier: number;
  readonly boostRayLength: number;
  readonly trailMaxLength: number;
  readonly trailFadeDuration: number;
  readonly wallColor: number;
  readonly shipColor: number;
  readonly boostColor: number;
  readonly trailColor: number;
  readonly bloomStrength: number;
}

export const GAME_CONFIG: GameConfig = {
  width: 1280,
  height: 720,
  shipSize: 18,
  thrustForce: 0.0012,
  rotationSpeed: 0.055,
  frictionAir: 0.015,
  boostMultiplier: 2.8,
  boostRayLength: 30,
  trailMaxLength: 60,
  trailFadeDuration: 400,
  wallColor: 0x00ffff,
  shipColor: 0xff00ff,
  boostColor: 0xffff00,
  trailColor: 0xff00ff,
  bloomStrength: 1.5,
};

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
