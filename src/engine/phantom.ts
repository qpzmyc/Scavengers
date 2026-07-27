import type { GameState, PlayerId, Position } from './types';
import { isInBounds } from './board';
import { PHANTOM_ENERGY_COST, CORNER_ZONES } from './constants';

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
  // A phantom cannot be moved onto another player's displayed phantom tile.
  for (const id of state.turnOrder) {
    if (id === playerId) continue;
    const o = state.players[id];
    if (o.alive && !o.eliminated && o.isPhantom && o.phantomDisplayPosition
      && o.phantomDisplayPosition.x === displayPos.x && o.phantomDisplayPosition.y === displayPos.y) {
      throw new Error('A phantom is already there');
    }
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

// Enemies (not the actor, alive, not eliminated, not immune) whose REAL position
// sits on `pos`. A phantom landing here — via fake move, or by following the
// actor's real move — crushes them (a lucky/guessed kill, since the actor can't
// see hidden real positions).
//
// The `immuneTurns` check matches punch/shoot/bomb, which all gate on it too. It
// used to be missing here, so a player who had just respawned could be crushed
// straight through the immunity the UI was drawing a halo and a countdown badge
// for — and the very same tile would have refused an attack with an "is immune"
// toast. Respawn immunity has to mean the same thing for every kill path.
export function realOccupantsAt(state: GameState, actorId: PlayerId, pos: Position): PlayerId[] {
  return state.turnOrder.filter((id) => {
    if (id === actorId) return false;
    const o = state.players[id];
    return (
      o.alive && !o.eliminated && o.immuneTurns === 0 && o.position.x === pos.x && o.position.y === pos.y
    );
  });
}

// The player whose 2×2 spawn zone contains `pos`, or null. Only players actually in the
// match (turnOrder) own a zone. Walking a real character into an enemy's spawn destroys
// the intruder's phantom.
export function spawnOwnerAt(state: GameState, pos: Position): PlayerId | null {
  for (const id of state.turnOrder) {
    const z = CORNER_ZONES[id];
    if (pos.x >= z.x0 && pos.x <= z.x0 + 1 && pos.y >= z.y0 && pos.y <= z.y0 + 1) return id;
  }
  return null;
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
