import { describe, it, expect } from 'vitest';
import { createInitialGameState } from './state';
import { checkWinCondition } from './winCondition';

describe('checkWinCondition - lastStanding', () => {
  it('returns null when nobody has hit the death cap', () => {
    const state = createInitialGameState('lastStanding');
    expect(checkWinCondition(state)).toBeNull();
  });

  it('returns the last remaining player id when all others are eliminated', () => {
    let state = createInitialGameState('lastStanding');
    state = { ...state, players: { ...state.players, p2: { ...state.players.p2, deaths: state.deathCap, eliminated: true, alive: false } } };
    expect(checkWinCondition(state)).toBe('p1');
  });

  it('returns null when a player hits the death cap but has not yet been eliminated', () => {
    let state = createInitialGameState('lastStanding');
    state = { ...state, players: { ...state.players, p2: { ...state.players.p2, deaths: state.deathCap } } };
    expect(checkWinCondition(state)).toBeNull();
  });
});

describe('checkWinCondition - deathmatch', () => {
  it('returns null when nobody has hit the target score', () => {
    const state = createInitialGameState('deathmatch');
    expect(checkWinCondition(state)).toBeNull();
  });

  it('returns the player id when they hit the target score', () => {
    let state = createInitialGameState('deathmatch');
    state = { ...state, players: { ...state.players, p1: { ...state.players.p1, score: state.targetScore } } };
    expect(checkWinCondition(state)).toBe('p1');
  });
});
