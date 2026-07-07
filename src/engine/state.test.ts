import { describe, it, expect } from 'vitest';
import { createInitialGameState } from './state';
import { START_ENERGY, START_AMMO, DEFAULT_DEATH_CAP, DEFAULT_TARGET_SCORE } from './constants';

describe('createInitialGameState', () => {
  it('sets both players to full energy and starting ammo', () => {
    const state = createInitialGameState('lastStanding');
    expect(state.players.p1.energy).toBe(START_ENERGY);
    expect(state.players.p1.ammo).toBe(START_AMMO);
    expect(state.players.p2.energy).toBe(START_ENERGY);
    expect(state.players.p2.ammo).toBe(START_AMMO);
  });

  it('places players in their corner zones', () => {
    const state = createInitialGameState('lastStanding');
    expect(state.players.p1.position).toEqual({ x: 0, y: 0 });
    expect(state.players.p2.position).toEqual({ x: 9, y: 9 });
  });

  it('starts with p1 as current turn and no winner', () => {
    const state = createInitialGameState('lastStanding');
    expect(state.currentTurn).toBe('p1');
    expect(state.winner).toBeNull();
  });

  it('sets mode-specific defaults', () => {
    const lastStanding = createInitialGameState('lastStanding');
    expect(lastStanding.deathCap).toBe(DEFAULT_DEATH_CAP);

    const deathmatch = createInitialGameState('deathmatch');
    expect(deathmatch.targetScore).toBe(DEFAULT_TARGET_SCORE);
  });

  it('assigns green to p1 and red to p2', () => {
    const state = createInitialGameState('lastStanding');
    expect(state.players.p1.color).toBe('green');
    expect(state.players.p2.color).toBe('red');
  });
});
