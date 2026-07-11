import { describe, it, expect } from 'vitest';
import { createInitialGameState } from './state';
import { fakeMove, clearPhantom, realOccupantsAt, spawnOwnerAt } from './phantom';
import { GRID_SIZE } from './constants';
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

  it('throws when the phantom would land on an enemy displayed phantom tile', () => {
    let state = createInitialGameState('lastStanding');
    // Put p2's real char at (2,0) with a phantom displayed at (1,0).
    state = {
      ...state,
      players: {
        ...state.players,
        p2: { ...state.players.p2, position: { x: 2, y: 0 }, isPhantom: true, phantomDisplayPosition: { x: 1, y: 0 } },
      },
    };
    // p1 at (0,0) fake-moves its phantom to (1,0) — onto p2's phantom → blocked.
    expect(() => fakeMove(state, 'p1', { x: 1, y: 0 })).toThrow('A phantom is already there');
  });

  it('allows the phantom to land on an enemy real tile (crush is resolved by the caller)', () => {
    let state = createInitialGameState('lastStanding');
    state = { ...state, players: { ...state.players, p2: { ...state.players.p2, position: { x: 1, y: 0 } } } };
    const next = fakeMove(state, 'p1', { x: 1, y: 0 });
    expect(next.players.p1.phantomDisplayPosition).toEqual({ x: 1, y: 0 });
    expect(realOccupantsAt(next, 'p1', { x: 1, y: 0 })).toEqual(['p2']);
  });
});

describe('realOccupantsAt', () => {
  it('returns enemies standing on the tile, excluding the actor and the dead', () => {
    let state = createInitialGameState('lastStanding');
    state = { ...state, players: { ...state.players, p2: { ...state.players.p2, position: { x: 3, y: 3 } } } };
    expect(realOccupantsAt(state, 'p1', { x: 3, y: 3 })).toEqual(['p2']);
    expect(realOccupantsAt(state, 'p1', { x: 4, y: 4 })).toEqual([]);
    const dead = { ...state, players: { ...state.players, p2: { ...state.players.p2, alive: false } } };
    expect(realOccupantsAt(dead, 'p1', { x: 3, y: 3 })).toEqual([]);
  });
});

describe('spawnOwnerAt', () => {
  it('identifies the 2×2 spawn zone each player owns, and null elsewhere', () => {
    const state = createInitialGameState('deathmatch', 2);
    const last = GRID_SIZE - 1;
    expect(spawnOwnerAt(state, { x: 0, y: 0 })).toBe('p1');
    expect(spawnOwnerAt(state, { x: 1, y: 1 })).toBe('p1');
    expect(spawnOwnerAt(state, { x: last, y: last })).toBe('p2');
    expect(spawnOwnerAt(state, { x: last - 1, y: last - 1 })).toBe('p2');
    expect(spawnOwnerAt(state, { x: 5, y: 5 })).toBeNull();
  });

  it('only reports zones owned by players actually in the match', () => {
    const state = createInitialGameState('deathmatch', 2); // p3/p4 not in turnOrder
    expect(spawnOwnerAt(state, { x: GRID_SIZE - 1, y: 0 })).toBeNull(); // p3's corner, but no p3
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
