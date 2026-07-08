import type { GameState, PlayerId } from './types';
import { RESPAWN_IMMUNITY_TURNS, START_ENERGY, START_AMMO } from './constants';

export function respawnPlayer(state: GameState, playerId: PlayerId): GameState {
  const player = state.players[playerId];
  const zone = player.cornerZone;
  const position = {
    x: zone.x0 + Math.floor(Math.random() * 2),
    y: zone.y0 + Math.floor(Math.random() * 2),
  };
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        alive: true,
        position,
        immuneTurns: RESPAWN_IMMUNITY_TURNS,
        currentStreak: 0,
        energy: START_ENERGY,
        ammo: START_AMMO,
        // Dying clears any active phantom — a fresh respawn shouldn't drag a stale decoy along.
        isPhantom: false,
        phantomDisplayPosition: null,
      },
    },
  };
}

export function tickImmunity(state: GameState, playerId: PlayerId): GameState {
  const player = state.players[playerId];
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...player, immuneTurns: Math.max(0, player.immuneTurns - 1) },
    },
  };
}
