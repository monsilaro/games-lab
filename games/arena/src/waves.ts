import * as C from './config';
import type { EnemyType } from './entities';

function edgePosition(): { x: number; y: number } {
  const halfW = C.MAP_WIDTH / 2 - 0.6;
  const halfH = C.MAP_HEIGHT / 2 - 0.6;
  const side = Math.floor(Math.random() * 4);
  const tx = (Math.random() * 2 - 1) * halfW;
  const ty = (Math.random() * 2 - 1) * halfH;
  switch (side) {
    case 0: return { x: tx, y: halfH };
    case 1: return { x: tx, y: -halfH };
    case 2: return { x: halfW, y: ty };
    default: return { x: -halfW, y: ty };
  }
}

/**
 * Wave N spawns its enemies one by one from the map edges; the next wave
 * starts (after a short break) once everything is dead.
 */
export class WaveManager {
  wave = 0;
  private toSpawn = 0;
  private spawnTimer = 0;
  private breakTimer = 0;
  private inBreak = true;

  reset(): void {
    this.wave = 0;
    this.toSpawn = 0;
    this.spawnTimer = 0;
    this.breakTimer = 1.0; // breathe before wave 1
    this.inBreak = true;
  }

  /**
   * @returns the wave number when a new wave just started, otherwise null.
   */
  update(
    dt: number,
    aliveEnemies: number,
    spawn: (type: EnemyType, x: number, y: number, hpMult: number) => void,
  ): number | null {
    if (this.inBreak) {
      this.breakTimer -= dt;
      if (this.breakTimer <= 0) {
        this.wave += 1;
        this.toSpawn = C.WAVE_BASE_COUNT + (this.wave - 1) * C.WAVE_COUNT_GROWTH;
        this.spawnTimer = 0;
        this.inBreak = false;
        return this.wave;
      }
      return null;
    }

    if (this.toSpawn > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = C.SPAWN_INTERVAL;
        this.toSpawn -= 1;
        const runnerChance = Math.min(
          C.RUNNER_CHANCE_BASE + this.wave * C.RUNNER_CHANCE_GROWTH,
          C.RUNNER_CHANCE_MAX,
        );
        const type: EnemyType = Math.random() < runnerChance ? 'runner' : 'chaser';
        const pos = edgePosition();
        spawn(type, pos.x, pos.y, 1 + (this.wave - 1) * C.WAVE_HP_GROWTH);
      }
    } else if (aliveEnemies === 0) {
      this.inBreak = true;
      this.breakTimer = C.WAVE_BREAK;
    }
    return null;
  }
}
