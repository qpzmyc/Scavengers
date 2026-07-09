import type { PlayerId } from './types';

export const GRID_SIZE = 11;

export const MAX_ENERGY = 5;
export const START_ENERGY = 5;
export const MAX_AMMO = 3;
export const START_AMMO = 1;

export const MOVE_ENERGY_COST_PER_TILE = 1;
export const MAX_MOVE_TILES = 2;
export const REST_ENERGY_GAIN = 3;
export const ENERGY_PICKUP_VALUE = 5;

export const PHANTOM_ENERGY_COST = 2;

export const ATTACK_ENERGY_COST = 1;
export const PUNCH_ENERGY_COST = 2;
export const SHOOT_AMMO_COST = 1;
export const BOMB_AMMO_COST = 2;
export const ATTACK_MAX_REPOSITION = 1;

export const ENERGY_PICKUP_COUNT = 4;
export const AMMO_PICKUP_COUNT = 3;
export const PICKUP_RESPAWN_PLIES = 4;

export const RESPAWN_IMMUNITY_TURNS = 2;
export const VISION_RADIUS = 7; // 2-player games
export const VISION_RADIUS_4P = 5; // 4-player games get a tighter view (the board is more crowded)

// Vision radius for a game with `playerCount` players.
export function visionRadiusForCount(playerCount: number): number {
  return playerCount >= 4 ? VISION_RADIUS_4P : VISION_RADIUS;
}

export const DEFAULT_DEATH_CAP = 3;
export const DEFAULT_TARGET_SCORE = 30;
export const KILL_SCORE = 5;
export const DEATH_SCORE = -3;
export const STREAK_SCORE_PER_TURN = 1;

export const CORNER_ZONES: Record<PlayerId, { x0: number; y0: number }> = {
  p1: { x0: 0, y0: 0 },
  p2: { x0: GRID_SIZE - 2, y0: GRID_SIZE - 2 },
  p3: { x0: GRID_SIZE - 2, y0: 0 },
  p4: { x0: 0, y0: GRID_SIZE - 2 },
};
