import type { GameState, Position, PendingPickup } from './types';
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
