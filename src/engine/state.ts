import type { GameState, GameMode, PlayerState, PlayerId, PlayerColor } from './types';
import { buildBoard } from './board';
import {
  START_ENERGY,
  START_AMMO,
  CORNER_ZONES,
  defaultDeathCapForCount,
  defaultTargetScoreForCount,
} from './constants';

const ALL_PLAYER_IDS: PlayerId[] = ['p1', 'p2', 'p3', 'p4'];
const PLAYER_COLORS: Record<PlayerId, PlayerColor> = {
  p1: 'green',
  p2: 'red',
  p3: 'blue',
  p4: 'yellow',
};

// Turn order walks the four spawn corners around the perimeter of the map
// (top-left -> top-right -> bottom-right -> bottom-left) instead of jumping
// diagonally across it, so each handoff passes to a neighboring corner.
const TURN_ORDER_BY_COUNT: Record<number, PlayerId[]> = {
  2: ['p1', 'p2'],
  4: ['p1', 'p3', 'p2', 'p4'],
};

// Offset within the 2x2 spawn zone of the tile that sits at the actual outer
// corner of the map (e.g. p2's zone is the bottom-right 2x2 block, but the
// true map corner is its bottom-right tile, not its top-left one).
const CORNER_OFFSET_IN_ZONE: Record<PlayerId, { dx: number; dy: number }> = {
  p1: { dx: 0, dy: 0 },
  p2: { dx: 1, dy: 1 },
  p3: { dx: 1, dy: 0 },
  p4: { dx: 0, dy: 1 },
};

function createPlayer(id: PlayerId, color: PlayerState['color'], eliminated: boolean): PlayerState {
  const cornerZone = CORNER_ZONES[id];
  const offset = CORNER_OFFSET_IN_ZONE[id];
  return {
    id,
    color,
    position: { x: cornerZone.x0 + offset.dx, y: cornerZone.y0 + offset.dy },
    energy: START_ENERGY,
    ammo: START_AMMO,
    alive: !eliminated,
    isPhantom: false,
    phantomDisplayPosition: null,
    immuneTurns: 0,
    deaths: 0,
    kills: 0,
    currentStreak: 0,
    longestStreak: 0,
    score: 0,
    cornerZone,
    eliminated,
  };
}

export function createInitialGameState(
  mode: GameMode,
  playerCount: number = 2,
  options?: { deathCap?: number; targetScore?: number },
): GameState {
  const turnOrder = TURN_ORDER_BY_COUNT[playerCount] ?? ALL_PLAYER_IDS.slice(0, playerCount);

  const players = {} as Record<PlayerId, PlayerState>;
  for (const id of ALL_PLAYER_IDS) {
    const inPlay = turnOrder.includes(id);
    players[id] = createPlayer(id, PLAYER_COLORS[id], !inPlay);
  }

  return {
    board: buildBoard(playerCount),
    players,
    turnOrder,
    currentTurn: 'p1',
    mode,
    winner: null,
    draw: null,
    deathCap: options?.deathCap ?? defaultDeathCapForCount(playerCount),
    targetScore: options?.targetScore ?? defaultTargetScoreForCount(playerCount),
    pendingPickups: [],
    pendingCornerPickups: [],
  };
}
