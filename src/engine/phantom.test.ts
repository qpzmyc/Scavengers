import { describe, it, expect } from 'vitest';
import { createInitialGameState } from './state';
import { fakeMove, clearPhantom } from './phantom';
import { PHANTOM_ENERGY_COST, MAX_ENERGY } from './constants';

describe('fakeMove', () => {
  it('sets isPhantom true and a display position offset by direction, without moving', () => {
    const state = createInitialGameState('lastStanding');
    const next = fakeMove(state, 'p1', { x: 1, y: 0 });
    expect(next.players.p1.isPhantom).toBe(true);
    expect(next.players.p1.position).toEqual({ x: 0, y: 0 });
    expect(next.players.p1.phantomDisplayPosition).toEqual({ x: 1, y: 0 });
  });

  it('does not change ammo', () => {
    const state = createInitialGameState('lastStanding');
    const next = fakeMove(state, 'p1', { x: 1, y: 0 });
    expect(next.players.p1.ammo).toBe(state.players.p1.ammo);
  });

  it('deducts PHANTOM_ENERGY_COST energy on success', () => {
    const state = createInitialGameState('lastStanding');
    const next = fakeMove(state, 'p1', { x: 1, y: 0 });
    expect(next.players.p1.energy).toBe(MAX_ENERGY - PHANTOM_ENERGY_COST);
    expect(next.players.p1.energy).toBe(state.players.p1.energy - PHANTOM_ENERGY_COST);
  });

  it('throws if the display position would be out of bounds', () => {
    const state = createInitialGameState('lastStanding');
    expect(() => fakeMove(state, 'p1', { x: -1, y: 0 })).toThrow();
  });

  it('throws when energy is below PHANTOM_ENERGY_COST', () => {
    const state = createInitialGameState('lastStanding');
    const depleted = {
      ...state,
      players: { ...state.players, p1: { ...state.players.p1, energy: PHANTOM_ENERGY_COST - 1 } },
    };
    expect(() => fakeMove(depleted, 'p1', { x: 1, y: 0 })).toThrow('Not enough energy for a fake move');
  });

  it('accumulates the offset when a phantom already exists', () => {
    const state = createInitialGameState('lastStanding');
    let next = fakeMove(state, 'p1', { x: 1, y: 0 });
    next = fakeMove(next, 'p1', { x: 1, y: 1 });
    expect(next.players.p1.position).toEqual({ x: 0, y: 0 });
    expect(next.players.p1.phantomDisplayPosition).toEqual({ x: 2, y: 1 });
    expect(next.players.p1.energy).toBe(MAX_ENERGY - PHANTOM_ENERGY_COST * 2);
  });
});

describe('clearPhantom', () => {
  it('clears phantom state', () => {
    const state = createInitialGameState('lastStanding');
    const phantom = fakeMove(state, 'p1', { x: 1, y: 0 });
    const cleared = clearPhantom(phantom, 'p1');
    expect(cleared.players.p1.isPhantom).toBe(false);
    expect(cleared.players.p1.phantomDisplayPosition).toBeNull();
  });
});
