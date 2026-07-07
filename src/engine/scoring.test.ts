import { describe, it, expect } from 'vitest';
import { createInitialGameState } from './state';
import { applyKillScoring, incrementStreakScore } from './scoring';
import { KILL_SCORE, DEATH_SCORE, STREAK_SCORE_PER_TURN } from './constants';

describe('applyKillScoring', () => {
  it('credits the killer and debits the victim', () => {
    const state = createInitialGameState('deathmatch');
    const next = applyKillScoring(state, 'p1', 'p2');
    expect(next.players.p1.kills).toBe(1);
    expect(next.players.p1.score).toBe(KILL_SCORE);
    expect(next.players.p2.deaths).toBe(1);
    expect(next.players.p2.score).toBe(DEATH_SCORE);
  });

  it('banks the victim currentStreak into longestStreak', () => {
    let state = createInitialGameState('deathmatch');
    state = { ...state, players: { ...state.players, p2: { ...state.players.p2, currentStreak: 4, longestStreak: 2 } } };
    const next = applyKillScoring(state, 'p1', 'p2');
    expect(next.players.p2.longestStreak).toBe(4);
  });
});

describe('incrementStreakScore', () => {
  it('increments streak and adds streak score', () => {
    const state = createInitialGameState('deathmatch');
    const next = incrementStreakScore(state, 'p1');
    expect(next.players.p1.currentStreak).toBe(1);
    expect(next.players.p1.score).toBe(STREAK_SCORE_PER_TURN);
  });
});
