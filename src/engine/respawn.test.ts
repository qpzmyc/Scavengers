import { describe, it, expect } from 'vitest';
import { createInitialGameState } from './state';
import { respawnPlayer, tickImmunity } from './respawn';
import { RESPAWN_IMMUNITY_TURNS } from './constants';

describe('respawnPlayer', () => {
  it('revives the player with immunity and a position inside their corner zone', () => {
    let state = createInitialGameState('lastStanding');
    state = { ...state, players: { ...state.players, p2: { ...state.players.p2, alive: false, currentStreak: 5 } } };
    const next = respawnPlayer(state, 'p2');
    const p2 = next.players.p2;
    expect(p2.alive).toBe(true);
    expect(p2.immuneTurns).toBe(RESPAWN_IMMUNITY_TURNS);
    expect(p2.currentStreak).toBe(0);
    const zone = p2.cornerZone;
    expect(p2.position.x).toBeGreaterThanOrEqual(zone.x0);
    expect(p2.position.x).toBeLessThanOrEqual(zone.x0 + 1);
    expect(p2.position.y).toBeGreaterThanOrEqual(zone.y0);
    expect(p2.position.y).toBeLessThanOrEqual(zone.y0 + 1);
  });

  it('does not change longestStreak on respawn', () => {
    let state = createInitialGameState('lastStanding');
    state = { ...state, players: { ...state.players, p2: { ...state.players.p2, alive: false, longestStreak: 7 } } };
    const next = respawnPlayer(state, 'p2');
    expect(next.players.p2.longestStreak).toBe(7);
  });
});

describe('tickImmunity', () => {
  it('decrements immuneTurns by 1', () => {
    let state = createInitialGameState('lastStanding');
    state = { ...state, players: { ...state.players, p1: { ...state.players.p1, immuneTurns: 2 } } };
    const next = tickImmunity(state, 'p1');
    expect(next.players.p1.immuneTurns).toBe(1);
  });

  it('does not go below 0', () => {
    const state = createInitialGameState('lastStanding');
    const next = tickImmunity(state, 'p1');
    expect(next.players.p1.immuneTurns).toBe(0);
  });
});
