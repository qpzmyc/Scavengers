import { describe, it, expect } from 'vitest';
import { createInitialGameState } from './state';
import { movePlayer } from './movement';
import { endTurn } from './turns';
import { tickPickups, getEnergyCandidateCells, getAmmoCandidateCells } from './pickups';
import { PICKUP_RESPAWN_PLIES } from './constants';

describe('pickup respawn system', () => {
  it('enqueues a pending pickup when collected', () => {
    const state = createInitialGameState('lastStanding');
    const positioned = {
      ...state,
      players: { ...state.players, p1: { ...state.players.p1, position: { x: 3, y: 4 } } },
    };
    const next = movePlayer(positioned, 'p1', [{ x: 3, y: 3 }]);
    expect(next.pendingPickups).toEqual([{ type: 'energyPickup', pliesRemaining: PICKUP_RESPAWN_PLIES }]);
  });

  it('places a replacement energy pickup on the 5x5 outer ring after PICKUP_RESPAWN_PLIES endTurn calls', () => {
    let state = createInitialGameState('lastStanding');
    state = {
      ...state,
      players: { ...state.players, p1: { ...state.players.p1, position: { x: 3, y: 4 } } },
    };
    state = movePlayer(state, 'p1', [{ x: 3, y: 3 }]);
    expect(state.board[3][3].type).toBe('empty');

    let acting: 'p1' | 'p2' = 'p1';
    for (let i = 0; i < PICKUP_RESPAWN_PLIES; i++) {
      state = endTurn(state, acting, false);
      acting = acting === 'p1' ? 'p2' : 'p1';
    }

    expect(state.pendingPickups).toEqual([]);

    let found = false;
    for (let x = 3; x <= 7; x++) {
      for (let y = 3; y <= 7; y++) {
        if (x === 3 || x === 7 || y === 3 || y === 7) {
          if (state.board[y][x].type === 'energyPickup') found = true;
        }
      }
    }
    expect(found).toBe(true);
  });

  it('places a replacement ammo pickup within the central 3x3 excluding (5,5)', () => {
    let state = createInitialGameState('lastStanding');
    state = {
      ...state,
      pendingPickups: [{ type: 'ammoPickup', pliesRemaining: 1 }],
    };
    const next = tickPickups(state);
    expect(next.pendingPickups).toEqual([]);

    let found: { x: number; y: number } | null = null;
    for (let x = 4; x <= 6; x++) {
      for (let y = 4; y <= 6; y++) {
        if (x === 5 && y === 5) continue;
        if (next.board[y][x].type === 'ammoPickup') found = { x, y };
      }
    }
    expect(found).not.toBeNull();
    expect(next.board[5][5].type).toBe('wall');
  });

  it('decrements pliesRemaining without placing anything before it reaches 0', () => {
    let state = createInitialGameState('lastStanding');
    state = {
      ...state,
      pendingPickups: [{ type: 'energyPickup', pliesRemaining: 3 }],
    };
    const next = tickPickups(state);
    expect(next.pendingPickups).toEqual([{ type: 'energyPickup', pliesRemaining: 2 }]);
  });

  it('getEnergyCandidateCells excludes cells occupied by alive players', () => {
    let state = createInitialGameState('lastStanding');
    state = {
      ...state,
      players: { ...state.players, p1: { ...state.players.p1, position: { x: 3, y: 3 } } },
    };
    const cells = getEnergyCandidateCells(state);
    expect(cells.some((c) => c.x === 3 && c.y === 3)).toBe(false);
  });

  it('getAmmoCandidateCells excludes the center wall', () => {
    const state = createInitialGameState('lastStanding');
    const cells = getAmmoCandidateCells(state);
    expect(cells.some((c) => c.x === 5 && c.y === 5)).toBe(false);
  });

  it('retains a pending pickup at pliesRemaining 0 if no valid cell is available', () => {
    let state = createInitialGameState('lastStanding');
    // Fill the entire central 3x3 (excluding center) with walls so no ammo cell is free.
    const board = state.board.map((row) => row.slice());
    for (let x = 4; x <= 6; x++) {
      for (let y = 4; y <= 6; y++) {
        if (x === 5 && y === 5) continue;
        board[y][x] = { type: 'wall' };
      }
    }
    state = {
      ...state,
      board,
      pendingPickups: [{ type: 'ammoPickup', pliesRemaining: 1 }],
    };
    const next = tickPickups(state);
    expect(next.pendingPickups).toEqual([{ type: 'ammoPickup', pliesRemaining: 0 }]);
  });
});
