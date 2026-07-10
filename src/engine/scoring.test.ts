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

  it('keeps score equal to the visible leaderboard columns after a death resets the streak', () => {
    // Reproduces the GREEN leaderboard bug: take a turn, die (streak banked + reset on
    // respawn), then take another turn. Score must equal Kills×5 + Deaths×−3 + Streak×1
    // using the *displayed* streak (longest consecutive run), not the raw turn count.
    let state = createInitialGameState('deathmatch');
    state = incrementStreakScore(state, 'p1');          // turn 1: currentStreak 1
    state = applyKillScoring(state, 'p2', 'p1');        // p1 dies: deaths 1, longestStreak banked to 1
    // Respawn resets the live streak, mirroring respawnPlayer.
    state = { ...state, players: { ...state.players, p1: { ...state.players.p1, currentStreak: 0 } } };
    state = incrementStreakScore(state, 'p1');          // turn 2: currentStreak 1

    const p1 = state.players.p1;
    const displayedStreak = Math.max(p1.longestStreak, p1.currentStreak);
    expect(p1.score).toBe(p1.kills * KILL_SCORE + p1.deaths * DEATH_SCORE + displayedStreak * STREAK_SCORE_PER_TURN);
    expect(p1.score).toBe(DEATH_SCORE + STREAK_SCORE_PER_TURN); // -3 + 1 = -2 (was -1 before the fix)
  });
});
