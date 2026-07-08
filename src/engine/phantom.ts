import type { GameState, PlayerId, Position } from './types';
import { isInBounds } from './board';
import { PHANTOM_ENERGY_COST } from './constants';

export function fakeMove(state: GameState, playerId: PlayerId, direction: Position): GameState {
  const player = state.players[playerId];
  if (player.energy < PHANTOM_ENERGY_COST) {
    throw new Error('Not enough energy for a fake move');
  }
  // If a phantom already exists, keep accumulating the offset from its current
  // display position; otherwise the phantom starts one step from the real position.
  const base = player.isPhantom && player.phantomDisplayPosition ? player.phantomDisplayPosition : player.position;
  const displayPos: Position = { x: base.x + direction.x, y: base.y + direction.y };
  if (!isInBounds(displayPos)) {
    throw new Error(`Fake move display position (${displayPos.x},${displayPos.y}) is out of bounds`);
  }
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        isPhantom: true,
        phantomDisplayPosition: displayPos,
        energy: player.energy - PHANTOM_ENERGY_COST,
      },
    },
  };
}

export function clearPhantom(state: GameState, playerId: PlayerId): GameState {
  const player = state.players[playerId];
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...player, isPhantom: false, phantomDisplayPosition: null },
    },
  };
}
