import Phaser from "phaser";
import { createPhaserConfig } from "./config";
import { GameScene } from "./scenes/GameScene";

const game = new Phaser.Game(createPhaserConfig(GameScene));

window.addEventListener("resize", () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});
