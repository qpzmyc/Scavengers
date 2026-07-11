import type { GameState, Position, PendingPickup, PlayerId } from './types';
import { getTile } from './board';

function isCellFree(state: GameState, pos: Position): boolean {
  const tile = getTile(state.board, pos);
  if (tile.type !== 'empty') return false;
  for (const id of state.turnOrder) {
    const player = state.players[id];
    if (player.alive && player.position.x === pos.x && player.position.y === pos.y) {
      return false;
    }
  }
  return true;
}

export function getEnergyCandidateCells(state: GameState): Position[] {
  const cells: Position[] = [];
  for (let x = 3; x <= 7; x++) {
    for (let y = 3; y <= 7; y++) {
      if (x === 3 || x === 7 || y === 3 || y === 7) {
        const pos = { x, y };
        if (isCellFree(state, pos)) cells.push(pos);
      }
    }
  }
  return cells;
}

export function getAmmoCandidateCells(state: GameState): Position[] {
  const cells: Position[] = [];
  for (let x = 4; x <= 6; x++) {
    for (let y = 4; y <= 6; y++) {
      if (x === 5 && y === 5) continue;
      const pos = { x, y };
      if (isCellFree(state, pos)) cells.push(pos);
    }
  }
  return cells;
}

// The bonus energy pickup that sits in `playerId`'s corner of the central 5x5 (one of
// (3,3)/(7,3)/(3,7)/(7,7), matching their cornerZone). Placed fresh the instant a
// player respawns, ahead of their first turn back — entirely independent of the
// regular pendingPickups respawn cycle (see the 'bonusEnergyPickup' tile type), so
// it never interacts with or inflates the normal 4-pickup ring supply. Silently
// no-ops if another player is standing on that tile, or if a pickup (normal or a
// still-uncollected bonus from an earlier death) is already sitting there — a
// corner can hold at most one at a time, which is what actually bounds the total.
export function spawnRespawnCornerPickup(state: GameState, playerId: PlayerId): GameState {
  const zone = state.players[playerId].cornerZone;
  const pos: Position = { x: zone.x0 === 0 ? 3 : 7, y: zone.y0 === 0 ? 3 : 7 };
  for (const id of state.turnOrder) {
    const p = state.players[id];
    if (p.alive && p.position.x === pos.x && p.position.y === pos.y) return state;
  }
  const existingType = getTile(state.board, pos).type;
  if (existingType === 'energyPickup' || existingType === 'bonusEnergyPickup') return state;

  const board = state.board.map((row) => row.slice());
  board[pos.y][pos.x] = { type: 'bonusEnergyPickup' };
  return { ...state, board };
}

function pickRandom<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}

export function tickPickups(state: GameState): GameState {
  if (state.pendingPickups.length === 0) return state;

  let board = state.board;
  let boardCloned = false;
  const remaining: PendingPickup[] = [];

  for (const pending of state.pendingPickups) {
    const pliesRemaining = pending.pliesRemaining - 1;
    if (pliesRemaining > 0) {
      remaining.push({ ...pending, pliesRemaining });
      continue;
    }

    const candidates =
      pending.type === 'energyPickup'
        ? getEnergyCandidateCells({ ...state, board })
        : getAmmoCandidateCells({ ...state, board });
    const cell = pickRandom(candidates);

    if (!cell) {
      // No valid cell available right now; retry next tick.
      remaining.push({ ...pending, pliesRemaining: 0 });
      continue;
    }

    if (!boardCloned) {
      board = state.board.map((row) => row.slice());
      boardCloned = true;
    }
    board[cell.y][cell.x] = { type: pending.type };
    // entry is consumed (not pushed back to remaining)
  }

  return {
    ...state,
    board,
    pendingPickups: remaining,
  };
}
