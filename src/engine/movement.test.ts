import { describe, it, expect } from 'vitest';
import { createInitialGameState } from './state';
import { movePlayer, restPlayer } from './movement';
import { MAX_ENERGY, START_ENERGY, REST_ENERGY_GAIN, ENERGY_PICKUP_VALUE } from './constants';

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
    const positioned = {
      ...state,
      players: { ...state.players, p1: { ...state.players.p1, position: { x: 4, y: 3 }, energy: MAX_ENERGY } },
    };
    // (4,4) is an ammo pickup tile per board layout.
    const next = movePlayer(positioned, 'p1', [{ x: 4, y: 4 }]);
    expect(next.players.p1.ammo).toBe(state.players.p1.ammo + 1);
    expect(next.board[4][4].type).toBe('empty');
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
