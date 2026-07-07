import type { GameState, PlayerId, Position } from './types';
import { isInBounds, isWall, getTile } from './board';
import { MAX_MOVE_TILES, MOVE_ENERGY_COST_PER_TILE, REST_ENERGY_GAIN, ENERGY_PICKUP_VALUE, MAX_ENERGY, MAX_AMMO } from './constants';

function isAdjacentStep(from: Position, to: Position): boolean {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  return dx <= 1 && dy <= 1 && (dx !== 0 || dy !== 0);
}

export function movePlayer(state: GameState, playerId: PlayerId, path: Position[]): GameState {
  if (path.length === 0 || path.length > MAX_MOVE_TILES) {
    throw new Error(`Path must be 1-${MAX_MOVE_TILES} tiles, got ${path.length}`);
  }

  const player = state.players[playerId];
  const energyCost = path.length * MOVE_ENERGY_COST_PER_TILE;
  if (player.energy < energyCost) {
    throw new Error('Not enough energy for this move');
  }

  let cursor = player.position;
  for (const step of path) {
    if (!isAdjacentStep(cursor, step)) {
      throw new Error(`Step from (${cursor.x},${cursor.y}) to (${step.x},${step.y}) is not adjacent`);
    }
    if (!isInBounds(step)) {
      throw new Error(`Step (${step.x},${step.y}) is out of bounds`);
    }
    if (isWall(state.board, step)) {
      throw new Error(`Step (${step.x},${step.y}) is blocked by a wall`);
    }
    cursor = step;
  }

  const finalPos = cursor;
  const board = state.board.map((row) => row.slice());
  let energy = player.energy - energyCost;
  let ammo = player.ammo;

  const landedTile = getTile(board, finalPos);
  if (landedTile.type === 'energyPickup') {
    energy = Math.min(MAX_ENERGY, energy + ENERGY_PICKUP_VALUE);
    board[finalPos.y][finalPos.x] = { type: 'empty' };
  } else if (landedTile.type === 'ammoPickup') {
    ammo = Math.min(MAX_AMMO, ammo + 1);
    board[finalPos.y][finalPos.x] = { type: 'empty' };
  }

  return {
    ...state,
    board,
    players: {
      ...state.players,
      [playerId]: { ...player, position: finalPos, energy, ammo },
    },
  };
}

export function restPlayer(state: GameState, playerId: PlayerId): GameState {
  const player = state.players[playerId];
  const energy = Math.min(MAX_ENERGY, player.energy + REST_ENERGY_GAIN);
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...player, energy },
    },
  };
}
