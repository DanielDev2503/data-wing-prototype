import Phaser from "phaser";
import { createPhaserConfig } from "./config";
import { GameScene } from "./scenes/GameScene";

// Initialize game instance with WebGL renderer & Scale.FIT
new Phaser.Game(createPhaserConfig(GameScene));
