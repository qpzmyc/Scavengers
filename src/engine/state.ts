import { GameState, GameMode, PlayerState, PlayerId } from './types';
import { buildBoard } from './board';
import {
  START_ENERGY,
  START_AMMO,
  CORNER_ZONES,
  DEFAULT_DEATH_CAP,
  DEFAULT_TARGET_SCORE,
} from './constants';

function createPlayer(id: PlayerId, color: PlayerState['color']): PlayerState {
  const cornerZone = CORNER_ZONES[id];
  return {
    id,
    color,
    position: { x: cornerZone.x0, y: cornerZone.y0 },
    energy: START_ENERGY,
    ammo: START_AMMO,
    alive: true,
    isPhantom: false,
    phantomDisplayPosition: null,
    immuneTurns: 0,
    deaths: 0,
    kills: 0,
    currentStreak: 0,
    longestStreak: 0,
    score: 0,
    cornerZone,
  };
}

export function createInitialGameState(mode: GameMode): GameState {
  return {
    board: buildBoard(),
    players: {
      p1: createPlayer('p1', 'green'),
      p2: createPlayer('p2', 'red'),
    },
    currentTurn: 'p1',
    mode,
    winner: null,
    deathCap: DEFAULT_DEATH_CAP,
    targetScore: DEFAULT_TARGET_SCORE,
  };
}
