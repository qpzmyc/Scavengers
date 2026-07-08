import { describe, it, expect } from 'vitest';
import { createInitialGameState } from './state';
import { movePlayer, restPlayer } from './movement';
import { fakeMove } from './phantom';
import { MAX_ENERGY, START_ENERGY } from './constants';

describe('movePlayer', () => {
  it('moves one tile and deducts 1 energy', () => {
    const state = createInitialGameState('lastStanding');
    const next = movePlayer(state, 'p1', [{ x: 1, y: 0 }]);
    expect(next.players.p1.position).toEqual({ x: 1, y: 0 });
    expect(next.players.p1.energy).toBe(START_ENERGY - 1);
  });

  it('moves two tiles and deducts 2 energy', () => {
    const state = createInitialGameState('lastStanding');
    const next = movePlayer(state, 'p1', [{ x: 1, y: 0 }, { x: 2, y: 0 }]);
    expect(next.players.p1.position).toEqual({ x: 2, y: 0 });
    expect(next.players.p1.energy).toBe(START_ENERGY - 2);
  });

  it('allows diagonal steps', () => {
    const state = createInitialGameState('lastStanding');
    const next = movePlayer(state, 'p1', [{ x: 1, y: 1 }]);
    expect(next.players.p1.position).toEqual({ x: 1, y: 1 });
  });

  it('rejects a path longer than 2 tiles', () => {
    const state = createInitialGameState('lastStanding');
    expect(() =>
      movePlayer(state, 'p1', [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }])
    ).toThrow();
  });

  it('rejects a non-adjacent step', () => {
    const state = createInitialGameState('lastStanding');
    expect(() => movePlayer(state, 'p1', [{ x: 5, y: 5 }])).toThrow();
  });

  it('rejects moving into a wall', () => {
    const state = createInitialGameState('lastStanding');
    // p1 starts at (0,0); walk it toward the (0,5)/(1,5) wall pair.
    let s = state;
    s = movePlayer(s, 'p1', [{ x: 0, y: 1 }, { x: 0, y: 2 }]);
    s = { ...s, players: { ...s.players, p1: { ...s.players.p1, energy: MAX_ENERGY } } };
    s = movePlayer(s, 'p1', [{ x: 0, y: 3 }, { x: 0, y: 4 }]);
    s = { ...s, players: { ...s.players, p1: { ...s.players.p1, energy: MAX_ENERGY } } };
    expect(() => movePlayer(s, 'p1', [{ x: 0, y: 5 }])).toThrow();
  });

  it('rejects moving without enough energy', () => {
    const state = createInitialGameState('lastStanding');
    const depleted = {
      ...state,
      players: { ...state.players, p1: { ...state.players.p1, energy: 0 } },
    };
    expect(() => movePlayer(depleted, 'p1', [{ x: 1, y: 0 }])).toThrow();
  });

  it('rejects a 2-tile move with 1 energy when no pickup funds the second step', () => {
    const state = createInitialGameState('lastStanding');
    const lowEnergy = {
      ...state,
      players: { ...state.players, p1: { ...state.players.p1, energy: 1 } },
    };
    expect(() => movePlayer(lowEnergy, 'p1', [{ x: 1, y: 0 }, { x: 2, y: 0 }])).toThrow();
  });

  it('allows a 2-tile move with 1 energy when the first tile is an energy pickup', () => {
    const state = createInitialGameState('lastStanding');
    const lowEnergy = {
      ...state,
      players: { ...state.players, p1: { ...state.players.p1, energy: 1, position: { x: 3, y: 4 } } },
    };
    // (3,3) is an energy pickup tile; step1 costs 1 -> 0, pickup grants +5 (capped) -> 5, step2 costs 1 -> 4.
    const next = movePlayer(lowEnergy, 'p1', [{ x: 3, y: 3 }, { x: 3, y: 2 }]);
    expect(next.players.p1.position).toEqual({ x: 3, y: 2 });
    expect(next.players.p1.energy).toBe(MAX_ENERGY - 1);
    expect(next.board[3][3].type).toBe('empty');
  });

  it('carries an active phantom along with the move, preserving its offset', () => {
    const state = createInitialGameState('lastStanding');
    const phantom = fakeMove(state, 'p1', { x: 1, y: 0 }); // real (0,0), phantom (1,0)
    const next = movePlayer(phantom, 'p1', [{ x: 0, y: 1 }, { x: 1, y: 1 }]); // moves +1,+1
    expect(next.players.p1.position).toEqual({ x: 1, y: 1 });
    expect(next.players.p1.phantomDisplayPosition).toEqual({ x: 2, y: 1 });
    expect(next.players.p1.isPhantom).toBe(true);
  });

  it('picks up an energy tile, granting +5 capped at max, and clears the tile', () => {
    const state = createInitialGameState('lastStanding');
    const lowEnergy = {
      ...state,
      players: { ...state.players, p1: { ...state.players.p1, energy: 1, position: { x: 3, y: 4 } } },
    };
    // (3,3) is an energy pickup tile per board layout.
    const next = movePlayer(lowEnergy, 'p1', [{ x: 3, y: 3 }]);
    expect(next.players.p1.energy).toBe(MAX_ENERGY);
    expect(next.board[3][3].type).toBe('empty');
  });

  it('picks up an ammo tile and increments ammo', () => {
    const state = createInitialGameState('lastStanding');
    // Force a deterministic ammo pickup at (4,4) regardless of the board's random central-3x3 placement.
    const board = state.board.map((row) => row.slice());
    board[4][4] = { type: 'ammoPickup' };
    const positioned = {
      ...state,
      board,
      players: { ...state.players, p1: { ...state.players.p1, position: { x: 4, y: 3 }, energy: MAX_ENERGY } },
    };
    const next = movePlayer(positioned, 'p1', [{ x: 4, y: 4 }]);
    expect(next.players.p1.ammo).toBe(state.players.p1.ammo + 1);
    expect(next.board[4][4].type).toBe('empty');
  });

  it('collects pickups from every tile stepped on, not just the final tile', () => {
    const state = createInitialGameState('lastStanding');
    const board = state.board.map((row) => row.slice());
    board[4][3] = { type: 'energyPickup' };
    board[4][4] = { type: 'ammoPickup' };
    const positioned = {
      ...state,
      board,
      players: {
        ...state.players,
        p1: { ...state.players.p1, position: { x: 2, y: 4 }, energy: 2, ammo: 0 },
      },
    };
    const next = movePlayer(positioned, 'p1', [{ x: 3, y: 4 }, { x: 4, y: 4 }]);
    // step1 costs 1 (2->1), energy pickup grants +5 capped at MAX_ENERGY (1->5),
    // step2 costs 1 (5->4), then ammo pickup grants +1 ammo.
    expect(next.players.p1.energy).toBe(MAX_ENERGY - 1);
    expect(next.players.p1.ammo).toBe(1);
    expect(next.board[4][3].type).toBe('empty');
    expect(next.board[4][4].type).toBe('empty');
    expect(next.pendingPickups).toHaveLength(2);
    expect(next.pendingPickups.map((p) => p.type).sort()).toEqual(['ammoPickup', 'energyPickup']);
  });

  it('enqueues a pending pickup respawn when an energy tile is collected', () => {
    const state = createInitialGameState('lastStanding');
    const lowEnergy = {
      ...state,
      players: { ...state.players, p1: { ...state.players.p1, energy: 1, position: { x: 3, y: 4 } } },
    };
    const next = movePlayer(lowEnergy, 'p1', [{ x: 3, y: 3 }]);
    expect(next.pendingPickups).toHaveLength(1);
    expect(next.pendingPickups[0].type).toBe('energyPickup');
  });
});

describe('restPlayer', () => {
  it('grants +2 energy capped at max', () => {
    const state = createInitialGameState('lastStanding');
    const depleted = {
      ...state,
      players: { ...state.players, p1: { ...state.players.p1, energy: 1 } },
    };
    const next = restPlayer(depleted, 'p1');
    expect(next.players.p1.energy).toBe(3);
  });

  it('does not exceed max energy', () => {
    const state = createInitialGameState('lastStanding');
    const next = restPlayer(state, 'p1');
    expect(next.players.p1.energy).toBe(MAX_ENERGY);
  });
});
