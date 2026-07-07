import { describe, it, expect } from 'vitest';
import { createInitialGameState } from './state';
import { fakeMove, clearPhantom } from './phantom';

describe('fakeMove', () => {
  it('sets isPhantom true and a display position offset by direction, without moving', () => {
    const state = createInitialGameState('lastStanding');
    const next = fakeMove(state, 'p1', { x: 1, y: 0 });
    expect(next.players.p1.isPhantom).toBe(true);
    expect(next.players.p1.position).toEqual({ x: 0, y: 0 });
    expect(next.players.p1.phantomDisplayPosition).toEqual({ x: 1, y: 0 });
  });

  it('does not change energy or ammo', () => {
    const state = createInitialGameState('lastStanding');
    const next = fakeMove(state, 'p1', { x: 1, y: 0 });
    expect(next.players.p1.energy).toBe(state.players.p1.energy);
    expect(next.players.p1.ammo).toBe(state.players.p1.ammo);
  });

  it('throws if the display position would be out of bounds', () => {
    const state = createInitialGameState('lastStanding');
    expect(() => fakeMove(state, 'p1', { x: -1, y: 0 })).toThrow();
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
