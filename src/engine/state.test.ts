import { describe, it, expect } from 'vitest';
import { createInitialGameState } from './state';
import { START_ENERGY, START_AMMO, defaultDeathCapForCount, defaultTargetScoreForCount } from './constants';

describe('createInitialGameState', () => {
  it('sets both players to full energy and starting ammo', () => {
    const state = createInitialGameState('lastStanding');
    expect(state.players.p1.energy).toBe(START_ENERGY);
    expect(state.players.p1.ammo).toBe(START_AMMO);
    expect(state.players.p2.energy).toBe(START_ENERGY);
    expect(state.players.p2.ammo).toBe(START_AMMO);
  });

  it('places players at the true map corner of their spawn zone', () => {
    const state = createInitialGameState('lastStanding');
    expect(state.players.p1.position).toEqual({ x: 0, y: 0 });
    expect(state.players.p2.position).toEqual({ x: 10, y: 10 });
  });

  it('starts with p1 as current turn and no winner', () => {
    const state = createInitialGameState('lastStanding');
    expect(state.currentTurn).toBe('p1');
    expect(state.winner).toBeNull();
  });

  it('sets count-based defaults (2p: 5 lives / 20 pts)', () => {
    const lastStanding = createInitialGameState('lastStanding', 2);
    expect(lastStanding.deathCap).toBe(defaultDeathCapForCount(2));

    const deathmatch = createInitialGameState('deathmatch', 2);
    expect(deathmatch.targetScore).toBe(defaultTargetScoreForCount(2));
  });

  it('applies explicit deathCap/targetScore overrides', () => {
    const s = createInitialGameState('deathmatch', 4, { deathCap: 6, targetScore: 45 });
    expect(s.deathCap).toBe(6);
    expect(s.targetScore).toBe(45);
  });

  it('assigns green to p1 and red to p2', () => {
    const state = createInitialGameState('lastStanding');
    expect(state.players.p1.color).toBe('green');
    expect(state.players.p2.color).toBe('red');
  });
});
