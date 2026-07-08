import type { GameState, GameMode, PlayerState, PlayerId, PlayerColor } from './types';
import { buildBoard } from './board';
import {
  START_ENERGY,
  START_AMMO,
  CORNER_ZONES,
  DEFAULT_DEATH_CAP,
  DEFAULT_TARGET_SCORE,
} from './constants';

const ALL_PLAYER_IDS: PlayerId[] = ['p1', 'p2', 'p3', 'p4'];
const PLAYER_COLORS: Record<PlayerId, PlayerColor> = {
  p1: 'green',
  p2: 'red',
  p3: 'blue',
  p4: 'yellow',
};

function createPlayer(id: PlayerId, color: PlayerState['color'], eliminated: boolean): PlayerState {
  const cornerZone = CORNER_ZONES[id];
  return {
    id,
    color,
    position: { x: cornerZone.x0, y: cornerZone.y0 },
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

export function createInitialGameState(mode: GameMode, playerCount: number = 2): GameState {
  const turnOrder = ALL_PLAYER_IDS.slice(0, playerCount);

  const players = {} as Record<PlayerId, PlayerState>;
  for (const id of ALL_PLAYER_IDS) {
    const inPlay = turnOrder.includes(id);
    players[id] = createPlayer(id, PLAYER_COLORS[id], !inPlay);
  }

  return {
    board: buildBoard(),
    players,
    turnOrder,
    currentTurn: 'p1',
    mode,
    winner: null,
    deathCap: DEFAULT_DEATH_CAP,
    targetScore: DEFAULT_TARGET_SCORE,
    pendingPickups: [],
  };
}
