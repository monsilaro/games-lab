// All tuning lives here. Tweak, push, replay.

// "Aurora borealis" palette — the orange warmth belongs to the player (and
// their projectiles) ONLY; everything else stays cold.
export const PALETTE = {
  night: 0x0a1128, // map background
  wall: 0x1c2541, // bounds walls
  player: 0xff9f1c, // ember orange — the ONLY warm color
  projectile: 0xffd166, // warm yellow-white
  chaser: 0x2ec4b6, // aurora green
  runner: 0x9d4edd, // aurora violet
  gem: 0xcaf0f8, // ice cyan
  flash: 0xffffff, // 1-frame hit flash
  snow: 0xffffff, // static ground dots
} as const;

// view / camera
export const WORLD_HEIGHT = 13; // world units visible vertically
export const CAMERA_LERP = 6; // follow smoothing, 1/s
export const SHAKE_DURATION = 0.25; // s
export const SHAKE_MAGNITUDE = 0.18; // world units
export const MAX_DT = 0.05; // clamp delta time (background tab, hiccups), s

// map (~3-4 screens of roaming on an iPhone in portrait)
export const MAP_WIDTH = 24; // world units
export const MAP_HEIGHT = 30;
export const WALL_THICKNESS = 0.5;
export const SNOW_DOT_COUNT = 90; // sells camera motion on the flat ground

// player
export const PLAYER_RADIUS = 0.42;
export const PLAYER_BASE = {
  maxHp: 100,
  moveSpeed: 4.2, // units/s
  damage: 12, // per projectile
  fireInterval: 0.55, // s between shots
  projectileSpeed: 10, // units/s
  attackRange: 7, // max auto-aim distance
  magnetRadius: 1.6, // gem attraction radius
} as const;
export const INVULN_TIME = 0.9; // s of post-hit invincibility
export const BLINK_HZ = 9; // invincibility blink speed
export const KNOCKBACK_PLAYER = 7; // impulse on the player when hit, units/s
export const KNOCKBACK_ENEMY = 5; // impulse on the enemy that hit, units/s
export const KNOCKBACK_DECAY = 9; // exp decay rate, 1/s

export interface PlayerStats {
  maxHp: number;
  hp: number;
  moveSpeed: number;
  damage: number;
  fireInterval: number;
  projectileSpeed: number;
  attackRange: number;
  magnetRadius: number;
}

export function basePlayerStats(): PlayerStats {
  return { ...PLAYER_BASE, hp: PLAYER_BASE.maxHp };
}

// upgrades (one picked per level up, out of 3 random cards)
export const UPGRADE_VALUES = {
  damageMult: 1.3,
  fireIntervalMult: 0.85,
  moveSpeedMult: 1.12,
  maxHpBonus: 25,
  healAmount: 50,
  magnetMult: 1.35,
} as const;

// projectiles
export const PROJECTILE_RADIUS = 0.13;
export const PROJECTILE_POOL = 48;
export const TRAIL_LENGTH = 3; // fading sprites behind each projectile

// enemies
export interface EnemyStats {
  hp: number;
  speed: number;
  damage: number;
  radius: number;
  xp: number; // gem value dropped on death
}
export const CHASER: EnemyStats = { hp: 34, speed: 1.7, damage: 12, radius: 0.45, xp: 2 };
export const RUNNER: EnemyStats = { hp: 12, speed: 3.6, damage: 7, radius: 0.3, xp: 1 };
export const ENEMY_POOL = 80;
export const ENEMY_SEPARATION = 6; // push-apart rate so the horde doesn't stack

// waves
export const WAVE_BASE_COUNT = 6; // enemies in wave 1
export const WAVE_COUNT_GROWTH = 3; // +enemies per wave
export const WAVE_HP_GROWTH = 0.15; // +enemy hp per wave (fraction)
export const RUNNER_CHANCE_BASE = 0.12;
export const RUNNER_CHANCE_GROWTH = 0.06; // per wave
export const RUNNER_CHANCE_MAX = 0.6;
export const SPAWN_INTERVAL = 0.35; // s between spawns within a wave
export const WAVE_BREAK = 1.6; // s pause between waves

// gems / xp
export const GEM_POOL = 100;
export const GEM_RADIUS = 0.16;
export const GEM_COLLECT_DIST = 0.45;
export const GEM_FLY_SPEED = 9; // units/s once magnetized
export const XP_BASE = 6; // xp needed for level 2
export const XP_GROWTH = 4; // +xp needed per level

// particles (enemy death bursts)
export const PARTICLE_POOL = 64;
export const DEATH_BURST = 5; // particles per enemy death
export const PARTICLE_SPEED = 4; // units/s
export const PARTICLE_LIFE = 0.45; // s

// juice
export const HIT_FLASH_TIME = 0.06; // s — white flash + scale punch on hit

// input
export const JOYSTICK_RADIUS_PX = 54; // matches the base circle in index.html
export const JOYSTICK_DEADZONE = 0.18; // fraction of the radius
