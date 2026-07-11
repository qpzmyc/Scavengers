import type { GameState, PlayerId, Position } from './types';
import { isInBounds, isWall, getTile } from './board';
import { maxMoveTilesForCount, MOVE_ENERGY_COST_PER_TILE, REST_ENERGY_GAIN, ENERGY_PICKUP_VALUE, MAX_ENERGY, MAX_AMMO, GRID_SIZE, PICKUP_RESPAWN_PLIES } from './constants';

function isAdjacentStep(from: Position, to: Position): boolean {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  return dx <= 1 && dy <= 1 && (dx !== 0 || dy !== 0);
}

export function movePlayer(state: GameState, playerId: PlayerId, path: Position[]): GameState {
  const maxTiles = maxMoveTilesForCount(state.turnOrder.length);
  if (path.length === 0 || path.length > maxTiles) {
    throw new Error(`Path must be 1-${maxTiles} tiles, got ${path.length}`);
  }

  const player = state.players[playerId];

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
  let energy = player.energy;
  let ammo = player.ammo;

  let pendingPickups = state.pendingPickups;
  for (const step of path) {
    if (energy < MOVE_ENERGY_COST_PER_TILE) {
      throw new Error('Not enough energy for this move');
    }
    energy -= MOVE_ENERGY_COST_PER_TILE;

    const tile = getTile(board, step);
    if (tile.type === 'energyPickup') {
      energy = Math.min(MAX_ENERGY, energy + ENERGY_PICKUP_VALUE);
      board[step.y][step.x] = { type: 'empty' };
      pendingPickups = [...pendingPickups, { type: 'energyPickup', pliesRemaining: PICKUP_RESPAWN_PLIES }];
    } else if (tile.type === 'bonusEnergyPickup') {
      // A one-shot corner bonus: gives the same energy, but doesn't queue a
      // respawn ticket — it's outside the normal pendingPickups ring cycle.
      energy = Math.min(MAX_ENERGY, energy + ENERGY_PICKUP_VALUE);
      board[step.y][step.x] = { type: 'empty' };
    } else if (tile.type === 'ammoPickup') {
      ammo = Math.min(MAX_AMMO, ammo + 1);
      board[step.y][step.x] = { type: 'empty' };
      pendingPickups = [...pendingPickups, { type: 'ammoPickup', pliesRemaining: PICKUP_RESPAWN_PLIES }];
    }
  }

  // A phantom follows the player, keeping its accumulated offset (clamped on-board).
  let phantomDisplayPosition = player.phantomDisplayPosition;
  if (player.isPhantom && phantomDisplayPosition) {
    const dx = finalPos.x - player.position.x;
    const dy = finalPos.y - player.position.y;
    const clamp = (v: number) => Math.max(0, Math.min(GRID_SIZE - 1, v));
    phantomDisplayPosition = {
      x: clamp(phantomDisplayPosition.x + dx),
      y: clamp(phantomDisplayPosition.y + dy),
    };
  }

  return {
    ...state,
    board,
    pendingPickups,
    players: {
      ...state.players,
      [playerId]: { ...player, position: finalPos, energy, ammo, phantomDisplayPosition },
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
