import type { PlayerId } from './types';

export const GRID_SIZE = 11;

export const MAX_ENERGY = 5;
export const START_ENERGY = 5;
export const MAX_AMMO = 3;
export const START_AMMO = 1;

export const MOVE_ENERGY_COST_PER_TILE = 1;
export const MAX_MOVE_TILES = 2;
export const REST_ENERGY_GAIN = 2;
export const ENERGY_PICKUP_VALUE = 5;

export const ATTACK_ENERGY_COST = 1;
export const SHOOT_AMMO_COST = 1;
export const BOMB_AMMO_COST = 3;

export const RESPAWN_IMMUNITY_TURNS = 2;
export const VISION_RADIUS = 9;

export const DEFAULT_DEATH_CAP = 3;
export const DEFAULT_TARGET_SCORE = 30;
export const KILL_SCORE = 5;
export const DEATH_SCORE = -3;
export const STREAK_SCORE_PER_TURN = 1;

export const CORNER_ZONES: Record<PlayerId, { x0: number; y0: number }> = {
  p1: { x0: 0, y0: 0 },
  p2: { x0: GRID_SIZE - 2, y0: GRID_SIZE - 2 },
};
