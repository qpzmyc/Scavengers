import type { GameState, PlayerId, Position } from './types';
import { isInBounds } from './board';

export function fakeMove(state: GameState, playerId: PlayerId, direction: Position): GameState {
  const player = state.players[playerId];
  const displayPos: Position = { x: player.position.x + direction.x, y: player.position.y + direction.y };
  if (!isInBounds(displayPos)) {
    throw new Error(`Fake move display position (${displayPos.x},${displayPos.y}) is out of bounds`);
  }
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...player, isPhantom: true, phantomDisplayPosition: displayPos },
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
