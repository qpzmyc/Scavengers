import type { PlayerId } from './types';

export const GRID_SIZE = 11;

export const MAX_ENERGY = 5;
export const START_ENERGY = 5;
export const MAX_AMMO = 3;
export const START_AMMO = 1;

export const MOVE_ENERGY_COST_PER_TILE = 1;
export const MAX_MOVE_TILES_DEFAULT = 2;
export const MAX_MOVE_TILES_2P = 3; // 2-player games get an extra step of mobility
export const REST_ENERGY_GAIN = 3;

// Max move-path length for a game with `playerCount` players.
export function maxMoveTilesForCount(playerCount: number): number {
  return playerCount === 2 ? MAX_MOVE_TILES_2P : MAX_MOVE_TILES_DEFAULT;
}
export const ENERGY_PICKUP_VALUE = 5;

export const PHANTOM_ENERGY_COST = 2;

export const ATTACK_ENERGY_COST = 1;
export const PUNCH_ENERGY_COST = 2;
export const SHOOT_AMMO_COST = 1;
export const BOMB_AMMO_COST = 2;
export const ATTACK_MAX_REPOSITION = 1;

export const ENERGY_PICKUP_COUNT = 4;
export const AMMO_PICKUP_COUNT_DEFAULT = 3; // 2-player games
export const AMMO_PICKUP_COUNT_4P = 4; // 4-player games

// Ammo pickup count for a game with `playerCount` players.
export function ammoPickupCountForCount(playerCount: number): number {
  return playerCount >= 4 ? AMMO_PICKUP_COUNT_4P : AMMO_PICKUP_COUNT_DEFAULT;
}

export const PICKUP_RESPAWN_PLIES = 4;

export const RESPAWN_IMMUNITY_TURNS = 2;
export const VISION_RADIUS = 7; // 2-player games
export const VISION_RADIUS_4P = 5; // 4-player games get a tighter view (the board is more crowded)

// Vision radius for a game with `playerCount` players.
export function visionRadiusForCount(playerCount: number): number {
  return playerCount >= 4 ? VISION_RADIUS_4P : VISION_RADIUS;
}

export const DEFAULT_DEATH_CAP = 3;
export const DEFAULT_TARGET_SCORE = 25;

// Configurable ranges for the pre-game settings slider.
export const MIN_TARGET_SCORE = 10;
export const MAX_TARGET_SCORE = 60;
export const TARGET_SCORE_STEP = 5;
export const MIN_DEATH_CAP = 1;
export const MAX_DEATH_CAP = 6;

// Per-player-count defaults. Kept as functions of playerCount so the per-count logic
// stays in place, but for now both 2p and 4p default to the same 30 points / 3 lives.
export function defaultTargetScoreForCount(playerCount: number): number {
  return playerCount >= 4 ? 30 : 30;
}
export function defaultDeathCapForCount(playerCount: number): number {
  return playerCount >= 4 ? 3 : 3;
}
export const KILL_SCORE = 5;
export const DEATH_SCORE = -3;
export const STREAK_SCORE_PER_TURN = 1;

export const CORNER_ZONES: Record<PlayerId, { x0: number; y0: number }> = {
  p1: { x0: 0, y0: 0 },
  p2: { x0: GRID_SIZE - 2, y0: GRID_SIZE - 2 },
  p3: { x0: GRID_SIZE - 2, y0: 0 },
  p4: { x0: 0, y0: GRID_SIZE - 2 },
};
