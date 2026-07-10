import type { GameState, PlayerId, PlayerState } from './types';
import { KILL_SCORE, DEATH_SCORE, STREAK_SCORE_PER_TURN } from './constants';

// Score is derived from the exact stats the leaderboard shows, so the columns always
// add up: Kills×5 + Deaths×−3 + Streak×1, where Streak is the displayed value (the
// longest run of consecutive turns alive — max of the peak and the live streak).
function computeScore(p: Pick<PlayerState, 'kills' | 'deaths' | 'longestStreak' | 'currentStreak'>): number {
  const streak = Math.max(p.longestStreak, p.currentStreak);
  return p.kills * KILL_SCORE + p.deaths * DEATH_SCORE + streak * STREAK_SCORE_PER_TURN;
}

export function applyKillScoring(state: GameState, killerId: PlayerId, victimId: PlayerId): GameState {
  const killer = state.players[killerId];
  const victim = state.players[victimId];
  const nextKiller = { ...killer, kills: killer.kills + 1 };
  const nextVictim = {
    ...victim,
    deaths: victim.deaths + 1,
    longestStreak: Math.max(victim.longestStreak, victim.currentStreak),
  };
  return {
    ...state,
    players: {
      ...state.players,
      [killerId]: { ...nextKiller, score: computeScore(nextKiller) },
      [victimId]: { ...nextVictim, score: computeScore(nextVictim) },
    },
  };
}

export function incrementStreakScore(state: GameState, playerId: PlayerId): GameState {
  const player = state.players[playerId];
  const next = { ...player, currentStreak: player.currentStreak + 1 };
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...next, score: computeScore(next) },
    },
  };
}
